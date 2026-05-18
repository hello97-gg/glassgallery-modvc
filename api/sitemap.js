import { db } from "./lib/turso.js";

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

export default async function handler(req, res) {
  const baseUrl = "https://glassgallery.modvc.org";

  // Static routes
  const staticUrls = [
    { loc: baseUrl, changefreq: "daily", priority: "1.0" },
    { loc: `${baseUrl}/?view=explore`, changefreq: "daily", priority: "0.8" },
    { loc: `${baseUrl}/?view=api`, changefreq: "monthly", priority: "0.5" },
  ];

  let dynamicUrls = [];

  try {
    // Fetch all images from SQLite
    const result = await db.execute("SELECT id, imageUrl, title, description, uploadedAt FROM images ORDER BY uploadedAt DESC LIMIT 1000");
    
    dynamicUrls = result.rows.map(row => {
      const timestamp = row.uploadedAt;
      return {
        loc: `${baseUrl}/image/${row.id}`,
        lastmod: timestamp ? new Date(timestamp).toISOString() : new Date().toISOString(),
        changefreq: "weekly",
        priority: "0.7",
        imageLoc: row.imageUrl,
        imageTitle: row.title || "",
        imageCaption: row.description || ""
      };
    });
  } catch (error) {
    console.error("Sitemap generation error:", error);
  }

  const allUrls = [...staticUrls, ...dynamicUrls];

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
  ${allUrls
    .map((url) => {
      let imgXml = "";
      if (url.imageLoc) {
        imgXml = `
    <image:image>
      <image:loc>${escapeXml(url.imageLoc)}</image:loc>
      ${url.imageTitle ? `<image:title>${escapeXml(url.imageTitle)}</image:title>` : ""}
      ${url.imageCaption ? `<image:caption>${escapeXml(url.imageCaption)}</image:caption>` : ""}
    </image:image>`;
      }
      return `
  <url>
    <loc>${url.loc}</loc>
    ${url.lastmod ? `<lastmod>${url.lastmod}</lastmod>` : ""}
    <changefreq>${url.changefreq}</changefreq>
    <priority>${url.priority}</priority>${imgXml}
  </url>`;
    })
    .join("")}
</urlset>`;

  res.setHeader("Content-Type", "application/xml");
  res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate");
  res.status(200).send(sitemap);
}
