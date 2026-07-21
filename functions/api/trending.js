import { getDb } from "./lib/turso.js";

const corsHeaders = {
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': '*'
};

function decodeHtmlEntities(str) {
  if (!str) return '';
  return str
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/^[!&<>;]+/, '')
    .trim();
}

export async function onRequest(context) {
  if (context.request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const env = context.env;
  const db = getDb(env);

  try {
    const res = await db.execute(`
      SELECT flags, title, description, aiConcepts, likeCount, downloadCount 
      FROM images 
      ORDER BY uploadedAt DESC
      LIMIT 500
    `);

    const topicsScores = {};

    res.rows.forEach(row => {
      let tags = [];
      
      // Parse flags
      if (row.flags) {
        try {
          const parsed = JSON.parse(row.flags);
          if (Array.isArray(parsed)) tags.push(...parsed);
        } catch (e) {
          if (typeof row.flags === 'string') tags.push(row.flags);
        }
      }

      // Parse aiConcepts
      if (row.aiConcepts) {
        try {
          const parsedAi = JSON.parse(row.aiConcepts);
          if (Array.isArray(parsedAi)) tags.push(...parsedAi);
        } catch (e) { }
      }

      // Extract words from title if tags are sparse
      if (row.title) {
        const words = row.title.split(/\s+/).filter(w => w.length > 3 && !/^[0-9]+$/.test(w));
        tags.push(...words.slice(0, 2));
      }

      const score = (row.likeCount || 0) * 5 + (row.downloadCount || 0) * 2 + 1;

      tags.forEach(rawTag => {
        if (!rawTag) return;
        const clean = decodeHtmlEntities(String(rawTag));
        if (!clean || clean.length < 2 || clean === 'null' || clean === 'undefined' || /^[^a-zA-Z0-9]+$/.test(clean)) return;

        const normalized = clean.charAt(0).toUpperCase() + clean.slice(1);
        topicsScores[normalized] = (topicsScores[normalized] || 0) + score;
      });
    });

    let trending = Object.entries(topicsScores)
      .map(([topic, score]) => ({ topic, score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);

    // Fallback curated topics if database has very few clean tags
    if (trending.length < 4) {
      const fallbacks = [
        { topic: 'Digital Art', score: 100 },
        { topic: 'Anime & Illustration', score: 85 },
        { topic: 'Urban Photography', score: 70 },
        { topic: '3D Render & Motion', score: 65 },
        { topic: 'AI Generative', score: 50 },
        { topic: 'Cyberpunk Aesthetics', score: 40 }
      ];
      
      const existingTopics = new Set(trending.map(t => t.topic.toLowerCase()));
      fallbacks.forEach(fb => {
        if (!existingTopics.has(fb.topic.toLowerCase()) && trending.length < 8) {
          trending.push(fb);
        }
      });
    }

    return new Response(JSON.stringify({ success: true, trending }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=43200' // Cache for 12 hours (43200 seconds)
      }
    });
  } catch (error) {
    console.error("Database query failed:", error);
    return new Response(JSON.stringify({ 
      success: true, 
      trending: [
        { topic: 'Digital Art', score: 100 },
        { topic: 'Anime & Illustration', score: 85 },
        { topic: 'Urban Photography', score: 70 },
        { topic: '3D Render', score: 65 }
      ] 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
