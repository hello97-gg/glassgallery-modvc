import { getDb } from "./api/lib/turso.js";

function escapeHtml(unsafe) {
  if (!unsafe) return "";
  return unsafe.toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const RESERVED_ROUTES = new Set([
  'image', 'gallery', 'api', 'legal', 'discover', 'explore',
  'login', 'notifications', 'feed', 'assets', 'favicon.ico',
  'robots.txt', 'sitemap.xml', 'manifest.json'
]);

export const onRequest = async (context) => {
  const { request, next } = context;
  const url = new URL(request.url);

  // Canonical domain redirect: ensure all *.pages.dev traffic redirects to gg.modvc.org
  if (url.hostname.endsWith('.pages.dev')) {
    url.hostname = 'gg.modvc.org';
    return Response.redirect(url.toString(), 301);
  }

  // Execute next middleware or route handler
  let response;
  try {
    response = await next();
  } catch (err) {
    console.error("[Middleware Error]:", err);
    if (!url.pathname.startsWith('/api')) {
      try {
        const assetUrl = new URL(request.url);
        assetUrl.pathname = '/index.html';
        const assetRes = await context.env.ASSETS.fetch(new Request(assetUrl));
        if (assetRes.ok) return assetRes;
      } catch {}
    }
    return new Response(`Server Error: ${err.message}`, {
      status: 500,
      headers: {
        'Content-Type': 'text/plain',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'SAMEORIGIN'
      }
    });
  }

  // SPA Route Fallback & Creator Profile SSR for direct URLs (/@username, /username, etc.)
  if (response.status === 404 && !url.pathname.startsWith('/api') && !url.pathname.startsWith('/image/') && !url.pathname.includes('.')) {
    try {
      const atMatch = url.pathname.match(/^\/@([a-zA-Z0-9_.-]+)/);
      const directMatch = !atMatch ? url.pathname.match(/^\/([a-zA-Z0-9_.-]+)$/) : null;
      const usernameParam = atMatch
        ? atMatch[1]
        : (directMatch && !RESERVED_ROUTES.has(directMatch[1].toLowerCase()) ? directMatch[1] : null);

      let handledWithProfileSsr = false;

      if (usernameParam) {
        try {
          const db = getDb(context.env);
          const cleanUser = usernameParam.replace(/^@/, '').trim().toLowerCase();
          
          let result = await db.execute({
            sql: "SELECT * FROM users WHERE LOWER(REPLACE(uploaderName, ' ', '')) = LOWER(?) OR LOWER(uploaderName) = LOWER(?) LIMIT 1",
            args: [cleanUser, cleanUser]
          });

          if (result.rows.length === 0) {
            result = await db.execute({
              sql: "SELECT uploaderUid, uploaderName, uploaderPhotoURL, location FROM images WHERE LOWER(REPLACE(uploaderName, ' ', '')) = LOWER(?) OR LOWER(uploaderName) = LOWER(?) LIMIT 1",
              args: [cleanUser, cleanUser]
            });
          }

          if (result.rows.length > 0) {
            const creator = result.rows[0];
            const creatorUid = creator.uploaderUid;
            const name = escapeHtml(creator.uploaderName || cleanUser);
            const handle = escapeHtml((creator.uploaderName || cleanUser).replace(/\s+/g, '').toLowerCase());
            const rawBio = creator.bio ? creator.bio.trim() : `Explore creative visuals and HD wallpaper photography by ${name} on Glass Gallery.`;
            const desc = escapeHtml(rawBio.slice(0, 160));
            const photo = creator.uploaderPhotoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${name}`;
            const profileUrl = `https://gg.modvc.org/@${handle}`;

            // Fetch creator's stats & recent images for instant SSR population
            let uploadCount = 0;
            let totalLikes = 0;
            let totalDownloads = 0;
            let creatorImages = [];

            if (creatorUid) {
              try {
                const [statsRes, imgRes] = await Promise.all([
                  db.execute({
                    sql: "SELECT COUNT(*) as uploadCount, COALESCE(SUM(likeCount), 0) as totalLikes, COALESCE(SUM(downloadCount), 0) as totalDownloads FROM images WHERE uploaderUid = ?",
                    args: [creatorUid]
                  }),
                  db.execute({
                    sql: "SELECT id, title, imageUrl, likeCount, downloadCount, uploadedAt FROM images WHERE uploaderUid = ? ORDER BY uploadedAt DESC LIMIT 24",
                    args: [creatorUid]
                  })
                ]);
                uploadCount = statsRes.rows[0]?.uploadCount || 0;
                totalLikes = statsRes.rows[0]?.totalLikes || 0;
                totalDownloads = statsRes.rows[0]?.totalDownloads || 0;
                creatorImages = imgRes.rows || [];
              } catch (statsErr) {
                console.warn("[Profile SSR Stats Warning]:", statsErr);
              }
            }

            // Fetch index.html
            const assetUrl = new URL(request.url);
            assetUrl.pathname = '/index.html';
            const indexRes = await context.env.ASSETS.fetch(new Request(assetUrl));
            if (indexRes.ok) {
              let html = await indexRes.text();

              const metaTags = `<title>${name} (@${handle}) | Glass Gallery</title>
    <meta name="description" content="${desc} – ${uploadCount} uploads, ${totalLikes} likes." />
    <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
    <link rel="canonical" href="${profileUrl}" />
    <meta property="og:title" content="${name} (@${handle}) | Glass Gallery" />
    <meta property="og:description" content="${desc} – ${uploadCount} uploads, ${totalLikes} likes." />
    <meta property="og:image" content="${photo}" />
    <meta property="og:url" content="${profileUrl}" />
    <meta property="og:type" content="profile" />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="${name} (@${handle}) | Glass Gallery" />
    <meta name="twitter:description" content="${desc} – ${uploadCount} uploads, ${totalLikes} likes." />
    <meta name="twitter:image" content="${photo}" />
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "ProfilePage",
      "mainEntity": {
        "@type": "Person",
        "name": "${name}",
        "alternateName": "@${handle}",
        "url": "${profileUrl}",
        "image": "${photo}",
        "description": "${desc}"
      }
    }
    </script>
    <script>
      window.__PRELOADED_CREATOR_DATA__ = ${JSON.stringify({ creator, uploadCount, totalLikes, totalDownloads })};
      window.__PRELOADED_CREATOR_IMAGES__ = ${JSON.stringify(creatorImages)};
    </script>`;

              html = html.replace(/<title>.*?<\/title>/i, metaTags);

              // Server-rendered crawlable HTML inside #root so web crawlers index creator data and images immediately
              const imageLinks = creatorImages.map(img => 
                `<li><a href="https://gg.modvc.org/image/${escapeHtml(img.id)}">${escapeHtml(img.title || 'Untitled artwork')}</a></li>`
              ).join('');

              const ssrBody = `<div id="ssr-profile" style="position:absolute;left:-9999px;top:-9999px;opacity:0;pointer-events:none;" aria-hidden="true">
                <h1>${name} (@${handle})</h1>
                <p>${desc}</p>
                <p>Stats: ${uploadCount} Uploads &bull; ${totalLikes} Likes &bull; ${totalDownloads} Downloads</p>
                <a href="${profileUrl}">View ${name}'s Profile on Glass Gallery</a>
                ${imageLinks ? `<h2>Uploads by ${name}</h2><ul>${imageLinks}</ul>` : ''}
              </div>`;

              html = html.replace('<div id="root">', `<div id="root">${ssrBody}`);

              response = new Response(html, {
                status: 200,
                headers: {
                  'Content-Type': 'text/html; charset=UTF-8',
                  'Cache-Control': 'public, max-age=600, s-maxage=3600'
                }
              });
              handledWithProfileSsr = true;
            }
          }
        } catch (dbErr) {
          console.warn("[Profile SSR DB Warning]:", dbErr);
        }
      }

      // Default SPA asset fallback if not already handled with profile SSR
      if (!handledWithProfileSsr) {
        const assetUrl = new URL(request.url);
        assetUrl.pathname = '/index.html';
        const indexRes = await context.env.ASSETS.fetch(new Request(assetUrl));
        if (indexRes.ok) {
          response = indexRes;
        }
      }
    } catch (e) {
      // Fall through
    }
  }

  // Clone or copy response to set immutable security headers
  const newResponse = new Response(response.body, response);

  // Site-wide security headers
  newResponse.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  newResponse.headers.set('X-Content-Type-Options', 'nosniff');
  newResponse.headers.set('X-Frame-Options', 'SAMEORIGIN');
  newResponse.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  return newResponse;
};
