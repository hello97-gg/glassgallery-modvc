import { getDb } from "../api/lib/turso.js";

const LICENSE_URLS = {
  'CC0': 'https://creativecommons.org/publicdomain/zero/1.0/',
  'CC-BY': 'https://creativecommons.org/licenses/by/4.0/',
  'CC BY': 'https://creativecommons.org/licenses/by/4.0/',
  'CC-BY-SA': 'https://creativecommons.org/licenses/by-sa/4.0/',
  'CC BY-SA': 'https://creativecommons.org/licenses/by-sa/4.0/',
  'CC-BY-NC': 'https://creativecommons.org/licenses/by-nc/4.0/',
  'CC BY-NC': 'https://creativecommons.org/licenses/by-nc/4.0/',
};

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
  const id = context.params.id;
  const cleanId = id ? id.split('_loop_')[0].split('?')[0] : "";
  const baseUrl = "https://gg.modvc.org";
  const url = new URL(context.request.url);

  if (!id) {
    return Response.redirect(baseUrl + '/', 302);
  }

  try {
    const db = getDb(context.env);
    const result = await db.execute({
      sql: "SELECT * FROM images WHERE id = ?",
      args: [cleanId]
    });

    // Fetch the base index.html from Cloudflare Pages static assets
    let indexHtml = "";
    try {
      const assetUrl = new URL(context.request.url);
      assetUrl.pathname = '/index.html';
      const assetResponse = await context.env.ASSETS.fetch(new Request(assetUrl));
      if (assetResponse.ok) {
        indexHtml = await assetResponse.text();
      }
    } catch (e) {
      console.warn("Failed to fetch internal index.html:", e);
    }

    if (!indexHtml) {
      indexHtml = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Glass Gallery</title></head><body><div id="root"></div><script>window.location.href="/?image=${escapeHtml(id)}";</script></body></html>`;
    }

    if (result.rows.length === 0) {
      return new Response(indexHtml, {
        headers: {
          'Content-Type': 'text/html',
          'Cache-Control': 's-maxage=60, stale-while-revalidate'
        }
      });
    }

    const image = result.rows[0];
    const title = escapeHtml(image.title || "Untitled Image");
    const description = escapeHtml(image.description || `A beautiful image shared on Glass Gallery by ${image.uploaderName || 'a creator'}.`);
    const imageUrl = image.imageUrl || "";
    const uploaderName = escapeHtml(image.uploaderName || "Glass Gallery User");
    const location = image.location || "";
    const license = image.license || "CC0";
    const licenseUrl = LICENSE_URLS[license] || license;
    const pageUrl = `${baseUrl}/image/${id}`;

    let tags = [];
    try {
      tags = image.flags ? JSON.parse(image.flags) : [];
    } catch { tags = []; }

    const schemas = [];

    const imageObjectSchema = {
      "@context": "https://schema.org",
      "@type": "ImageObject",
      "contentUrl": imageUrl,
      "url": pageUrl,
      "name": image.title || "Untitled Image",
      "description": image.description || `An image shared on Glass Gallery`,
      "thumbnail": imageUrl,
      "license": licenseUrl,
      "acquireLicensePage": pageUrl,
      "creditText": image.uploaderName || "Glass Gallery User",
      "creator": {
        "@type": "Person",
        "name": image.uploaderName || "Glass Gallery User"
      },
      "copyrightHolder": {
        "@type": "Person",
        "name": image.uploaderName || "Glass Gallery User"
      }
    };
    if (tags.length > 0) imageObjectSchema.keywords = tags.join(', ');
    if (location) imageObjectSchema.locationCreated = { "@type": "Place", "name": location };
    if (image.uploadedAt) {
      imageObjectSchema.datePublished = image.uploadedAt;
      imageObjectSchema.uploadDate = image.uploadedAt;
    }
    schemas.push(imageObjectSchema);

    schemas.push({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Glass Gallery", "item": baseUrl },
        { "@type": "ListItem", "position": 2, "name": image.uploaderName || "Creator", "item": `${baseUrl}/?user=${image.uploaderUid || ''}` },
        { "@type": "ListItem", "position": 3, "name": image.title || "Image" }
      ]
    });

    schemas.push({
      "@context": "https://schema.org",
      "@type": "Organization",
      "name": "Glass Gallery",
      "url": baseUrl,
      "logo": `${baseUrl}/web-app-manifest-512x512.png`,
      "sameAs": []
    });

    const isVideo = /\b(mp4|webm|mov|ogg|avi|mkv|m4v)\b/i.test(imageUrl);

    const jsonLdScripts = schemas.map(s => 
      `<script type="application/ld+json">${JSON.stringify(s)}</script>`
    ).join('\n    ');

    const seoMetaTags = `
    <title>${title} | Glass Gallery</title>
    <meta name="description" content="${description}" />
    <meta name="keywords" content="${tags.map(t => escapeHtml(t)).join(', ')}" />
    <link rel="canonical" href="${pageUrl}" />
    
    <meta property="og:site_name" content="Glass Gallery" />
    <meta property="og:type" content="${isVideo ? 'video.other' : 'article'}" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:url" content="${pageUrl}" />
    <meta property="article:author" content="${uploaderName}" />
    ${image.uploadedAt ? `<meta property="article:published_time" content="${escapeHtml(image.uploadedAt)}" />` : ''}
    
    ${isVideo ? `
    <meta property="og:video" content="${imageUrl}" />
    <meta property="og:video:secure_url" content="${imageUrl}" />
    <meta property="og:video:type" content="video/mp4" />
    <meta property="og:video:width" content="1280" />
    <meta property="og:video:height" content="720" />
    <meta name="twitter:card" content="player" />
    <meta name="twitter:player" content="${pageUrl}" />
    <meta name="twitter:player:stream" content="${imageUrl}" />
    <meta name="twitter:player:stream:content_type" content="video/mp4" />
    <meta name="twitter:player:width" content="1280" />
    <meta name="twitter:player:height" content="720" />
    <meta name="twitter:image" content="${baseUrl}/web-app-manifest-512x512.png" />
    ` : `
    <meta property="og:image" content="${imageUrl}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:image" content="${imageUrl}" />
    `}
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
    
    ${jsonLdScripts}
    `;

    indexHtml = indexHtml.replace(
      /<title>Glass Gallery<\/title>[\s\S]*?<meta name="twitter:image" content="[^"]*" \/>/,
      seoMetaTags
    );

    // Clean up leftover default tags that conflict with our injected SEO tags
    // 1. Remove the default canonical (we inject our own with the correct /image/xxx path)
    indexHtml = indexHtml.replace(/\s*<!-- Canonical URL -->\s*\r?\n?\s*<link\s+rel=["']canonical["']\s+href=["']https:\/\/gg\.modvc\.org\/?["']\s*\/?>/i, '');
    
    // 2. Remove ALL default JSON-LD scripts from the static index.html (we inject image-specific ones)
    indexHtml = indexHtml.replace(/\s*<!-- Static JSON-LD Structured Data[^>]*-->\s*/gi, '');
    indexHtml = indexHtml.replace(/<script\s+type=["']application\/ld\+json["']>\s*\{\s*["']@context["']:\s*["']https:\/\/schema\.org["'][\s\S]*?["']@type["']:\s*["']WebSite["'][\s\S]*?<\/script>/gi, '');
    indexHtml = indexHtml.replace(/<script\s+type=["']application\/ld\+json["']>\s*\{\s*["']@context["']:\s*["']https:\/\/schema\.org["'][\s\S]*?["']@type["']:\s*["']Organization["'][\s\S]*?<\/script>/gi, '');

    // Fetch other recent images to provide internal crawl links for Googlebot
    let moreImagesHtml = "";
    try {
      const moreResult = await db.execute({
        sql: "SELECT id, title, imageUrl FROM images WHERE id != ? ORDER BY uploadedAt DESC LIMIT 6",
        args: [cleanId]
      });
      if (moreResult.rows && moreResult.rows.length > 0) {
        moreImagesHtml = `
        <div style="width: 100%; max-width: 1100px; margin-top: 3.5rem; padding-top: 2rem; border-top: 1px solid #2e2e2e;">
          <h2 style="font-size: 1.35rem; font-weight: 700; margin-bottom: 1.5rem; text-align: center; color: #ffffff;">More Images on Glass Gallery</h2>
          <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 1.25rem;">
            ${moreResult.rows.map(img => `
              <a href="/image/${escapeHtml(img.id)}" style="display: block; text-decoration: none; color: inherit; background: #222222; border-radius: 12px; overflow: hidden; border: 1px solid #333333;">
                <img src="${escapeHtml(img.imageUrl)}" alt="${escapeHtml(img.title || 'Glass Gallery Image')}" loading="lazy" style="width: 100%; height: 180px; object-fit: cover; display: block;" />
                <div style="padding: 0.75rem 1rem;">
                  <h3 style="font-size: 0.95rem; font-weight: 600; margin: 0; color: #ffffff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(img.title || 'Untitled Image')}</h3>
                </div>
              </a>
            `).join('')}
          </div>
        </div>
        `;
      }
    } catch (e) {
      console.warn("Failed to fetch more images for SSR:", e);
    }

    // Inject server-rendered HTML for Googlebot (Dynamic Rendering)
    // This prevents the "Crawled - currently not indexed" issue caused by empty initial DOM
    const mediaHtml = isVideo 
      ? `<video controls autoplay loop muted style="max-width: 100%; border-radius: 1rem; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.5);"><source src="${imageUrl}" type="video/mp4">Your browser does not support the video tag.</video>`
      : `<img src="${imageUrl}" alt="${title}" style="max-width: 100%; border-radius: 1rem; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.5);" />`;

    const serverRenderedHtml = `
      <div style="display: flex; flex-direction: column; align-items: center; padding: 1.5rem; background: #181818; color: #e5e5e5; min-height: 100vh; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
        <header style="width: 100%; max-width: 1100px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; padding-bottom: 1rem; border-bottom: 1px solid #282828;">
          <a href="/" style="display: flex; align-items: center; gap: 0.75rem; text-decoration: none; color: #ffffff; font-size: 1.25rem; font-weight: 700;">
            <img src="/web-app-manifest-512x512.png" alt="Glass Gallery Logo" width="36" height="36" style="border-radius: 8px; display: block;" />
            <span>Glass Gallery</span>
          </a>
          <a href="/" style="color: #f5c3b8; text-decoration: none; font-size: 0.95rem; font-weight: 600;">← Back to Gallery</a>
        </header>

        <nav style="width: 100%; max-width: 1100px; margin-bottom: 1.5rem; font-size: 0.875rem; color: #888;">
          <a href="/" style="color: #a0a0a0; text-decoration: none;">Home</a>
          <span style="margin: 0 0.5rem;">/</span>
          <span style="color: #ffffff;">${title}</span>
        </nav>

        <h1 style="font-size: 2rem; font-weight: 800; margin-bottom: 1.25rem; text-align: center; color: #ffffff;">${title}</h1>
        ${mediaHtml}
        <p style="margin-top: 1.5rem; max-width: 700px; text-align: center; line-height: 1.6; font-size: 1.05rem; color: #d0d0d0;">${description}</p>
        <div style="margin-top: 1.5rem; color: #a0a0a0; text-align: center; line-height: 1.6;">
          <p>Shared by <strong style="color: #ffffff;">${uploaderName}</strong> on Glass Gallery</p>
          ${location ? `<p>Location: ${location}</p>` : ''}
          ${tags.length > 0 ? `<p style="margin-top: 0.5rem;">Tags: ${tags.map(t => `<span style="display: inline-block; background: #282828; padding: 0.2rem 0.6rem; border-radius: 6px; margin: 0.2rem; font-size: 0.85rem; color: #ccc;">#${escapeHtml(t)}</span>`).join(' ')}</p>` : ''}
        </div>

        ${moreImagesHtml}

        <footer style="width: 100%; max-width: 1100px; margin-top: 4rem; padding-top: 1.5rem; border-top: 1px solid #282828; text-align: center; color: #777; font-size: 0.85rem;">
          <p>&copy; 2026 Glass Gallery. Free high-definition image platform. <a href="/legal?tab=terms" style="color: #888; text-decoration: none; margin: 0 0.5rem;">Terms</a> &bull; <a href="/legal?tab=privacy" style="color: #888; text-decoration: none; margin: 0 0.5rem;">Privacy</a></p>
        </footer>
      </div>
    `;
    
    indexHtml = indexHtml.replace(
      /<!-- SKELETON_START -->[\s\S]*?<!-- SKELETON_END -->/, 
      serverRenderedHtml
    );

    // Strip React for known search engine bots so they only index the server-rendered HTML
    // and don't wipe the DOM when JS executes.
    const userAgent = context.request.headers.get('user-agent') || '';
    const isBot = /bot|googlebot|crawler|spider|robot|crawling|facebookexternalhit|twitterbot|inspectiontool/i.test(userAgent);
    
    if (isBot) {
      indexHtml = indexHtml.replace(/<script type="module"[^>]*><\/script>/gi, '');
      indexHtml = indexHtml.replace(/<script type="importmap">[\s\S]*?<\/script>/gi, '');
    }

    return new Response(indexHtml, {
      status: 200,
      headers: {
        'Content-Type': 'text/html',
        'Cache-Control': 's-maxage=3600, stale-while-revalidate=86400'
      }
    });

  } catch (error) {
    console.error("[og-image] Error:", error);
    return Response.redirect(`${baseUrl}/?image=${id}`, 302);
  }
}
