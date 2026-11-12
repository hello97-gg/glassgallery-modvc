import { getDb } from "../lib/turso.js";
import {
  CommunityRoles,
  canViewCommunity,
  checkUserPlatformAdmin
} from "../lib/communityPermissions.js";

const corsHeaders = {
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
};

const cacheHeaders = {
  ...corsHeaders,
  'Cache-Control': 'public, max-age=10, s-maxage=30'
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

    // --- GET /api/communities/posts ---
    // Community Feed or Combined Joined Communities Feed
    if (request.method === 'GET') {
      const communityIdOrSlug = url.searchParams.get('communityId') || url.searchParams.get('community_id') || url.searchParams.get('slug');
      const sort = url.searchParams.get('sort') || 'hot'; // 'hot', 'new', 'top', 'rising'
      const timeWindow = url.searchParams.get('time') || 'all'; // 'day', 'week', 'month', 'year', 'all'
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10), 50);
      const cursor = url.searchParams.get('cursor');
      const callerUid = url.searchParams.get('uid');
      const feedType = url.searchParams.get('feed'); // 'joined' for home feed of joined communities

      let targetCommunityId = null;
      let communityData = null;

      if (communityIdOrSlug) {
        const commRes = await db.execute({
          sql: "SELECT id, slug, name, type, icon_url, settings_json FROM communities WHERE id = ? OR slug = ? LIMIT 1",
          args: [communityIdOrSlug, communityIdOrSlug.toLowerCase()]
        });

        if (!commRes.rows || commRes.rows.length === 0) {
          return Response.json({ success: false, error: "Community not found." }, { status: 404, headers: corsHeaders });
        }

        communityData = commRes.rows[0];
        targetCommunityId = communityData.id;

        // Check private community access
        if (communityData.type === 'private') {
          const isPlatformSuperAdmin = callerUid ? await checkUserPlatformAdmin(db, callerUid) : false;
          if (!isPlatformSuperAdmin) {
            if (!callerUid) {
              return Response.json({ success: false, error: "Private community. Authentication required." }, { status: 401, headers: corsHeaders });
            }
            const memRes = await db.execute({
              sql: "SELECT role, status FROM community_members WHERE community_id = ? AND uid = ? LIMIT 1",
              args: [targetCommunityId, callerUid]
            });
            const role = memRes.rows?.[0]?.role || CommunityRoles.NONE;
            const isBanned = (memRes.rows?.[0]?.status === 'banned');
            if (!canViewCommunity('private', role, isBanned, callerUid)) {
              return Response.json({ success: false, error: "This is a private community. You must be an approved member to view posts." }, { status: 403, headers: corsHeaders });
            }
          }
        }
      }

      // Construct SQL query
      const statusParam = url.searchParams.get('mod_status');
      const conditions = [];
      const args = [];

      if (statusParam === 'pending_approval' && targetCommunityId && callerUid) {
        const isPlatformSuperAdmin = await checkUserPlatformAdmin(db, callerUid);
        let isCommMod = isPlatformSuperAdmin;
        if (!isCommMod) {
          const modCheck = await db.execute({
            sql: "SELECT role FROM community_members WHERE community_id = ? AND uid = ? LIMIT 1",
            args: [targetCommunityId, callerUid]
          });
          const role = modCheck.rows?.[0]?.role;
          isCommMod = (role === 'owner' || role === 'moderator' || (communityData && communityData.owner_uid === callerUid));
        }
        if (isCommMod) {
          conditions.push("i.mod_status = 'pending_approval'");
        } else {
          conditions.push("(i.mod_status = 'approved' OR i.mod_status IS NULL)");
        }
      } else if (targetCommunityId && callerUid) {
        // In community feed, display approved posts PLUS pending posts submitted by the viewer
        conditions.push("(i.mod_status = 'approved' OR i.mod_status IS NULL OR (i.uploaderUid = ? AND i.mod_status = 'pending_approval'))");
        args.push(callerUid);
      } else {
        conditions.push("(i.mod_status = 'approved' OR i.mod_status IS NULL)");
      }

      if (targetCommunityId) {
        conditions.push("i.community_id = ?");
        args.push(targetCommunityId);
      } else if (feedType === 'joined' && callerUid) {
        // Feed composed of all communities the user has joined
        conditions.push(`i.community_id IN (
          SELECT community_id FROM community_members WHERE uid = ? AND status = 'active'
        )`);
        args.push(callerUid);
      } else {
        // Global feed of public community posts
        conditions.push(`i.community_id IS NOT NULL AND i.community_id IN (
          SELECT id FROM communities WHERE type != 'private'
        )`);
      }

      // Time window filtering (especially useful for Top sort)
      if (timeWindow === 'day') {
        conditions.push("i.uploadedAt >= datetime('now', '-24 hours')");
      } else if (timeWindow === 'week') {
        conditions.push("i.uploadedAt >= datetime('now', '-7 days')");
      } else if (timeWindow === 'month') {
        conditions.push("i.uploadedAt >= datetime('now', '-30 days')");
      } else if (timeWindow === 'year') {
        conditions.push("i.uploadedAt >= datetime('now', '-365 days')");
      }

      // Cursor filtering for pagination
      if (cursor) {
        if (sort === 'new') {
          conditions.push("i.uploadedAt < ?");
          args.push(cursor);
        }
      }

      // Sorting algorithms
      let orderBy = "";
      if (sort === 'new') {
        orderBy = "COALESCE(i.is_pinned, 0) DESC, i.uploadedAt DESC";
      } else if (sort === 'top') {
        orderBy = "COALESCE(i.is_pinned, 0) DESC, (COALESCE(i.likeCount, 0) * 2 + COALESCE(i.downloadCount, 0) + COALESCE(i.commentCount, 0) * 3) DESC, i.uploadedAt DESC";
      } else if (sort === 'rising') {
        // High engagement in recent 48 hours relative to age
        conditions.push("i.uploadedAt >= datetime('now', '-48 hours')");
        orderBy = `COALESCE(i.is_pinned, 0) DESC, 
          ((COALESCE(i.likeCount, 0) * 3.0 + COALESCE(i.commentCount, 0) * 4.0 + 1.0) / 
          MAX(0.5, (strftime('%s', 'now') - strftime('%s', i.uploadedAt)) / 3600.0)) DESC`;
      } else {
        // Default: 'hot' - Time-decayed Wilson/log score
        // score = (engagement + 1) / (hours_old + 2)^1.5
        orderBy = `COALESCE(i.is_pinned, 0) DESC, 
          ((COALESCE(i.likeCount, 0) * 2.0 + COALESCE(i.commentCount, 0) * 3.0 + 1.0) / 
          MAX(0.2, ((strftime('%s', 'now') - strftime('%s', i.uploadedAt)) / 3600.0 + 2.0))) DESC, 
          i.uploadedAt DESC`;
      }

      const sql = `
        SELECT i.*, 
               c.slug as community_slug, 
               c.name as community_name, 
               c.icon_url as community_icon_url,
               c.type as community_type
        FROM images i
        LEFT JOIN communities c ON i.community_id = c.id
        WHERE ${conditions.join(" AND ")}
        ORDER BY ${orderBy}
        LIMIT ?
      `;
      args.push(limit);

      const res = await db.execute({ sql, args });
      const rawPosts = res.rows || [];

      // Query liked posts for caller if authenticated
      let likedSet = new Set();
      if (callerUid && rawPosts.length > 0) {
        const postIds = rawPosts.map(p => p.id);
        const placeholders = postIds.map(() => '?').join(',');
        try {
          const likesRes = await db.execute({
            sql: `SELECT imageId FROM likes WHERE userUid = ? AND imageId IN (${placeholders})`,
            args: [callerUid, ...postIds]
          });
          (likesRes.rows || []).forEach(l => likedSet.add(l.imageId));
        } catch {}
      }

      const posts = rawPosts.map(p => {
        let flagsArr = [];
        try { flagsArr = typeof p.flags === 'string' ? JSON.parse(p.flags) : (p.flags || []); } catch {}
        
        const isTextPost = (!p.imageUrl || p.imageUrl === 'text://post' || p.imageUrl.startsWith('text://'));

        return {
          id: p.id,
          imageUrl: p.imageUrl || '',
          thumbnailUrl: p.thumbnailUrl || p.imageUrl || '',
          uploaderUid: p.uploaderUid,
          uploaderName: p.uploaderName || 'Anonymous',
          uploaderPhotoURL: p.uploaderPhotoURL || '',
          title: p.title || '',
          description: p.description || '',
          license: p.license || 'CC0',
          licenseUrl: p.licenseUrl || '',
          flags: flagsArr,
          originalWorkUrl: p.originalWorkUrl || '',
          uploadedAt: p.uploadedAt,
          likeCount: parseInt(p.likeCount || 0, 10),
          downloadCount: parseInt(p.downloadCount || 0, 10),
          commentCount: parseInt(p.commentCount || 0, 10),
          viewCount: parseInt(p.viewCount || 0, 10),
          location: p.location || '',
          isLiked: likedSet.has(p.id),
          likedBy: likedSet.has(p.id) ? (callerUid ? [callerUid] : ['true']) : [],
          community_id: p.community_id,
          community_slug: p.community_slug,
          community_name: p.community_name,
          community_icon_url: p.community_icon_url,
          is_pinned: parseInt(p.is_pinned || 0, 10) === 1,
          is_locked: parseInt(p.is_locked || 0, 10) === 1,
          mod_status: p.mod_status || 'approved',
          isTextPost
        };
      });

      const nextCursor = (posts.length === limit && sort === 'new')
        ? posts[posts.length - 1].uploadedAt
        : null;

      return Response.json({
        success: true,
        posts,
        nextCursor,
        community: communityData ? {
          id: communityData.id,
          slug: communityData.slug,
          name: communityData.name,
          type: communityData.type,
          icon_url: communityData.icon_url
        } : null
      }, { status: 200, headers: cacheHeaders });
    }

    return Response.json({ success: false, error: `Method ${request.method} not allowed.` }, { status: 405, headers: corsHeaders });
  } catch (error) {
    console.error("[API /communities/posts Error]:", error);
    return Response.json({ success: false, error: error.message }, { status: 500, headers: corsHeaders });
  }
}

