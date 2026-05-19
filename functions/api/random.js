import { getDb } from "./lib/turso.js";

const corsHeaders = {
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
};

export async function onRequest(context) {
  const request = context.request;
  
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(request.url);
  const category = url.searchParams.get('category');
  const title = url.searchParams.get('title');
  const limit = url.searchParams.get('limit') || 1;
  const count = Math.min(Math.max(parseInt(limit), 1), 20); // Cap limit between 1 and 20

  try {
    const db = getDb(context.env);
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
      let flagsArray = [];
      try {
        flagsArray = row.flags ? JSON.parse(row.flags) : [];
      } catch {}
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

    return Response.json({
      success: true,
      count: images.length,
      filter: { category: category || 'all', title: title || 'any' },
      data: images
    }, { headers: corsHeaders });

  } catch (error) {
    console.error("API Error in random.js:", error);
    return Response.json({ success: false, error: "Failed to fetch random images." }, { status: 500, headers: corsHeaders });
  }
}
