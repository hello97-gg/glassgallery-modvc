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

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const pageParam = parseInt(url.searchParams.get('page') || '1', 10);
  const page = isNaN(pageParam) || pageParam < 1 ? 1 : pageParam;
  const limit = 60;
  const offset = (page - 1) * limit;
  const baseUrl = "https://gg.modvc.org";

  try {
    const db = getDb(context.env);

    // Get total count
    const countResult = await db.execute("SELECT COUNT(*) as count FROM images");
    const totalCount = countResult.rows[0]?.count || 0;
    const totalPages = Math.max(1, Math.ceil(totalCount / limit));

    // Get images for page
    const result = await db.execute({
      sql: "SELECT id, title, imageUrl, uploaderName, uploadedAt FROM images ORDER BY uploadedAt DESC LIMIT ? OFFSET ?",
      args: [limit, offset]
    });

    const images = result.rows || [];
    const pageUrl = page === 1 ? `${baseUrl}/gallery` : `${baseUrl}/gallery?page=${page}`;
    const prevUrl = page > 1 ? (page === 2 ? `${baseUrl}/gallery` : `${baseUrl}/gallery?page=${page - 1}`) : null;
    const nextUrl = page < totalPages ? `${baseUrl}/gallery?page=${page + 1}` : null;

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

  <title>Gallery Archive – Page ${page} of ${totalPages} | Glass Gallery</title>
  <meta name="description" content="Browse page ${page} of Glass Gallery's comprehensive photo archive. Explore over ${totalCount} high-resolution astrophotography, wallpaper, and photography showcases." />
  <link rel="canonical" href="${pageUrl}" />
  ${prevUrl ? `<link rel="prev" href="${prevUrl}" />` : ''}
  ${nextUrl ? `<link rel="next" href="${nextUrl}" />` : ''}
  <link rel="icon" type="image/png" sizes="96x96" href="${baseUrl}/favicon-96x96.png" />
  <link rel="icon" type="image/x-icon" href="${baseUrl}/favicon.ico" />
  <link rel="shortcut icon" href="${baseUrl}/favicon.ico" />
  <link rel="apple-touch-icon" sizes="180x180" href="${baseUrl}/apple-touch-icon.png" />
  
  <meta property="og:site_name" content="Glass Gallery" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="Gallery Archive – Page ${page} | Glass Gallery" />
  <meta property="og:description" content="Explore page ${page} of high-resolution images and wallpapers on Glass Gallery." />
  <meta property="og:url" content="${pageUrl}" />
  <meta property="og:image" content="${baseUrl}/web-app-manifest-512x512.png" />
  <meta property="og:image:width" content="512" />
  <meta property="og:image:height" content="512" />
  
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:site" content="@GlassGallery" />
  <meta name="twitter:title" content="Gallery Archive – Page ${page} | Glass Gallery" />
  <meta name="twitter:description" content="Explore page ${page} of high-resolution images and wallpapers on Glass Gallery." />
  <meta name="twitter:image" content="${baseUrl}/web-app-manifest-512x512.png" />

  <style>
    body {
      margin: 0;
      padding: 0;
      background: #181818;
      color: #e5e5e5;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.5;
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
      max-width: 1400px;
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
      max-width: 1400px;
      margin: 0 auto;
      padding: 2rem 1.5rem;
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
      font-size: 2rem;
      font-weight: 800;
      color: #ffffff;
      margin: 0 0 0.5rem 0;
      letter-spacing: -0.02em;
    }
    .subtitle {
      color: #a0a0a0;
      margin: 0 0 2rem 0;
      font-size: 1rem;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 1.5rem;
      margin-bottom: 3rem;
    }
    .card {
      background: #222222;
      border: 1px solid #333333;
      border-radius: 12px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      text-decoration: none;
      color: inherit;
      transition: transform 0.2s, border-color 0.2s;
    }
    .card:hover {
      transform: translateY(-2px);
      border-color: #555;
    }
    .card img {
      width: 100%;
      height: 200px;
      object-fit: cover;
      display: block;
      background: #111;
    }
    .card-info {
      padding: 1rem;
      display: flex;
      flex-direction: column;
      flex-grow: 1;
    }
    .card h3 {
      font-size: 0.95rem;
      font-weight: 600;
      margin: 0 0 0.5rem 0;
      color: #ffffff;
      line-height: 1.4;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .uploader {
      font-size: 0.8rem;
      color: #888;
      margin-top: auto;
    }
    .pagination {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 0.5rem;
      margin: 3rem 0;
      flex-wrap: wrap;
    }
    .pagination a, .pagination span {
      padding: 0.6rem 1.1rem;
      border-radius: 8px;
      text-decoration: none;
      font-size: 0.9rem;
      font-weight: 600;
      background: #242424;
      color: #e5e5e5;
      border: 1px solid #333;
      transition: background 0.2s;
    }
    .pagination a:hover {
      background: #333;
      border-color: #555;
    }
    .pagination .current {
      background: #f5c3b8;
      color: #181818;
      border-color: #f5c3b8;
    }
    footer {
      border-top: 1px solid #282828;
      padding: 2rem 1.5rem;
      text-align: center;
      color: #777;
      font-size: 0.85rem;
    }
    footer a {
      color: #aaa;
      text-decoration: none;
      margin: 0 0.5rem;
    }
  </style>
</head>
<body>
  <header>
    <a href="${baseUrl}/" class="logo">
      <img src="${baseUrl}/web-app-manifest-512x512.png" alt="Glass Gallery Logo" width="36" height="36" style="border-radius: 8px;" />
      <span>Glass Gallery</span>
    </a>
    <nav>
      <a href="${baseUrl}/">Explore Gallery</a>
      <a href="${baseUrl}/gallery" class="active">Gallery Directory</a>
      <a href="${baseUrl}/api">API Reference</a>
      <a href="${baseUrl}/legal?tab=terms">Terms of Service</a>
      <a href="${baseUrl}/legal?tab=privacy">Privacy Policy</a>
    </nav>
  </header>

  <main>
    <nav aria-label="Breadcrumb navigation" class="breadcrumbs">
      <a href="${baseUrl}/">Explore Home</a> &rsaquo; <span>Gallery Archive</span> &rsaquo; <span>Page ${page}</span>
    </nav>

    <h1>Gallery Archive – Page ${page} of ${totalPages}</h1>
    <p class="subtitle">Complete crawlable directory of <strong>${totalCount.toLocaleString()}</strong> community photographs, astrophotography captures, and wallpapers.</p>

    <ul class="grid" style="list-style: none; padding: 0; margin: 0 0 3rem 0;">
      ${images.map(img => {
        const title = escapeHtml(img.title ? img.title.charAt(0).toUpperCase() + img.title.slice(1) : "Untitled Showcase");
        const uploader = escapeHtml(img.uploaderName || "Glass Gallery Creator");
        const isVideo = /\b(mp4|webm|mov|ogg|avi|mkv|m4v)\b/i.test(img.imageUrl || "");
        const mediaTag = isVideo
          ? `<div style="position:relative; width:100%; height:200px; background:#000; overflow:hidden;">
              <video src="${escapeHtml(img.imageUrl)}" muted playsinline preload="metadata" style="width:100%; height:200px; object-fit:cover; display:block;"></video>
              <span style="position:absolute; top:8px; right:8px; background:rgba(0,0,0,0.8); color:#fff; font-size:10px; font-weight:700; padding:3px 7px; border-radius:4px; letter-spacing:0.5px; border:1px solid rgba(255,255,255,0.2);">▶ VIDEO</span>
            </div>`
          : `<img src="${escapeHtml(img.imageUrl)}" alt="${title} by ${uploader} on Glass Gallery" width="280" height="200" loading="lazy" style="width:100%; height:200px; object-fit:cover; display:block;" />`;
        return `
          <li>
            <a href="${baseUrl}/image/${escapeHtml(img.id)}" class="card">
              ${mediaTag}
              <div class="card-info">
                <h3>${title}</h3>
                <span class="uploader">By ${uploader}</span>
              </div>
            </a>
          </li>
        `;
      }).join('')}
    </ul>

    <nav aria-label="Pagination navigation" class="pagination">
      ${prevUrl ? `<a href="${prevUrl}">&larr; Previous Page</a>` : ''}
      <span class="current">Page ${page} of ${totalPages}</span>
      ${nextUrl ? `<a href="${nextUrl}">Next Page &rarr;</a>` : ''}
    </nav>
  </main>

  <footer>
    <p>&copy; 2026 Glass Gallery. Discover, share and download high-resolution visual art.</p>
    <p>
      <a href="${baseUrl}/">Explore Gallery</a> &bull;
      <a href="${baseUrl}/gallery">Gallery Directory</a> &bull;
      <a href="${baseUrl}/api">API Documentation</a> &bull;
      <a href="${baseUrl}/legal?tab=terms">Terms of Service</a> &bull;
      <a href="${baseUrl}/legal?tab=privacy">Privacy Policy</a>
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

  } catch (error) {
    console.error("[gallery-directory] Error:", error);
    return Response.redirect(`${baseUrl}/`, 302);
  }
}
