import { db } from "./lib/turso.js";
import fs from "fs";
import path from "path";

// License URL mapping
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

export default async function handler(req, res) {
  const { id } = req.query;

  if (!id) {
    return res.redirect('/');
  }

  const baseUrl = "https://glassgallery.modvc.org";

  try {
    const result = await db.execute({
      sql: "SELECT * FROM images WHERE id = ?",
      args: [id]
    });

    // Read the base index.html from dist (Vercel builds output)
    let indexHtml;
    try {
      indexHtml = fs.readFileSync(path.join(process.cwd(), 'dist', 'index.html'), 'utf-8');
    } catch {
      // Fallback for local dev / different build paths
      try {
        indexHtml = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf-8');
      } catch {
        indexHtml = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Glass Gallery</title></head><body><div id="root"></div><script>window.location.href="/?image=${escapeHtml(id)}";</script></body></html>`;
      }
    }

    if (result.rows.length === 0) {
      // Image not found - still serve the SPA so client-side routing handles it
      res.setHeader('Content-Type', 'text/html');
      res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
      return res.status(200).send(indexHtml);
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

    // === Build JSON-LD Structured Data ===
    const schemas = [];

    // 1. ImageObject schema (for Google Images rich results + Licensable badge)
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
    if (tags.length > 0) {
      imageObjectSchema.keywords = tags.join(', ');
    }
    if (location) {
      imageObjectSchema.locationCreated = {
        "@type": "Place",
        "name": location
      };
    }
    if (image.uploadedAt) {
      imageObjectSchema.datePublished = image.uploadedAt;
      imageObjectSchema.uploadDate = image.uploadedAt;
    }
    schemas.push(imageObjectSchema);

    // 2. BreadcrumbList schema (for breadcrumb trail in search results)
    schemas.push({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [
        {
          "@type": "ListItem",
          "position": 1,
          "name": "Glass Gallery",
          "item": baseUrl
        },
        {
          "@type": "ListItem",
          "position": 2,
          "name": image.uploaderName || "Creator",
          "item": `${baseUrl}/?user=${image.uploaderUid || ''}`
        },
        {
          "@type": "ListItem",
          "position": 3,
          "name": image.title || "Image"
        }
      ]
    });

    // 3. Organization schema (for logo in knowledge panel)
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

    // === Build SEO Meta Tags ===
    const seoMetaTags = `
    <title>${title} | Glass Gallery</title>
    <meta name="description" content="${description}" />
    <meta name="keywords" content="${tags.map(t => escapeHtml(t)).join(', ')}" />
    <link rel="canonical" href="${pageUrl}" />
    
    <!-- Open Graph -->
    <meta property="og:site_name" content="Glass Gallery" />
    <meta property="og:type" content="article" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:image" content="${imageUrl}" />
    <meta property="og:url" content="${pageUrl}" />
    <meta property="article:author" content="${uploaderName}" />
    ${image.uploadedAt ? `<meta property="article:published_time" content="${escapeHtml(image.uploadedAt)}" />` : ''}
    
    <!-- Twitter Card -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
    <meta name="twitter:image" content="${imageUrl}" />
    
    <!-- JSON-LD Structured Data for Rich Results -->
    ${jsonLdScripts}
    `;

    // Inject SEO tags by replacing the default <title> block
    indexHtml = indexHtml.replace(
      /<title>Glass Gallery<\/title>[\s\S]*?<meta name="description"[^>]*\/>/,
      seoMetaTags
    );

    // Also replace default OG tags if present
    indexHtml = indexHtml.replace(/<meta property="og:title" content="Glass Gallery"[^>]*\/?>/, '');
    indexHtml = indexHtml.replace(/<meta property="og:description"[^>]*\/?>/, '');
    indexHtml = indexHtml.replace(/<meta property="og:image" content="https:\/\/glassgallery\.modvc\.org\/web-app-manifest[^"]*"[^>]*\/?>/, '');

    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).send(indexHtml);

  } catch (error) {
    console.error("[og-image] Error:", error);
    // Fallback: redirect to SPA with query param
    return res.redirect(`/?image=${id}`);
  }
}
