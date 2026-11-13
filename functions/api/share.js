import { getDb } from "./lib/turso.js";

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
  const rawId = url.searchParams.get('id') || url.searchParams.get('imageId') || url.searchParams.get('post');
  const cleanId = rawId ? decodeURIComponent(rawId).split('_loop_')[0].split('?')[0].replace(/\.html?$/i, '').trim() : "";

  const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  const baseUrl = isLocal ? url.origin : "https://gg.modvc.org";

  if (!cleanId) {
    return Response.redirect(`${baseUrl}/`, 302);
  }

  const pageUrl = `${baseUrl}/image/${cleanId}`;

  try {
    const db = getDb(context.env);
    let result = await db.execute({
      sql: "SELECT * FROM images WHERE id = ? LIMIT 1",
      args: [cleanId]
    });

    if (result.rows.length === 0) {
      result = await db.execute({
        sql: "SELECT * FROM images WHERE LOWER(id) = LOWER(?) LIMIT 1",
        args: [cleanId]
      });
    }

    // If post not found, redirect to gallery home
    if (result.rows.length === 0) {
      return Response.redirect(`${baseUrl}/`, 302);
    }

    const row = result.rows[0];
    const rawTitle = (row.title || "Untitled Photograph").trim();
    const title = rawTitle.charAt(0).toUpperCase() + rawTitle.slice(1);
    const uploaderName = (row.uploaderName || "Creator").trim();
    const rawDesc = (row.description || "").trim();
    const description = rawDesc || `Explore and view high-resolution photography "${title}" by ${uploaderName} on Glass Gallery.`;

    const imageUrl = row.imageUrl || "";
    const isVideo = Boolean(row.isVideo || (imageUrl && imageUrl.match(/\.(mp4|webm|mov|m4v)(\?.*)?$/i)));
    
    // Crucial for Bluesky / Twitter / Discord: og:image MUST be a real image format, NEVER an .mp4 video URL
    const thumbUrl = row.thumbnailUrl || (imageUrl && imageUrl.match(/\.(jpg|jpeg|png|webp)$/i) 
      ? imageUrl.replace(/\.[a-zA-Z0-9]+$/, '-thumb.jpg') 
      : (isVideo ? `${baseUrl}/web-app-manifest-512x512.png` : imageUrl));

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} | Glass Gallery</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="robots" content="noindex, follow">
  <link rel="canonical" href="${pageUrl}">

  <!-- Open Graph / Bluesky / Facebook / Discord -->
  <meta property="og:site_name" content="Glass Gallery">
  <meta property="og:type" content="${isVideo ? 'video.other' : 'article'}">
  <meta property="og:url" content="${pageUrl}">
  <meta property="og:title" content="${escapeHtml(title)} | Glass Gallery">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:image" content="${thumbUrl}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="${isVideo ? '675' : '800'}">

  ${isVideo ? `
  <meta property="og:video" content="${imageUrl}">
  <meta property="og:video:secure_url" content="${imageUrl}">
  <meta property="og:video:type" content="video/mp4">
  <meta property="og:video:width" content="1280">
  <meta property="og:video:height" content="720">
  ` : ''}

  <!-- Twitter / X Cards -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:site" content="@modvc_org">
  <meta name="twitter:title" content="${escapeHtml(title)} | Glass Gallery">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${thumbUrl}">

  <!-- Fast client-side redirect for human visitors -->
  <meta http-equiv="refresh" content="0; url=${pageUrl}">
  <script>
    window.location.replace(${JSON.stringify(pageUrl)});
  </script>
  <style>
    body {
      background: #0f0f14;
      color: #e2e8f0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
      text-align: center;
    }
    a { color: #f5c3b8; text-decoration: none; font-weight: 600; }
  </style>
</head>
<body>
  <div>
    <p>Opening <a href="${pageUrl}">${escapeHtml(title)}</a> on Glass Gallery...</p>
  </div>
</body>
</html>`;

    return new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=UTF-8',
        'Cache-Control': 'public, max-age=300, s-maxage=600',
        'X-Robots-Tag': 'noindex, follow'
      }
    });

  } catch (err) {
    console.error("[Share API Error]:", err);
    return Response.redirect(pageUrl, 302);
  }
}
