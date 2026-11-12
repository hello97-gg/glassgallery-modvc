import { getDb } from "../lib/turso.js";
import { submitToIndexNow } from "../lib/indexnow.js";
import {
  CommunityRoles,
  ModPermissions,
  validateSlug,
  checkUserPlatformAdmin,
  logModAction
} from "../lib/communityPermissions.js";

const corsHeaders = {
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Date, X-Api-Version'
};

function extractUid(request, body) {
  if (body?.uid) return body.uid;
  const authHeader = request.headers.get('Authorization') || request.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const parts = token.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
        return payload.user_id || payload.sub || payload.uid || null;
      }
    } catch {}
  }
  return null;
}

export async function onRequest(context) {
  const request = context.request;
  const env = context.env;

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const db = getDb(env);
    const url = new URL(request.url);

    // --- GET /api/communities ---
    // List, discover, or search communities
    if (request.method === 'GET') {
      const checkSlug = url.searchParams.get('check_slug');
      if (checkSlug) {
        const cleanSlug = checkSlug.trim().toLowerCase();
        const existing = await db.execute({
          sql: "SELECT id FROM communities WHERE slug = ? LIMIT 1",
          args: [cleanSlug]
        });
        const isTaken = existing.rows && existing.rows.length > 0;
        return Response.json({ success: true, available: !isTaken, slug: cleanSlug }, { headers: corsHeaders });
      }

      const q = (url.searchParams.get('q') || '').trim().toLowerCase();
      const category = (url.searchParams.get('category') || '').trim();
      const sort = url.searchParams.get('sort') || 'popular'; // 'popular', 'new', 'active'
      const uid = url.searchParams.get('uid'); // Calling user UID
      const myOnly = url.searchParams.get('my') === 'true'; // Only communities user has joined
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10), 50);
      const cursor = url.searchParams.get('cursor');

      let sql = "";
      const args = [];

      if (myOnly && uid) {
        // Return communities joined by this user
        sql = `
          SELECT c.*, cm.role as userRole, cm.permissions as userPermissions, 1 as isJoined
          FROM communities c
          JOIN community_members cm ON c.id = cm.community_id
          WHERE cm.uid = ? AND cm.status = 'active'
          ORDER BY cm.joined_at DESC
          LIMIT ?
        `;
        args.push(uid, limit);
      } else {
        // Standard public discover/search query
        const conditions = ["c.type != 'private'"];

        if (q) {
          conditions.push("(LOWER(c.name) LIKE ? OR LOWER(c.slug) LIKE ? OR LOWER(c.description) LIKE ?)");
          const term = `%${q}%`;
          args.push(term, term, term);
        }

        if (category) {
          conditions.push("c.category = ?");
          args.push(category);
        }

        if (cursor) {
          if (sort === 'new') {
            conditions.push("c.created_at < ?");
            args.push(cursor);
          } else {
            conditions.push("c.member_count <= ?");
            args.push(parseInt(cursor, 10));
          }
        }

        let orderBy = "c.member_count DESC, c.created_at DESC";
        if (sort === 'new') {
          orderBy = "c.created_at DESC";
        } else if (sort === 'active') {
          orderBy = "c.post_count DESC, c.member_count DESC";
        }

        sql = `
          SELECT c.*, u.uploaderName as owner_name, u.uploaderPhotoURL as owner_photo_url
          FROM communities c
          LEFT JOIN users u ON c.owner_uid = u.uploaderUid
          WHERE ${conditions.join(" AND ")}
          ORDER BY ${orderBy}
          LIMIT ?
        `;
        args.push(limit);
      }

      const res = await db.execute({ sql, args });
      const rawRows = res.rows || [];

      // If user is authenticated, query memberships to inject userRole & isJoined
      let userMemberships = new Map();
      if (uid && !myOnly && rawRows.length > 0) {
        const commIds = rawRows.map(r => r.id);
        const placeholders = commIds.map(() => '?').join(',');
        try {
          const memRes = await db.execute({
            sql: `SELECT community_id, role, permissions FROM community_members WHERE uid = ? AND community_id IN (${placeholders}) AND status = 'active'`,
            args: [uid, ...commIds]
          });
          (memRes.rows || []).forEach(m => userMemberships.set(m.community_id, m));
        } catch (e) {
          console.warn("[Communities] Error fetching membership map:", e.message);
        }
      }

      const communities = rawRows.map(row => {
        const mem = userMemberships.get(row.id);
        return {
          id: row.id,
          slug: row.slug,
          name: row.name,
          description: row.description || '',
          type: row.type || 'public',
          icon_url: row.icon_url || '',
          banner_url: row.banner_url || '',
          category: row.category || 'General',
          owner_uid: row.owner_uid,
          owner_name: row.owner_name || '',
          owner_photo_url: row.owner_photo_url || '',
          member_count: parseInt(row.member_count || 1, 10),
          post_count: parseInt(row.post_count || 0, 10),
          created_at: row.created_at,
          is_nsfw: parseInt(row.is_nsfw || 0, 10) === 1,
          settings: typeof row.settings_json === 'string' ? JSON.parse(row.settings_json || '{}') : (row.settings_json || {}),
          userRole: row.userRole || (mem ? mem.role : (uid && row.owner_uid === uid ? CommunityRoles.OWNER : CommunityRoles.NONE)),
          userPermissions: row.userPermissions !== undefined ? row.userPermissions : (mem ? mem.permissions : (uid && row.owner_uid === uid ? ModPermissions.ALL : 0)),
          isJoined: row.isJoined === 1 || !!mem || Boolean(uid && row.owner_uid === uid)
        };
      });

      const nextCursor = communities.length === limit ? (
        sort === 'new' ? communities[communities.length - 1].created_at : communities[communities.length - 1].member_count
      ) : null;

      return Response.json({
        success: true,
        communities,
        nextCursor
      }, { status: 200, headers: corsHeaders });
    }

    // --- POST /api/communities ---
    // Create a new community
    if (request.method === 'POST') {
      let body;
      try {
        body = await request.json();
      } catch {
        return Response.json({ success: false, error: "Invalid JSON request body." }, { status: 400, headers: corsHeaders });
      }

      const {
        name,
        slug: rawSlug,
        description = '',
        type = 'public',
        icon_url = '',
        banner_url = '',
        category = 'General',
        is_nsfw = false,
        settings = {}
      } = body;

      const uid = extractUid(request, body);

      if (!uid) {
        return Response.json({ success: false, error: "Authentication required to create a community." }, { status: 401, headers: corsHeaders });
      }

      if (!name || typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 60) {
        return Response.json({ success: false, error: "Community name must be between 2 and 60 characters." }, { status: 400, headers: corsHeaders });
      }

      // Validate slug
      const slugValidation = validateSlug(rawSlug);
      if (!slugValidation.valid) {
        return Response.json({ success: false, error: slugValidation.error }, { status: 400, headers: corsHeaders });
      }
      const slug = slugValidation.slug;

      const validTypes = ['public', 'restricted', 'private'];
      const communityType = validTypes.includes(type) ? type : 'public';

      // Check slug uniqueness
      const existing = await db.execute({
        sql: "SELECT id FROM communities WHERE slug = ? LIMIT 1",
        args: [slug]
      });

      if (existing.rows && existing.rows.length > 0) {
        return Response.json({ success: false, error: `The community slug 'c/${slug}' is already taken.` }, { status: 409, headers: corsHeaders });
      }

      const communityId = 'comm_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
      const createdAt = new Date().toISOString();

      const defaultSettings = {
        allow_video_posts: true,
        allow_text_posts: true,
        require_post_approval: communityType === 'restricted',
        banned_words: [],
        primary_color: '#f5c3b8',
        accent_color: '#383838',
        ...settings
      };

      // 1. Insert community record
      await db.execute({
        sql: `INSERT INTO communities (
          id, slug, name, description, type, icon_url, banner_url,
          category, owner_uid, member_count, post_count, created_at,
          is_nsfw, settings_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?, ?)`,
        args: [
          communityId,
          slug,
          name.trim(),
          description.trim(),
          communityType,
          icon_url,
          banner_url,
          category.trim() || 'General',
          uid,
          createdAt,
          is_nsfw ? 1 : 0,
          JSON.stringify(defaultSettings)
        ]
      });

      // 2. Automatically register creator as Owner with full permissions
      await db.execute({
        sql: `INSERT INTO community_members (
          community_id, uid, role, permissions, joined_at, status
        ) VALUES (?, ?, ?, ?, ?, 'active')`,
        args: [
          communityId,
          uid,
          CommunityRoles.OWNER,
          ModPermissions.ALL,
          createdAt
        ]
      });

      // 3. Log creation to mod_log
      await logModAction(db, {
        community_id: communityId,
        actor_uid: uid,
        action: 'create_community',
        target_type: 'community',
        target_id: communityId,
        reason: 'Community created by owner',
        metadata: { slug, name, type: communityType }
      });

      // 4. Record community event
      try {
        await db.execute({
          sql: "INSERT INTO community_events (id, uid, community_id, event, created_at) VALUES (?, ?, ?, 'create', ?)",
          args: ['ev_' + Math.random().toString(36).substring(2, 11), uid, communityId, createdAt]
        });
      } catch {}

      // 5. Submit new public community to IndexNow
      if (communityType === 'public') {
        const commUrl = `https://gg.modvc.org/c/${slug}`;
        if (context.waitUntil) {
          context.waitUntil(submitToIndexNow([commUrl]).catch(err => console.warn("[IndexNow Community Error]:", err)));
        } else {
          submitToIndexNow([commUrl]).catch(err => console.warn("[IndexNow Community Error]:", err));
        }
      }

      return Response.json({
        success: true,
        community: {
          id: communityId,
          slug,
          name: name.trim(),
          description: description.trim(),
          type: communityType,
          icon_url,
          banner_url,
          category,
          owner_uid: uid,
          member_count: 1,
          post_count: 0,
          created_at: createdAt,
          is_nsfw,
          settings: defaultSettings,
          userRole: CommunityRoles.OWNER,
          userPermissions: ModPermissions.ALL,
          isJoined: true
        }
      }, { status: 201, headers: corsHeaders });
    }

    return Response.json({ success: false, error: `Method ${request.method} not allowed.` }, { status: 405, headers: corsHeaders });
  } catch (error) {
    console.error("[API /communities Error]:", error);
    return Response.json({ success: false, error: error.message }, { status: 500, headers: corsHeaders });
  }
}

