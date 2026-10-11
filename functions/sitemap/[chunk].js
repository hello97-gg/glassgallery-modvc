import { getDb } from "../api/lib/turso.js";

function escapeXml(unsafe) {
  if (!unsafe) return "";
  return unsafe.toString().replace(/[<>&'"]/g, function (c) {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

const licenseUrls = {
  'CC0': 'https://creativecommons.org/publicdomain/zero/1.0/',
  'CC-BY': 'https://creativecommons.org/licenses/by/4.0/',
  'CC BY': 'https://creativecommons.org/licenses/by/4.0/',
  'CC-BY-SA': 'https://creativecommons.org/licenses/by-sa/4.0/',
  'CC BY-SA': 'https://creativecommons.org/licenses/by-sa/4.0/',
  'CC-BY-NC': 'https://creativecommons.org/licenses/by-nc/4.0/',
  'CC BY-NC': 'https://creativecommons.org/licenses/by-nc/4.0/',
};

export async function onRequest(context) {
  const baseUrl = "https://gg.modvc.org";
  const rawChunk = context.params.chunk || "";
  // Strip .xml extension if present
  const chunkName = rawChunk.replace(/\.xml$/i, "").toLowerCase();

  const xmlHeaders = {
    "Content-Type": "application/xml; charset=UTF-8",
    "Cache-Control": "public, max-age=3600, s-maxage=86400",
    "X-Content-Type-Options": "nosniff"
  };

  // Case 1: Static Pages Sub-Sitemap (/sitemap/static.xml)
  if (chunkName === "static") {
    const nowIso = new Date().toISOString();
    const staticUrls = [
      { loc: `${baseUrl}/`, lastmod: nowIso, changefreq: "daily", priority: "1.0" },
      { loc: `${baseUrl}/gallery`, lastmod: nowIso, changefreq: "daily", priority: "0.9" },
      { loc: `${baseUrl}/api`, lastmod: nowIso, changefreq: "weekly", priority: "0.7" },
      { loc: `${baseUrl}/legal`, lastmod: nowIso, changefreq: "monthly", priority: "0.5" },
    ];

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticUrls.map(u => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join("\n")}
</urlset>`;

    return new Response(xml, { status: 200, headers: xmlHeaders });
  }

  // Case 2: Creators Sub-Sitemap (/sitemap/creators.xml)
  if (chunkName === "creators") {
    try {
      const db = getDb(context.env);
      const result = await db.execute(`
        SELECT uploaderUid, uploaderName FROM users WHERE uploaderName IS NOT NULL AND TRIM(uploaderName) != ''
        UNION
        SELECT DISTINCT uploaderUid, uploaderName FROM images WHERE uploaderName IS NOT NULL AND TRIM(uploaderName) != ''
      `);

      const nowIso = new Date().toISOString();
      const seenHandles = new Set();
      const creatorUrls = [];

      for (const row of (result.rows || [])) {
        const rawName = (row.uploaderName || '').trim();
        const handle = rawName.replace(/\s+/g, '').toLowerCase();
        if (!handle || seenHandles.has(handle)) continue;
        seenHandles.add(handle);

        creatorUrls.push(`  <url>
    <loc>${baseUrl}/@${escapeXml(handle)}</loc>
    <lastmod>${nowIso}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.85</priority>
  </url>`);
      }

      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${creatorUrls.join("\n")}
</urlset>`;

      return new Response(xml, { status: 200, headers: xmlHeaders });
    } catch (err) {
      console.error("[Sitemap Creators] Error:", err);
      return new Response(`Error generating creators sitemap: ${err.message}`, { status: 500, headers: { "Content-Type": "text/plain" } });
    }
  }

  // Case 3: Chunked Image Sub-Sitemaps (/sitemap/1.xml, /sitemap/2.xml, ...)
  const pageNumber = parseInt(chunkName, 10);
  if (isNaN(pageNumber) || pageNumber < 1) {
    return new Response("Sitemap chunk not found", { status: 404, headers: { "Content-Type": "text/plain" } });
  }

  const CHUNK_SIZE = 1000;
  const offset = (pageNumber - 1) * CHUNK_SIZE;

  try {
    const db = getDb(context.env);
    const result = await db.execute({
      sql: "SELECT id, imageUrl, title, description, uploadedAt, license, uploaderUid FROM images ORDER BY uploadedAt DESC LIMIT ? OFFSET ?",
      args: [CHUNK_SIZE, offset]
    });

    const rows = result.rows || [];
    if (rows.length === 0 && pageNumber > 1) {
      return new Response("Sitemap chunk out of range", { status: 404, headers: { "Content-Type": "text/plain" } });
    }

    const urlEntries = rows.map(row => {
      const timestamp = row.uploadedAt;
      const license = row.license || 'CC0';
      const isVideo = /\b(mp4|webm|mov|ogg|avi|mkv|m4v)\b/i.test(row.imageUrl || "");
      const loc = `${baseUrl}/image/${row.id}`;
      const lastmod = timestamp ? new Date(timestamp).toISOString() : new Date().toISOString();

      let imgXml = "";
      if (!isVideo && row.imageUrl) {
        const fullLicense = licenseUrls[license] || license;
        const hasValidLicense = fullLicense && (fullLicense.startsWith("http://") || fullLicense.startsWith("https://"));
        imgXml = `
    <image:image>
      <image:loc>${escapeXml(row.imageUrl)}</image:loc>${row.title ? `\n      <image:title>${escapeXml(row.title)}</image:title>` : ""}${row.description ? `\n      <image:caption>${escapeXml(row.description)}</image:caption>` : ""}${hasValidLicense ? `\n      <image:license>${escapeXml(fullLicense)}</image:license>` : ""}
    </image:image>`;
      }

      return `  <url>
    <loc>${loc}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>${imgXml}
  </url>`;
    });

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urlEntries.join("\n")}
</urlset>`;

    return new Response(xml, { status: 200, headers: xmlHeaders });
  } catch (err) {
    console.error(`[Sitemap Chunk ${pageNumber}] Error:`, err);
    return new Response(`Error generating sitemap chunk: ${err.message}`, { status: 500, headers: { "Content-Type": "text/plain" } });
  }
}
