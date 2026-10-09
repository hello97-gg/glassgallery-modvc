export async function onRequest(context) {
  const url = new URL(context.request.url);
  const acceptHeader = context.request.headers.get('accept') || '';

  // If request specifically expects JSON, return API index json
  if (acceptHeader.includes('application/json') && !acceptHeader.includes('text/html')) {
    return Response.json({
      name: "Glass Gallery REST API",
      version: "1.0",
      description: "Free public REST API for image search, metadata, and embeds.",
      documentation: "https://gg.modvc.org/api",
      endpoints: [
        { path: "/api/random", method: "GET", description: "Fetch random images" },
        { path: "/api/images?action=get_single&imageId={id}", method: "GET", description: "Fetch single image metadata" },
        { path: "/api/images?action=download&imageId={id}", method: "GET", description: "Track download and redirect to CDN" },
        { path: "/api/images?action=render", method: "GET", description: "Direct 302 embed redirect for img tags" },
        { path: "/api/trending", method: "GET", description: "Trending tags and creators" }
      ]
    }, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      }
    });
  }

  const baseUrl = "https://gg.modvc.org";
  const pageUrl = `${baseUrl}/api`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  
  <!-- Google tag (gtag.js) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-4J31FLLQ5L"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-4J31FLLQ5L');
  </script>

  <title>Developer API Documentation | Glass Gallery</title>
  <meta name="description" content="Official Glass Gallery REST API documentation. Endpoints for retrieving trending photos, image metadata, search, and direct embed tags." />
  <link rel="canonical" href="${pageUrl}" />

  <meta property="og:site_name" content="Glass Gallery" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="Developer API Documentation | Glass Gallery" />
  <meta property="og:description" content="Official Glass Gallery REST API documentation. Free public API for images, metadata, and CDN embeds." />
  <meta property="og:url" content="${pageUrl}" />
  <meta property="og:image" content="${baseUrl}/web-app-manifest-512x512.png" />
  <meta property="og:image:width" content="512" />
  <meta property="og:image:height" content="512" />

  <meta name="twitter:card" content="summary" />
  <meta name="twitter:site" content="@GlassGallery" />
  <meta name="twitter:title" content="Developer API Documentation | Glass Gallery" />
  <meta name="twitter:description" content="Official Glass Gallery REST API documentation. Free public API for images, metadata, and CDN embeds." />
  <meta name="twitter:image" content="${baseUrl}/web-app-manifest-512x512.png" />

  <style>
    body {
      margin: 0;
      padding: 0;
      background: #181818;
      color: #e5e5e5;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
    }
    header {
      border-bottom: 1px solid #282828;
      padding: 1rem 1.5rem;
      background: rgba(24, 24, 24, 0.9);
      backdrop-filter: blur(10px);
      position: sticky;
      top: 0;
      z-index: 100;
      display: flex;
      justify-content: space-between;
      align-items: center;
      max-width: 1200px;
      margin: 0 auto;
      box-sizing: border-box;
    }
    .logo {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      color: #ffffff;
      text-decoration: none;
      font-weight: 700;
      font-size: 1.25rem;
    }
    nav a {
      color: #a0a0a0;
      text-decoration: none;
      margin-left: 1.25rem;
      font-size: 0.9rem;
      font-weight: 500;
      transition: color 0.2s;
    }
    nav a:hover, nav a.active {
      color: #f5c3b8;
    }
    main {
      max-width: 1000px;
      margin: 0 auto;
      padding: 2.5rem 1.5rem;
      box-sizing: border-box;
    }
    .breadcrumbs {
      font-size: 0.85rem;
      color: #888;
      margin-bottom: 1.5rem;
    }
    .breadcrumbs a {
      color: #b3b3b3;
      text-decoration: none;
    }
    h1 {
      font-size: 2.4rem;
      font-weight: 800;
      color: #ffffff;
      margin: 0 0 0.75rem 0;
      letter-spacing: -0.02em;
    }
    .subtitle {
      color: #a0a0a0;
      font-size: 1.1rem;
      margin: 0 0 2.5rem 0;
      line-height: 1.6;
    }
    .card {
      background: #222222;
      border: 1px solid #333333;
      border-radius: 14px;
      padding: 1.5rem;
      margin-bottom: 2rem;
    }
    .endpoint-badge {
      display: inline-block;
      padding: 0.25rem 0.65rem;
      border-radius: 6px;
      font-weight: 700;
      font-size: 0.8rem;
      margin-bottom: 0.75rem;
    }
    .get-badge {
      background: rgba(245, 195, 184, 0.2);
      color: #f5c3b8;
    }
    .embed-badge {
      background: rgba(96, 165, 250, 0.2);
      color: #93c5fd;
    }
    code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.95rem;
      color: #f5c3b8;
      background: #181818;
      padding: 0.2rem 0.5rem;
      border-radius: 6px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 1rem;
      font-size: 0.875rem;
    }
    caption {
      text-align: left;
      font-weight: 600;
      color: #ffffff;
      margin-bottom: 0.5rem;
      font-size: 0.95rem;
    }
    th, td {
      padding: 0.75rem 1rem;
      border-bottom: 1px solid #333;
      text-align: left;
    }
    th {
      background: #282828;
      color: #a0a0a0;
      font-weight: 600;
    }
    ul {
      margin: 1rem 0;
      padding-left: 1.5rem;
    }
    li {
      margin-bottom: 0.5rem;
    }
    footer {
      border-top: 1px solid #282828;
      padding: 2.5rem 1.5rem;
      text-align: center;
      color: #777;
      font-size: 0.85rem;
      margin-top: 4rem;
    }
    footer a {
      color: #aaa;
      text-decoration: none;
      margin: 0 0.5rem;
    }
    footer a:hover {
      color: #f5c3b8;
    }
  </style>
