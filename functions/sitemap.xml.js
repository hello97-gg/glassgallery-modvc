import { getDb } from "./api/lib/turso.js";

export async function onRequest(context) {
  const baseUrl = "https://gg.modvc.org";
  const nowIso = new Date().toISOString();
  const CHUNK_SIZE = 1000;

  let totalPages = 1;

  try {
    const db = getDb(context.env);
    const countResult = await db.execute("SELECT COUNT(*) as count FROM images");
    const totalCount = countResult.rows[0]?.count || 0;
    totalPages = Math.max(1, Math.ceil(totalCount / CHUNK_SIZE));
  } catch (error) {
    console.error("[Sitemap Index] Count query error, using fallback chunks:", error);
    totalPages = 4; // safe fallback based on ~3,557 known images
  }

  const sitemapEntries = [
    `  <sitemap>
    <loc>${baseUrl}/sitemap/static.xml</loc>
    <lastmod>${nowIso}</lastmod>
  </sitemap>`,
    `  <sitemap>
    <loc>${baseUrl}/sitemap/creators.xml</loc>
    <lastmod>${nowIso}</lastmod>
  </sitemap>`
  ];

  for (let i = 1; i <= totalPages; i++) {
    sitemapEntries.push(`  <sitemap>
    <loc>${baseUrl}/sitemap/${i}.xml</loc>
    <lastmod>${nowIso}</lastmod>
  </sitemap>`);
  }

  const sitemapIndexXml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapEntries.join("\n")}
</sitemapindex>`;

  return new Response(sitemapIndexXml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=UTF-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
