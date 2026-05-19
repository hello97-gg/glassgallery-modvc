import { getDb } from "./api/lib/turso.js";

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

export async function onRequest(context) {
  const baseUrl = "https://gg.modvc.org";

  // Static routes
  const staticUrls = [
    { loc: baseUrl, changefreq: "daily", priority: "1.0" },
    { loc: `${baseUrl}/?view=explore`, changefreq: "daily", priority: "0.8" },
    { loc: `${baseUrl}/?view=api`, changefreq: "monthly", priority: "0.5" },
  ];

  let dynamicUrls = [];

  try {
    const db = getDb(context.env);
    // Fetch all images from SQLite
    const result = await db.execute("SELECT id, imageUrl, title, description, uploadedAt, license, uploaderUid FROM images ORDER BY uploadedAt DESC LIMIT 1000");
    
    dynamicUrls = result.rows.map(row => {
      const timestamp = row.uploadedAt;
      const license = row.license || 'CC0';
      const licenseUrls = {
        'CC0': 'https://creativecommons.org/publicdomain/zero/1.0/',
        'CC-BY': 'https://creativecommons.org/licenses/by/4.0/',
        'CC BY': 'https://creativecommons.org/licenses/by/4.0/',
        'CC-BY-SA': 'https://creativecommons.org/licenses/by-sa/4.0/',
        'CC BY-SA': 'https://creativecommons.org/licenses/by-sa/4.0/',
        'CC-BY-NC': 'https://creativecommons.org/licenses/by-nc/4.0/',
        'CC BY-NC': 'https://creativecommons.org/licenses/by-nc/4.0/',
      };
      return {
        loc: `${baseUrl}/image/${row.id}`,
        lastmod: timestamp ? new Date(timestamp).toISOString() : new Date().toISOString(),
        changefreq: "weekly",
        priority: "0.7",
        imageLoc: row.imageUrl,
        imageTitle: row.title || "",
        imageCaption: row.description || "",
        imageLicense: licenseUrls[license] || license
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
        const hasValidLicense = url.imageLicense && (url.imageLicense.startsWith("http://") || url.imageLicense.startsWith("https://"));
        imgXml = `
    <image:image>
      <image:loc>${escapeXml(url.imageLoc)}</image:loc>
      ${url.imageTitle ? `<image:title>${escapeXml(url.imageTitle)}</image:title>` : ""}
      ${url.imageCaption ? `<image:caption>${escapeXml(url.imageCaption)}</image:caption>` : ""}
      ${hasValidLicense ? `<image:license>${escapeXml(url.imageLicense)}</image:license>` : ""}
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

  return new Response(sitemap, {
    status: 200,
    headers: {
      "Content-Type": "application/xml",
      "Cache-Control": "s-maxage=3600, stale-while-revalidate"
    }
  });
}
