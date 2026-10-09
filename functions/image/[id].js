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

  if (!id) {
    return Response.redirect(`${baseUrl}/gallery`, 302);
  }

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

    // If image doesn't exist, return proper HTTP 404 (fixing soft-404)
    if (result.rows.length === 0) {
      return new Response(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>404 - Image Not Found | Glass Gallery</title><meta name="robots" content="noindex, follow" /></head><body style="background:#181818;color:#e5e5e5;font-family:system-ui,sans-serif;text-align:center;padding:4rem;"><h1>404 - Image Not Found</h1><p style="color:#a0a0a0;margin:1rem 0 2rem;">The requested image does not exist or may have been deleted.</p><a href="/gallery" style="display:inline-block;background:#f5c3b8;color:#181818;padding:0.75rem 1.5rem;border-radius:999px;text-decoration:none;font-weight:600;">Browse Gallery Archive</a></body></html>`, {
        status: 404,
        headers: {
          'Content-Type': 'text/html; charset=UTF-8',
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        }
      });
    }

    const image = result.rows[0];

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
      indexHtml = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Glass Gallery</title></head><body><div id="root"></div></body></html>`;
    }

    // Capitalize and format Title (guarantee 35 - 65 chars for SEO)
    const rawTitle = (image.title || "Untitled Photograph").trim();
    const title = rawTitle.charAt(0).toUpperCase() + rawTitle.slice(1);
    let seoTitle = `${title} | Glass Gallery`;
    if (seoTitle.length < 35) {
      seoTitle = `${title} – Free HD Wallpaper | Glass Gallery`;
    }
    if (seoTitle.length > 65) {
      seoTitle = seoTitle.length <= 65 ? seoTitle : seoTitle.slice(0, 62) + '...';
    }

    const uploaderName = escapeHtml((image.uploaderName || "Creator").trim());
    
    // Guarantee Description length 70 - 155 chars
    let rawDesc = (image.description || "").trim();
    let description = rawDesc;
    if (!description || description.length < 70) {
      description = `View and download high-resolution photograph ${title} by ${uploaderName} on Glass Gallery. Free to share and enjoy in full quality.`;
    }
    if (description.length > 155) {
      description = description.slice(0, 152) + '...';
    }

    const imageUrl = image.imageUrl || "";
    const location = image.location || "";
    const license = image.license || "CC0";
    const licenseUrl = LICENSE_URLS[license] || license;
    const pageUrl = `${baseUrl}/image/${id}`;
    const altText = `${title} photography by ${uploaderName} on Glass Gallery`;

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
      "name": title,
      "description": description,
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
        { "@type": "ListItem", "position": 2, "name": "Gallery Archive", "item": `${baseUrl}/gallery` },
        { "@type": "ListItem", "position": 3, "name": title }
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
    <title>${escapeHtml(seoTitle)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <meta name="keywords" content="${tags.map(t => escapeHtml(t)).join(', ')}" />
    <link rel="canonical" href="${pageUrl}" />
    
    <meta property="og:site_name" content="Glass Gallery" />
    <meta property="og:type" content="${isVideo ? 'video.other' : 'article'}" />
    <meta property="og:title" content="${escapeHtml(seoTitle)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
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
    <meta name="twitter:title" content="${escapeHtml(seoTitle)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    
    ${jsonLdScripts}
    `;

    if (indexHtml.includes('<!-- SEO_META_START -->')) {
      indexHtml = indexHtml.replace(/<!-- SEO_META_START -->[\s\S]*?<!-- SEO_META_END -->/, seoMetaTags);
    } else {
      indexHtml = indexHtml.replace(
        /<title>[\s\S]*?<\/title>[\s\S]*?<meta name="twitter:image" content="[^"]*" \/>\s*(?:<!-- Canonical URL -->\s*)?(?:<link rel="canonical"[^>]*>)?/i,
        seoMetaTags
      );
    }

    if (indexHtml.includes('<!-- JSON_LD_START -->')) {
      indexHtml = indexHtml.replace(/<!-- JSON_LD_START -->[\s\S]*?<!-- JSON_LD_END -->/, '');
    } else {
      indexHtml = indexHtml.replace(/\s*<!-- Static JSON-LD Structured Data[^>]*-->\s*/gi, '');
      indexHtml = indexHtml.replace(/<script\s+type=["']application\/ld\+json["']>\s*\{\s*["']@context["']:\s*["']https:\/\/schema\.org["'][\s\S]*?<\/script>/gi, '');
    }

    // Fetch previous, next, and 8 related images to form an unbroken internal backlink mesh
    let prevImage = null;
    let nextImage = null;
    let moreImages = [];
    try {
      const [prevRes, nextRes, moreRes] = await Promise.all([
        db.execute({ sql: "SELECT id, title FROM images WHERE id < ? ORDER BY id DESC LIMIT 1", args: [cleanId] }),
        db.execute({ sql: "SELECT id, title FROM images WHERE id > ? ORDER BY id ASC LIMIT 1", args: [cleanId] }),
        db.execute({ sql: "SELECT id, title, imageUrl, uploaderName FROM images WHERE id != ? ORDER BY uploadedAt DESC LIMIT 8", args: [cleanId] })
      ]);
      prevImage = prevRes.rows?.[0] || null;
      nextImage = nextRes.rows?.[0] || null;
      moreImages = moreRes.rows || [];
    } catch (e) {
      console.warn("Failed to fetch link mesh for SSR:", e);
    }

    const mediaHtml = isVideo 
      ? `<video controls autoplay loop muted width="1200" height="700" style="max-width: 100%; border-radius: 1rem; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.5);"><source src="${imageUrl}" type="video/mp4">Your browser does not support the video tag.</video>`
      : `<img src="${imageUrl}" alt="${escapeHtml(altText)}" width="1200" height="800" style="max-width: 100%; height: auto; max-height: 700px; object-fit: contain; border-radius: 1rem; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.5);" />`;

    const serverRenderedHtml = `
      <div style="display: flex; flex-direction: column; align-items: center; padding: 1.5rem; background: #181818; color: #e5e5e5; min-height: 100vh; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
        <header style="width: 100%; max-width: 1100px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; padding-bottom: 1rem; border-bottom: 1px solid #282828;">
          <a href="/" style="display: flex; align-items: center; gap: 0.75rem; text-decoration: none; color: #ffffff; font-size: 1.25rem; font-weight: 700;">
            <img src="/web-app-manifest-512x512.png" alt="Glass Gallery Logo" width="36" height="36" style="border-radius: 8px; display: block;" />
            <span>Glass Gallery</span>
          </a>
          <nav style="display: flex; gap: 1.25rem; align-items: center;">
            <a href="/" style="color: #a0a0a0; text-decoration: none; font-size: 0.95rem;">Explore Gallery</a>
            <a href="/gallery" style="color: #f5c3b8; text-decoration: none; font-size: 0.95rem; font-weight: 600;">Gallery Directory</a>
            <a href="/api" style="color: #a0a0a0; text-decoration: none; font-size: 0.95rem;">API Reference</a>
          </nav>
        </header>

        <nav aria-label="Breadcrumb navigation" style="width: 100%; max-width: 1100px; margin-bottom: 1rem; font-size: 0.875rem; color: #888;">
          <a href="/" style="color: #a0a0a0; text-decoration: none;">Explore Home</a>
          <span style="margin: 0 0.5rem;">/</span>
          <a href="/gallery" style="color: #a0a0a0; text-decoration: none;">Gallery Archive</a>
          <span style="margin: 0 0.5rem;">/</span>
          <span style="color: #ffffff;">${escapeHtml(title)}</span>
        </nav>

        <h1 style="font-size: 2rem; font-weight: 800; margin-bottom: 1.25rem; text-align: center; color: #ffffff;">${escapeHtml(title)}</h1>
        ${mediaHtml}
        
        <p style="margin-top: 1.5rem; max-width: 750px; text-align: center; line-height: 1.6; color: #b8b8b8; font-size: 1.05rem;">${escapeHtml(description)}</p>
        
        <!-- Semantic Image Details List -->
        <ul style="list-style: none; padding: 0; margin: 1.5rem 0 0 0; color: #a0a0a0; display: flex; gap: 1.5rem; flex-wrap: wrap; justify-content: center; font-size: 0.9rem;">
          <li><strong>Photographer:</strong> ${uploaderName}</li>
          ${location ? `<li><strong>Location:</strong> ${escapeHtml(location)}</li>` : ''}
          <li><strong>License:</strong> <a href="${escapeHtml(licenseUrl)}" target="_blank" rel="noopener noreferrer" style="color: #f5c3b8; text-decoration: underline;">${escapeHtml(license)} License</a></li>
        </ul>

        ${tags.length > 0 ? `
          <!-- Semantic Tags List -->
          <ul style="list-style: none; padding: 0; margin: 1rem 0 0 0; display: flex; gap: 0.5rem; flex-wrap: wrap; justify-content: center;">
            ${tags.map(t => `<li><span style="background: #252525; border: 1px solid #333; color: #bbb; padding: 0.25rem 0.65rem; border-radius: 999px; font-size: 0.8rem; display: inline-block;">#${escapeHtml(t)}</span></li>`).join('')}
          </ul>
        ` : ''}

        <!-- Next / Previous Image Navigation Mesh -->
        <nav aria-label="Adjacent image links" style="width: 100%; max-width: 1100px; margin-top: 2.5rem; padding: 1rem 0; border-top: 1px solid #282828; border-bottom: 1px solid #282828; display: flex; justify-content: space-between; align-items: center; gap: 1rem; font-size: 0.95rem; flex-wrap: wrap;">
          ${prevImage ? `<a href="/image/${escapeHtml(prevImage.id)}" style="color: #f5c3b8; text-decoration: none; font-weight: 600;">&larr; Previous Image: ${escapeHtml(prevImage.title || 'Showcase')}</a>` : '<span></span>'}
          <a href="/gallery" style="color: #a0a0a0; text-decoration: none; font-weight: 500;">Browse All Images in Directory</a>
          ${nextImage ? `<a href="/image/${escapeHtml(nextImage.id)}" style="color: #f5c3b8; text-decoration: none; font-weight: 600;">Next Image: ${escapeHtml(nextImage.title || 'Showcase')} &rarr;</a>` : '<span></span>'}
        </nav>

        <!-- More Images on Glass Gallery with Descriptive Anchor Text -->
        ${moreImages.length > 0 ? `
          <section style="width: 100%; max-width: 1100px; margin-top: 2.5rem;">
            <h2 style="font-size: 1.35rem; font-weight: 700; margin-bottom: 1.5rem; text-align: center; color: #ffffff;">More Showcases on Glass Gallery</h2>
            <ul style="list-style: none; padding: 0; margin: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 1.25rem;">
              ${moreImages.map(img => `
                <li>
                  <a href="/image/${escapeHtml(img.id)}" style="display: block; text-decoration: none; color: inherit; background: #222222; border-radius: 12px; overflow: hidden; border: 1px solid #333333; height: 100%;">
                    <img src="${escapeHtml(img.imageUrl)}" alt="${escapeHtml(img.title || 'Photograph')} by ${escapeHtml(img.uploaderName || 'Creator')}" width="280" height="180" loading="lazy" style="width: 100%; height: 180px; object-fit: cover; display: block;" />
                    <div style="padding: 0.75rem 1rem;">
                      <h3 style="font-size: 0.95rem; font-weight: 600; margin: 0 0 0.25rem 0; color: #ffffff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(img.title || 'Untitled Image')}</h3>
                      <span style="font-size: 0.8rem; color: #888;">By ${escapeHtml(img.uploaderName || 'Creator')}</span>
                    </div>
                  </a>
                </li>
              `).join('')}
            </ul>
          </section>
        ` : ''}

        <footer style="width: 100%; max-width: 1100px; margin-top: 4rem; padding-top: 1.5rem; border-top: 1px solid #282828; text-align: center; color: #777; font-size: 0.85rem;">
          <p>&copy; 2026 Glass Gallery. Free high-definition image platform.</p>
          <p>
            <a href="/" style="color: #aaa; text-decoration: none;">Explore Gallery</a> &bull;
            <a href="/gallery" style="color: #aaa; text-decoration: none;">Gallery Directory</a> &bull;
            <a href="/api" style="color: #aaa; text-decoration: none;">API Documentation</a> &bull;
            <a href="/legal?tab=terms" style="color: #888; text-decoration: none; margin: 0 0.5rem;">Terms of Service</a> &bull;
            <a href="/legal?tab=privacy" style="color: #888; text-decoration: none; margin: 0 0.5rem;">Privacy Policy</a> &bull;
            <a href="/legal?tab=guidelines" style="color: #888; text-decoration: none; margin: 0 0.5rem;">Content Guidelines</a>
          </p>
        </footer>
      </div>
    `;
    
    indexHtml = indexHtml.replace(
      /<!-- SKELETON_START -->[\s\S]*?<!-- SKELETON_END -->/, 
      serverRenderedHtml
    );

    // Strip React for known search engine bots so they only index the server-rendered HTML
    const userAgent = context.request.headers.get('user-agent') || '';
    const isBot = /bot|googlebot|crawler|spider|robot|crawling|facebookexternalhit|twitterbot|inspectiontool/i.test(userAgent);
    
    if (isBot) {
      indexHtml = indexHtml.replace(/<script type="module"[^>]*><\/script>/gi, '');
      indexHtml = indexHtml.replace(/<script type="importmap">[\s\S]*?<\/script>/gi, '');
    }

    return new Response(indexHtml, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=UTF-8',
        'Cache-Control': 's-maxage=3600, stale-while-revalidate=86400'
      }
    });

  } catch (error) {
    console.error("[og-image] Error:", error);
    return Response.redirect(`${baseUrl}/gallery`, 302);
  }
}
