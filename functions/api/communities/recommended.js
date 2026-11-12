import { getDb } from "../lib/turso.js";

const corsHeaders = {
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Date, X-Api-Version'
};

const REC_WEIGHTS = {
  CONTENT_SIMILARITY: 0.40,
  COLLABORATIVE_CF: 0.30,
  VELOCITY_FRESHNESS: 0.20,
  COLD_START_TAGS: 0.10
};

export async function onRequest(context) {
  const request = context.request;
  const env = context.env;

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const db = getDb(env);
    const url = new URL(request.url);

    if (request.method !== 'GET') {
      return Response.json({ success: false, error: "Method not allowed." }, { status: 405, headers: corsHeaders });
    }

    const uid = url.searchParams.get('uid');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '6', 10), 20);

    // 1. Fetch all public/restricted candidate communities
    const candidateRes = await db.execute({
      sql: `SELECT c.id, c.slug, c.name, c.description, c.type, c.category, c.icon_url, c.banner_url,
                   c.member_count, c.post_count, c.created_at
            FROM communities c
            WHERE c.type != 'private'
            ORDER BY c.member_count DESC LIMIT 100`,
      args: []
    });

    const candidates = candidateRes.rows || [];
    if (candidates.length === 0) {
      return Response.json({ success: true, recommendations: [] }, { status: 200, headers: corsHeaders });
    }

    // 2. Determine communities user already joined (to exclude)
    const joinedSet = new Set();
    const userJoinedCommIds = [];
    let userTasteTags = new Set();

    if (uid) {
      try {
        const [memRes, tasteRes] = await Promise.all([
          db.execute({
            sql: "SELECT community_id FROM community_members WHERE uid = ? AND status = 'active'",
            args: [uid]
          }),
          db.execute({
            sql: "SELECT category, count FROM user_taste WHERE uid = ? ORDER BY count DESC LIMIT 15",
            args: [uid]
          })
        ]);

        (memRes.rows || []).forEach(m => {
          joinedSet.add(m.community_id);
          userJoinedCommIds.push(m.community_id);
        });

        (tasteRes.rows || []).forEach(t => {
          if (t.category) userTasteTags.add(t.category.toLowerCase());
        });
      } catch (err) {
        console.warn("[Recommended] Error loading user profile signals:", err.message);
      }
    }

    // 3. Collaborative Filtering Co-Membership Signal
    // "Users who joined communities in userJoinedCommIds also joined candidate communities"
    const coMembershipScores = new Map();
    if (userJoinedCommIds.length > 0) {
      try {
        const placeholders = userJoinedCommIds.map(() => '?').join(',');
        const cfRes = await db.execute({
          sql: `SELECT cm2.community_id, COUNT(DISTINCT cm2.uid) as overlapCount
                FROM community_members cm1
                JOIN community_members cm2 ON cm1.uid = cm2.uid AND cm1.community_id != cm2.community_id
                WHERE cm1.community_id IN (${placeholders}) AND cm2.status = 'active'
                GROUP BY cm2.community_id
                ORDER BY overlapCount DESC LIMIT 50`,
          args: userJoinedCommIds
        });

        (cfRes.rows || []).forEach(row => {
          coMembershipScores.set(row.community_id, row.overlapCount);
        });
      } catch (cfErr) {
        console.warn("[Recommended] CF overlap error:", cfErr.message);
      }
    }

    // 4. Calculate Scores for eligible candidates
    const scoredCandidates = [];
    const maxMembers = Math.max(...candidates.map(c => c.member_count || 1), 1);
    const maxCF = Math.max(...Array.from(coMembershipScores.values()), 1);

    for (const c of candidates) {
      if (joinedSet.has(c.id)) continue;

      // S_content / S_taste: does community category match user taste?
      let sContent = 0.2;
      const commCat = (c.category || '').toLowerCase();
      if (userTasteTags.has(commCat)) {
        sContent = 1.0;
      }

      // S_collaborative: overlap with user co-members
      const cfOverlap = coMembershipScores.get(c.id) || 0;
      const sCollaborative = cfOverlap / maxCF;

      // S_velocity / freshness: recency and normalized engagement
      const daysOld = Math.max((Date.now() - new Date(c.created_at).getTime()) / (1000 * 60 * 60 * 24), 1);
      const postVelocity = (c.post_count || 0) / daysOld;
      const sVelocity = Math.min((c.member_count / maxMembers) * 0.5 + Math.min(postVelocity / 5, 0.5), 1.0);

      // S_cold_start: baseline popularity & featured
      const sColdStart = Math.min((c.member_count || 1) / maxMembers, 1.0);

      const finalScore =
        REC_WEIGHTS.CONTENT_SIMILARITY * sContent +
        REC_WEIGHTS.COLLABORATIVE_CF * sCollaborative +
        REC_WEIGHTS.VELOCITY_FRESHNESS * sVelocity +
        REC_WEIGHTS.COLD_START_TAGS * sColdStart;

      scoredCandidates.push({
        ...c,
        score: finalScore
      });
    }

    // Sort by descending score
    scoredCandidates.sort((a, b) => b.score - a.score);

    // 5. Category Diversity Filter (Maximum 2 recommendations per category)
    const categoryCount = new Map();
    const diverseRecommendations = [];

    for (const item of scoredCandidates) {
      const cat = item.category || 'General';
      const count = categoryCount.get(cat) || 0;
      if (count < 2) {
        categoryCount.set(cat, count + 1);
        diverseRecommendations.push({
          id: item.id,
          slug: item.slug,
          name: item.name,
          description: item.description || '',
          type: item.type,
          category: item.category || 'General',
          icon_url: item.icon_url || '',
          banner_url: item.banner_url || '',
          member_count: item.member_count,
          post_count: item.post_count,
          score: Math.round(item.score * 100) / 100
        });
      }
      if (diverseRecommendations.length >= limit) break;
    }

    // 6. Log impression events asynchronously
    if (uid && diverseRecommendations.length > 0) {
      try {
        const eventInserts = diverseRecommendations.map(r => ({
          sql: "INSERT INTO community_events (id, uid, community_id, event, created_at) VALUES (?, ?, ?, 'rec_impression', ?)",
          args: ['ev_' + Math.random().toString(36).substring(2, 10), uid, r.id, new Date().toISOString()]
        }));
        await Promise.all(eventInserts.map(stmt => db.execute(stmt)));
      } catch (eventErr) {
        // Non-blocking telemetry
      }
    }

    return Response.json({
      success: true,
      recommendations: diverseRecommendations
    }, { status: 200, headers: corsHeaders });
  } catch (err) {
    console.error("[Recommended Communities Error]:", err);
    return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
  }
}

