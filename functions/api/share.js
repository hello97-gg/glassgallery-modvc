import { getDb } from "./lib/turso.js";

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const id = url.searchParams.get('id');

  if (!id) {
    return Response.redirect(url.origin + '/', 302);
  }

  try {
    const db = getDb(context.env);
    const result = await db.execute({
      sql: "SELECT * FROM images WHERE id = ?",
      args: [id]
    });

    // If document doesn't exist, just redirect to home/app
    if (result.rows.length === 0) {
        return Response.redirect(`${url.origin}/?image=${id}`, 302);
    }

    const row = result.rows[0];
    const imageUrl = row.imageUrl || '';
    const title = row.title || 'Glass Gallery Image';
    const uploaderName = row.uploaderName || 'User';
    const description = row.description || `Check out this amazing image uploaded by ${uploaderName} on Glass Gallery.`;

    // Construct the HTML with Open Graph tags for bots
    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        
        <!-- Primary Meta Tags -->
        <title>${title} | Glass Gallery</title>
        <meta name="title" content="${title} | Glass Gallery">
        <meta name="description" content="${description}">
        
        <!-- Open Graph / Facebook / Discord -->
        <meta property="og:type" content="article">
        <meta property="og:url" content="https://gg.modvc.org/api/share?id=${id}">
        <meta property="og:title" content="${title} | Glass Gallery">
        <meta property="og:description" content="${description}">
        <meta property="og:image" content="${imageUrl}">
        <meta property="og:site_name" content="Glass Gallery">
        
        <!-- Twitter -->
        <meta property="twitter:card" content="summary_large_image">
        <meta property="twitter:url" content="https://gg.modvc.org/api/share?id=${id}">
        <meta property="twitter:title" content="${title} | Glass Gallery">
        <meta property="twitter:description" content="${description}">
        <meta property="twitter:image" content="${imageUrl}">

        <!-- Redirect to the actual app for humans -->
        <script>
            window.location.href = "/?image=${id}";
        </script>
      </head>
      <body style="background-color: #181818; color: #e5e5e5; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0;">
        <div style="text-align: center;">
            <p>Loading image...</p>
        </div>
      </body>
      </html>
    `;

    return new Response(html, {
      headers: {
        'Content-Type': 'text/html',
        'Cache-Control': 's-maxage=3600, stale-while-revalidate'
      }
    });

  } catch (error) {
    console.error("Metadata fetch error in share.js:", error);
    // Fallback: just send them to the app
    return Response.redirect(`${url.origin}/?image=${id}`, 302);
  }
}
