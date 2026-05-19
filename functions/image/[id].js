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
  const baseUrl = "https://glassgallery.modvc.org";
  const url = new URL(context.request.url);

  if (!id) {
    return Response.redirect(baseUrl + '/', 302);
  }

  try {
    const db = getDb(context.env);
    const result = await db.execute({
      sql: "SELECT * FROM images WHERE id = ?",
      args: [id]
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

    const jsonLdScripts = schemas.map(s => 
      `<script type="application/ld+json">${JSON.stringify(s)}</script>`
    ).join('\n    ');

    const seoMetaTags = `
    <title>${title} | Glass Gallery</title>
    <meta name="description" content="${description}" />
    <meta name="keywords" content="${tags.map(t => escapeHtml(t)).join(', ')}" />
    <link rel="canonical" href="${pageUrl}" />
    
    <meta property="og:site_name" content="Glass Gallery" />
    <meta property="og:type" content="article" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:image" content="${imageUrl}" />
    <meta property="og:url" content="${pageUrl}" />
    <meta property="article:author" content="${uploaderName}" />
    ${image.uploadedAt ? `<meta property="article:published_time" content="${escapeHtml(image.uploadedAt)}" />` : ''}
    
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
    <meta name="twitter:image" content="${imageUrl}" />
    
    ${jsonLdScripts}
    `;

    indexHtml = indexHtml.replace(
      /<title>Glass Gallery<\/title>[\s\S]*?<meta name="description"[^>]*\/>/,
      seoMetaTags
    );
    indexHtml = indexHtml.replace(/<meta property="og:title" content="Glass Gallery"[^>]*\/?>/, '');
    indexHtml = indexHtml.replace(/<meta property="og:description"[^>]*\/?>/, '');
    indexHtml = indexHtml.replace(/<meta property="og:image" content="https:\/\/glassgallery\.modvc\.org\/web-app-manifest[^"]*"[^>]*\/?>/, '');

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
