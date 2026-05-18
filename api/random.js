import { db } from "./lib/turso.js";

export default async function handler(req, res) {
  // enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { category, title, limit = 1 } = req.query;
  const count = Math.min(Math.max(parseInt(limit), 1), 20); // Cap limit between 1 and 20

  try {
    let query = "SELECT * FROM images WHERE 1=1";
    const args = [];

    // Filter by category (JSON string matching)
    if (category) {
      query += " AND LOWER(flags) LIKE ?";
      args.push(`%${category.toLowerCase()}%`);
    }

    // Filter by title (partial matching)
    if (title) {
      query += " AND LOWER(title) LIKE ?";
      args.push(`%${title.toLowerCase()}%`);
    }

    query += " ORDER BY RANDOM() LIMIT ?";
    args.push(count);

    const result = await db.execute({ sql: query, args });

    const images = result.rows.map(row => {
      const flagsArray = row.flags ? JSON.parse(row.flags) : [];
      return {
        id: row.id,
        imageUrl: row.imageUrl,
        url: row.imageUrl, // Alias for compatibility
        title: row.title || '',
        description: row.description || '',
        uploaderName: row.uploaderName || 'Anonymous',
        tags: flagsArray,
        license: row.license || 'CC0',
        createdAt: row.uploadedAt
      };
    });

    res.status(200).json({
      success: true,
      count: images.length,
      filter: { category: category || 'all', title: title || 'any' },
      data: images
    });

  } catch (error) {
    console.error("API Error in random.js:", error);
    res.status(500).json({ success: false, error: "Failed to fetch random images." });
  }
}