</head>
<body>
  <header>
    <a href="/" class="logo">
      <img src="/web-app-manifest-512x512.png" alt="Glass Gallery Logo" width="36" height="36" style="border-radius: 8px;" />
      <span>Glass Gallery</span>
    </a>
    <nav>
      <a href="/">Explore Gallery</a>
      <a href="/gallery">Gallery Directory</a>
      <a href="/api" class="active">API Documentation</a>
      <a href="/legal?tab=terms">Terms of Service</a>
      <a href="/legal?tab=privacy">Privacy Policy</a>
    </nav>
  </header>

  <main>
    <div class="breadcrumbs">
      <a href="/">Home</a> &rsaquo; <span>Developer Documentation</span> &rsaquo; <span>API Reference</span>
    </div>

    <h1>Developer API Reference</h1>
    <p class="subtitle">
      Integrate Glass Gallery images into your own applications, creative projects, or websites. 
      <strong>Our public REST API is completely free</strong> and requires no authentication for read-only access.
    </p>

    <!-- Overview Features List -->
    <div class="card">
      <h2 style="font-size: 1.25rem; color: #ffffff; margin-top: 0;">API Capabilities</h2>
      <ul>
        <li><strong>Random Image Retrieval:</strong> Fetch curated wallpapers and high-resolution images on demand.</li>
        <li><strong>Direct Embeds:</strong> Use standard <code>&lt;img src="/api/images?action=render"&gt;</code> without client-side scripts.</li>
        <li><strong>Rich Metadata:</strong> Detailed EXIF, camera, tags, licensing, and photographer attribution.</li>
        <li><strong>High Availability:</strong> Fast global CDN edge delivery with zero rate limits for standard usage.</li>
      </ul>
    </div>

    <!-- Endpoint: Random -->
    <div class="card">
      <span class="endpoint-badge get-badge">GET</span>
      <h3 style="margin: 0 0 0.75rem 0; font-size: 1.15rem; color: #ffffff;">Random Images Endpoint</h3>
      <code>/api/random</code>
      <p style="color: #a0a0a0; margin-top: 0.75rem;">
        Fetches a random set of photographs from the gallery, optionally filtered by keyword or subject.
      </p>
    </div>

    <!-- Endpoint: Single Image -->
    <div class="card">
      <span class="endpoint-badge get-badge">GET</span>
      <h3 style="margin: 0 0 0.75rem 0; font-size: 1.15rem; color: #ffffff;">Single Image Metadata</h3>
      <code>/api/images?action=get_single&amp;imageId={id}</code>
      <p style="color: #a0a0a0; margin-top: 0.75rem;">
        Fetches complete metadata for an individual image by its unique ID, including title, tags, photographer, license, and download links.
      </p>
    </div>

    <!-- Endpoint: Embed -->
    <div class="card">
      <span class="endpoint-badge embed-badge">EMBED / 302 REDIRECT</span>
      <h3 style="margin: 0 0 0.75rem 0; font-size: 1.15rem; color: #ffffff;">Direct HTML Image Embed</h3>
      <code>/api/images?action=render</code>
      <p style="color: #a0a0a0; margin-top: 0.75rem;">
        Embed high-quality photos directly onto any external webpage. This endpoint issues an HTTP 302 redirect directly to the optimized CDN image URL.
      </p>
      <table>
        <caption>Render Endpoint Query Parameters</caption>
        <thead>
          <tr>
            <th>Parameter</th>
            <th>Type</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>imageId</code></td>
            <td>string</td>
            <td>Specific unique image ID to render</td>
          </tr>
          <tr>
            <td><code>category</code></td>
            <td>string</td>
            <td>Category filter (e.g. Space, Wallpaper, Anime, Nature)</td>
          </tr>
          <tr>
            <td><code>format</code></td>
            <td>string</td>
            <td>Set to "json" for JSON response instead of 302 redirect</td>
          </tr>
        </tbody>
      </table>
    </div>
  </main>

  <footer>
    <p>&copy; 2026 Glass Gallery. Discover, upload, and share high-resolution visual art.</p>
    <p>
      <a href="/">Explore Gallery</a> &bull;
      <a href="/gallery">Gallery Directory</a> &bull;
      <a href="/api">API Reference</a> &bull;
      <a href="/legal?tab=terms">Terms of Service</a> &bull;
      <a href="/legal?tab=privacy">Privacy Policy</a>
    </p>
  </footer>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=UTF-8',
      'Cache-Control': 's-maxage=3600, stale-while-revalidate=86400'
    }
  });
}
