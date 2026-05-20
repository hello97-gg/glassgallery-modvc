import http from 'http';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { pathToFileURL } from 'url';
import { createClient } from '@libsql/client';

// Load environment variables from .env manually
try {
  const envFile = fs.readFileSync('.env', 'utf-8');
  envFile.split(/\r?\n/).forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const index = trimmed.indexOf('=');
    if (index > 0) {
      const key = trimmed.substring(0, index).trim();
      const value = trimmed.substring(index + 1).trim();
      process.env[key] = value;
    }
  });
  console.log("✓ Loaded environment variables from .env file.");
} catch (err) {
  console.error("Could not read .env file:", err.message);
}

// Database setup for server-side SEO pre-rendering
const dbUrl = process.env.TURSO_DATABASE_URL;
const dbToken = process.env.TURSO_AUTH_TOKEN;
let db = null;
if (dbUrl) {
  try {
    db = createClient({
      url: dbUrl,
      authToken: dbToken
    });
    console.log("✓ Initialized Turso DB Client for Server-Side SEO Pre-rendering.");
  } catch (err) {
    console.error("Could not initialize Turso DB Client:", err.message);
  }
}

// Spawn Vite dev server on port 5173
const vite = spawn('npx', ['vite', '--port', '5173'], { stdio: 'inherit', shell: true });

// Listen for exit to clean up
process.on('exit', () => {
  vite.kill();
});

const server = http.createServer(async (req, res) => {
  // CORS Headers for APIs and development
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PATCH, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // 1. Handle API requests securely and mock Vercel serverless environment
  if (req.url.startsWith('/api/')) {
    const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost:3000'}`);
    const routeName = urlObj.pathname.split('/')[2].replace('.js', '');
    const filePath = path.resolve(`api/${routeName}.js`);

    if (!fs.existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Not Found: ${req.url}` }));
      return;
    }

    try {
      const fileUrl = pathToFileURL(filePath).href;
      const module = await import(`${fileUrl}?u=${Date.now()}`);
      const handler = module.default;

      let body = '';
      req.on('data', chunk => {
        body += chunk;
      });

      req.on('end', async () => {
        // Parse JSON request body
        req.body = {};
        if (body) {
          try {
            req.body = JSON.parse(body);
          } catch (e) {
            // Keep empty or raw body
          }
        }

        // Mock req.query
        req.query = {};
        urlObj.searchParams.forEach((val, key) => {
          req.query[key] = val;
        });

        // Mock Vercel response helper methods
        res.status = (code) => {
          res.statusCode = code;
          return res;
        };
        res.json = (data) => {
          res.writeHead(res.statusCode || 200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(data));
        };
        res.send = (data) => {
          res.writeHead(res.statusCode || 200);
          res.end(data);
        };
        res.redirect = (url) => {
          res.writeHead(302, { 'Location': url });
          res.end();
        };

        // Call the Vercel handler
        await handler(req, res);
      });
    } catch (err) {
      console.error(`Error in serverless API /api/${routeName}:`, err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // 1.2 Intercept /sitemap.xml and serve our dynamic sitemap
  if (req.url === '/sitemap.xml' && req.method === 'GET') {
    try {
      const filePath = path.resolve(`api/sitemap.js`);
      const fileUrl = pathToFileURL(filePath).href;
      const module = await import(`${fileUrl}?u=${Date.now()}`);
      const handler = module.default;

      // Mock Vercel response helper methods
      res.status = (code) => {
        res.statusCode = code;
        return res;
      };
      res.send = (data) => {
        res.writeHead(res.statusCode || 200, { 'Content-Type': 'application/xml' });
        res.end(data);
      };

      // Mock req.query
      req.query = {};

      // Execute sitemap handler
      await handler(req, res);
      return;
    } catch (err) {
      console.error("Error executing sitemap handler server-side:", err);
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end("Internal Server Error");
      return;
    }
  }

  // 1.5 Intercept /image/[id] for Premium Server-Side SEO Pre-rendering
  const imageMatch = req.url.match(/^\/image\/([a-zA-Z0-9_-]+)/);
  if (imageMatch && req.method === 'GET') {
    const imageId = imageMatch[1];
    
    try {
      let image = null;
      if (db) {
        const result = await db.execute({
          sql: "SELECT * FROM images WHERE id = ?",
          args: [imageId]
        });
        if (result.rows.length > 0) {
          image = result.rows[0];
        }
      }
      
      let indexHtml = fs.readFileSync(path.resolve('index.html'), 'utf-8');
      
      if (image) {
        const title = image.title || "Untitled Showcase";
        const description = image.description || "An image sharing platform with a modern, glass-like interface.";
        const imageUrl = image.imageUrl || "";
        const uploaderName = image.uploaderName || "Glass Gallery User";
        const location = image.location || "";
        const license = image.license || "CC0";
        const tags = image.flags ? JSON.parse(image.flags) : [];
        const author = uploaderName;

        // Construct JSON-LD Schema
        const schema = {
          "@context": "https://schema.org",
          "@type": "ImageObject",
          "contentUrl": imageUrl,
          "license": license === 'CC0' ? 'https://creativecommons.org/publicdomain/zero/1.0/' : license,
          "name": title,
          "description": description,
          "thumbnail": imageUrl,
          "keywords": tags.join(', '),
          "locationCreated": location ? {
            "@type": "Place",
            "name": location
          } : undefined,
          "author": {
            "@type": "Person",
            "name": author
          },
          "creator": {
            "@type": "Person",
            "name": author
          }
        };

        // Construct SEO head tags injection
        const seoMetaTags = `
    <title>${title} | Glass Gallery</title>
    <meta name="description" content="${description.replace(/"/g, '&quot;')}" />
    
    <!-- Open Graph tags -->
    <meta property="og:site_name" content="Glass Gallery" />
    <meta property="og:type" content="article" />
    <meta property="og:title" content="${title.replace(/"/g, '&quot;')}" />
    <meta property="og:description" content="${description.replace(/"/g, '&quot;')}" />
    <meta property="og:image" content="${imageUrl}" />
    
    <!-- Twitter Card tags -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${title.replace(/"/g, '&quot;')}" />
    <meta name="twitter:description" content="${description.replace(/"/g, '&quot;')}" />
    <meta name="twitter:image" content="${imageUrl}" />

    <!-- JSON-LD Structured Data of type schema.org/ImageObject -->
    <script type="application/ld+json">
      ${JSON.stringify(schema)}
    </script>
        `;

        // Strip default titles/metas and inject dynamic SEO tags
        indexHtml = indexHtml.replace(/<title>[\s\S]*?<\/title>/, seoMetaTags);
      }
      
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(indexHtml);
      return;
    } catch (seoErr) {
      console.error("[SEO Server Render Error]:", seoErr);
    }
  }

  // 2. Proxy all other assets/routes to local Vite server running on 5173
  const proxyReq = http.request({
    host: 'localhost',
    port: 5173,
    path: req.url,
    method: req.method,
    headers: req.headers
  }, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  req.pipe(proxyReq, { end: true });

  proxyReq.on('error', (err) => {
    res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end('Vite server is starting up or unreachable. Please refresh in a moment.');
  });
});

// Port 3000 matches Vercel dev port, so all relative fetch calls work seamlessly!
server.listen(3000, () => {
  console.log('\n============================================================');
  console.log('🚀 LOCAL DEV SERVER ACTIVE');
  console.log('🔗 URL: http://localhost:3000/');
  console.log('⚡ Powered by local Vite + serverless API proxy (Zero login needed)');
  console.log('============================================================\n');
});
