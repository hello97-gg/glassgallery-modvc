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
  'image', 'gallery', 'api', 'legal', 'discover', 'explore', 'reels',
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

  // Legacy view parameter 301 redirect (e.g. /?view=api -> /api, /?view=gallery -> /gallery)
  const viewParam = url.searchParams.get('view');
  if (viewParam && ['api', 'gallery', 'app', 'legal'].includes(viewParam.toLowerCase())) {
    const targetUrl = new URL(`/${viewParam.toLowerCase()}`, url.origin);
    return Response.redirect(targetUrl.toString(), 301);
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

      const INVALID_HANDLES = new Set(['loading...', 'loading', 'anonymous', 'unknown', 'null', 'undefined', 'creator', 'user']);
      const cleanUser = usernameParam ? usernameParam.replace(/^@/, '').trim().toLowerCase() : '';

      if (cleanUser && INVALID_HANDLES.has(cleanUser)) {
        return new Response(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>404 - Profile Not Found | Glass Gallery</title><meta name="robots" content="noindex, follow" /><link rel="icon" type="image/png" sizes="96x96" href="/favicon-96x96.png" /><link rel="icon" type="image/x-icon" href="/favicon.ico" /></head><body style="background:#181818;color:#e5e5e5;font-family:system-ui,sans-serif;text-align:center;padding:4rem;"><h1>404 - Profile Not Found</h1><p style="color:#a0a0a0;margin:1rem 0 2rem;">The requested creator profile does not exist.</p><a href="/gallery" style="display:inline-block;background:#f5c3b8;color:#181818;padding:0.75rem 1.5rem;border-radius:999px;text-decoration:none;font-weight:600;">Browse Gallery Archive</a></body></html>`, {
          status: 404,
          headers: { 'Content-Type': 'text/html; charset=UTF-8', 'Cache-Control': 'no-cache, no-store, must-revalidate' }
        });
      }

      let handledWithProfileSsr = false;

      if (cleanUser) {
        try {
          const db = getDb(context.env);
          
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

            let profileDesc = `Explore creative visuals and HD photography by ${name} on Glass Gallery. Featuring ${uploadCount} original showcases and ${totalLikes} community likes.`;
            if (profileDesc.length > 158) profileDesc = profileDesc.slice(0, 155) + '...';

            // Fetch index.html
            const assetUrl = new URL(request.url);
            assetUrl.pathname = '/index.html';
            const indexRes = await context.env.ASSETS.fetch(new Request(assetUrl));
            if (indexRes.ok) {
              let html = await indexRes.text();

              const metaTags = `<title>${name} (@${handle}) | Glass Gallery</title>
    <meta name="description" content="${escapeHtml(profileDesc)}" />
    <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
    <link rel="canonical" href="${profileUrl}" />
    <meta property="og:title" content="${name} (@${handle}) | Glass Gallery" />
    <meta property="og:description" content="${escapeHtml(profileDesc)}" />
    <meta property="og:image" content="${photo}" />
    <meta property="og:image:width" content="512" />
    <meta property="og:image:height" content="512" />
    <meta property="og:url" content="${profileUrl}" />
    <meta property="og:type" content="profile" />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="${name} (@${handle}) | Glass Gallery" />
    <meta name="twitter:description" content="${escapeHtml(profileDesc)}" />
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
        "description": "${escapeHtml(profileDesc)}"
      }
    }
    </script>
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Glass Gallery", "item": "https://gg.modvc.org" },
        { "@type": "ListItem", "position": 2, "name": "${name}", "item": "${profileUrl}" }
      ]
    }
    </script>
    <script>
      window.__PRELOADED_CREATOR_DATA__ = ${JSON.stringify({ creator, uploadCount, totalLikes, totalDownloads })};
      window.__PRELOADED_CREATOR_IMAGES__ = ${JSON.stringify(creatorImages)};
    </script>`;

              if (html.includes('<!-- SEO_META_START -->')) {
                html = html.replace(/<!-- SEO_META_START -->[\s\S]*?<!-- SEO_META_END -->/, metaTags);
              } else {
                html = html.replace(/<title>.*?<\/title>/i, metaTags);
              }

              if (html.includes('<!-- JSON_LD_START -->')) {
                html = html.replace(/<!-- JSON_LD_START -->[\s\S]*?<!-- JSON_LD_END -->/, '');
              }

              const imageLinks = creatorImages.map(img => 
                `<li>
                  <a href="https://gg.modvc.org/image/${escapeHtml(img.id)}" style="display: block; text-decoration: none; color: inherit; background: #222; border-radius: 12px; overflow: hidden; border: 1px solid #333;">
                    <img src="${escapeHtml(img.imageUrl)}" alt="${escapeHtml(img.title || 'Artwork')}" width="280" height="180" loading="lazy" style="width: 100%; height: 180px; object-fit: cover; display: block;" />
                    <div style="padding: 0.75rem 1rem;">
                      <h3 style="font-size: 0.95rem; font-weight: 600; margin: 0; color: #ffffff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(img.title || 'Untitled artwork')}</h3>
                    </div>
                  </a>
                </li>`
              ).join('');

              const profileSsrHtml = `
                <div style="max-width: 1100px; margin: 0 auto; padding: 2rem 1.5rem; color: #e5e5e5; font-family: system-ui, sans-serif;">
                  <header style="display: flex; align-items: center; gap: 1.5rem; margin-bottom: 2rem; border-bottom: 1px solid #282828; padding-bottom: 2rem;">
                    <img src="${photo}" alt="${name}" width="96" height="96" style="border-radius: 50%; object-fit: cover; border: 2px solid #f5c3b8;" />
                    <div>
                      <h1 style="font-size: 1.75rem; font-weight: 800; margin: 0 0 0.5rem 0; color: #ffffff;">${name} (@${handle})</h1>
                      <p style="margin: 0 0 0.75rem 0; color: #a0a0a0; max-width: 600px; line-height: 1.5;">${escapeHtml(profileDesc)}</p>
                      <div style="font-size: 0.9rem; color: #f5c3b8; font-weight: 600;">
                        ${uploadCount} Uploads &bull; ${totalLikes} Likes &bull; ${totalDownloads} Downloads
                      </div>
                    </div>
                  </header>
                  ${imageLinks ? `
                    <section>
                      <h2 style="font-size: 1.35rem; font-weight: 700; margin-bottom: 1.5rem; color: #ffffff;">Uploads by ${name}</h2>
                      <ul style="list-style: none; padding: 0; margin: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 1.25rem;">
                        ${imageLinks}
                      </ul>
                    </section>
                  ` : ''}
                </div>
              `;

              if (html.includes('<!-- SKELETON_START -->')) {
                html = html.replace(/<!-- SKELETON_START -->[\s\S]*?<!-- SKELETON_END -->/, profileSsrHtml);
              }

              response = new Response(html, {
                status: 200,
                headers: {
                  'Content-Type': 'text/html; charset=UTF-8',
                  'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800'
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
