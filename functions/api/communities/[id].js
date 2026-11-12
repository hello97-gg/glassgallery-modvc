import { getDb } from "../lib/turso.js";
import {
  CommunityRoles,
  ModPermissions,
  hasPermission,
  checkUserPlatformAdmin,
  logModAction,
  canViewCommunity
} from "../lib/communityPermissions.js";

const corsHeaders = {
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,PATCH,DELETE,OPTIONS',
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
  const params = context.params;

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const db = getDb(env);
    const identifier = params.id; // Can be community ID ('comm_...') or slug ('astrophotography')
    const url = new URL(request.url);
    const callerUid = url.searchParams.get('uid') || extractUid(request);

    if (!identifier) {
      return Response.json({ success: false, error: "Missing community identifier." }, { status: 400, headers: corsHeaders });
    }

    // 1. Fetch community record (support lookup by ID or slug)
    const commRes = await db.execute({
      sql: `SELECT c.*, u.uploaderName as owner_name, u.uploaderPhotoURL as owner_photo_url
            FROM communities c
            LEFT JOIN users u ON c.owner_uid = u.uploaderUid
            WHERE c.id = ? OR c.slug = ?
            LIMIT 1`,
      args: [identifier, identifier.toLowerCase()]
    });

    if (!commRes.rows || commRes.rows.length === 0) {
      return Response.json({ success: false, error: "Community not found." }, { status: 404, headers: corsHeaders });
    }

    const comm = commRes.rows[0];
    const communityId = comm.id;
    const isPlatformSuperAdmin = callerUid ? await checkUserPlatformAdmin(db, callerUid) : false;

    // 2. Fetch caller's membership status and ban state
    let callerRole = CommunityRoles.NONE;
    let callerPermissions = 0;
    let isCallerBanned = false;
    let hasPendingJoinRequest = false;

    if (callerUid) {
      // Check ban
      const banRes = await db.execute({
        sql: "SELECT id, expires_at FROM community_bans WHERE community_id = ? AND uid = ? LIMIT 1",
        args: [communityId, callerUid]
      });
      if (banRes.rows && banRes.rows.length > 0) {
        const ban = banRes.rows[0];
        // Check if ban is expired
        if (!ban.expires_at || new Date(ban.expires_at).getTime() > Date.now()) {
          isCallerBanned = true;
          callerRole = CommunityRoles.BANNED;
        }
      }

      // Check membership if not banned
      if (!isCallerBanned) {
        const memRes = await db.execute({
          sql: "SELECT role, permissions, status FROM community_members WHERE community_id = ? AND uid = ? LIMIT 1",
          args: [communityId, callerUid]
        });
        if (memRes.rows && memRes.rows.length > 0) {
          const m = memRes.rows[0];
          callerRole = m.role || CommunityRoles.MEMBER;
          callerPermissions = parseInt(m.permissions || 0, 10);
        } else if (comm.type === 'private') {
          // Check if pending join request exists
          const reqRes = await db.execute({
            sql: "SELECT id FROM join_requests WHERE community_id = ? AND uid = ? AND status = 'pending' LIMIT 1",
            args: [communityId, callerUid]
          });
          hasPendingJoinRequest = (reqRes.rows && reqRes.rows.length > 0);
        }
      }
    }

    // --- GET /api/communities/:id ---
    if (request.method === 'GET') {
      // Visibility check for private communities
      const canView = canViewCommunity(comm.type, callerRole, isCallerBanned, callerUid);
      if (!canView && !isPlatformSuperAdmin) {
        return Response.json({
          success: true,
          isPrivateRestricted: true,
          community: {
            id: comm.id,
            slug: comm.slug,
            name: comm.name,
            description: comm.description || '',
            type: 'private',
            icon_url: comm.icon_url || '',
            banner_url: comm.banner_url || '',
            category: comm.category || 'General',
            member_count: parseInt(comm.member_count || 1, 10),
            post_count: parseInt(comm.post_count || 0, 10),
            created_at: comm.created_at,
            is_nsfw: parseInt(comm.is_nsfw || 0, 10) === 1,
            userRole: CommunityRoles.NONE,
            isJoined: false,
            hasPendingJoinRequest
          }
        }, { status: 200, headers: corsHeaders });
      }

      // Fetch rules and top moderators in parallel
      const [rulesRes, modsRes] = await Promise.all([
        db.execute({
          sql: "SELECT id, title, body, position FROM community_rules WHERE community_id = ? ORDER BY position ASC, created_at ASC",
          args: [communityId]
        }),
        db.execute({
          sql: `SELECT cm.uid, cm.role, cm.permissions, u.uploaderName as name, u.uploaderPhotoURL as photo_url
                FROM community_members cm
                LEFT JOIN users u ON cm.uid = u.uploaderUid
                WHERE cm.community_id = ? AND cm.role IN ('owner', 'moderator') AND cm.status = 'active'
                ORDER BY CASE cm.role WHEN 'owner' THEN 1 ELSE 2 END, cm.joined_at ASC`,
          args: [communityId]
        })
      ]);

      const settings = typeof comm.settings_json === 'string'
        ? JSON.parse(comm.settings_json || '{}')
        : (comm.settings_json || {});

      return Response.json({
        success: true,
        community: {
          id: comm.id,
          slug: comm.slug,
          name: comm.name,
          description: comm.description || '',
          type: comm.type,
          icon_url: comm.icon_url || '',
          banner_url: comm.banner_url || '',
          category: comm.category || 'General',
          owner_uid: comm.owner_uid,
          owner_name: comm.owner_name || '',
          owner_photo_url: comm.owner_photo_url || '',
          member_count: parseInt(comm.member_count || 1, 10),
          post_count: parseInt(comm.post_count || 0, 10),
          created_at: comm.created_at,
          is_nsfw: parseInt(comm.is_nsfw || 0, 10) === 1,
          settings,
          userRole: callerRole,
          userPermissions: callerPermissions,
          isJoined: [CommunityRoles.OWNER, CommunityRoles.MODERATOR, CommunityRoles.APPROVED, CommunityRoles.MEMBER].includes(callerRole),
          isBanned: isCallerBanned,
          hasPendingJoinRequest
        },
        rules: rulesRes.rows || [],
        moderators: modsRes.rows || []
      }, { status: 200, headers: corsHeaders });
    }

    // --- PATCH /api/communities/:id ---
    // Update community details, settings, banner, icon
    if (request.method === 'PATCH') {
      let body;
      try {
        body = await request.json();
      } catch {
        return Response.json({ success: false, error: "Invalid JSON request body." }, { status: 400, headers: corsHeaders });
      }

      const uid = extractUid(request, body);
      if (!uid) {
        return Response.json({ success: false, error: "Authentication required." }, { status: 401, headers: corsHeaders });
      }

      // Authorize: Must have MANAGE_RULES_SETTINGS or be Owner or Platform Admin
      const isAllowed = isPlatformSuperAdmin || hasPermission(callerRole, callerPermissions, ModPermissions.MANAGE_RULES_SETTINGS, uid);
      if (!isAllowed) {
        return Response.json({ success: false, error: "You do not have permission to edit community settings." }, { status: 403, headers: corsHeaders });
      }

      const allowedFields = ['name', 'description', 'icon_url', 'banner_url', 'category', 'is_nsfw', 'type'];
      const updates = [];
      const updateArgs = [];

      allowedFields.forEach(f => {
        if (body[f] !== undefined) {
          if (f === 'is_nsfw') {
            updates.push("is_nsfw = ?");
            updateArgs.push(body[f] ? 1 : 0);
          } else if (f === 'name') {
            const trimmed = String(body[f]).trim();
            if (trimmed.length >= 2 && trimmed.length <= 60) {
              updates.push("name = ?");
              updateArgs.push(trimmed);
            }
          } else {
            updates.push(`${f} = ?`);
            updateArgs.push(body[f]);
          }
        }
      });

      if (body.settings && typeof body.settings === 'object') {
        const currentSettings = typeof comm.settings_json === 'string'
          ? JSON.parse(comm.settings_json || '{}')
          : (comm.settings_json || {});
        const mergedSettings = { ...currentSettings, ...body.settings };
        updates.push("settings_json = ?");
        updateArgs.push(JSON.stringify(mergedSettings));
      }

      if (updates.length === 0) {
        return Response.json({ success: true, message: "No updates provided." }, { status: 200, headers: corsHeaders });
      }

      updateArgs.push(communityId);
      await db.execute({
        sql: `UPDATE communities SET ${updates.join(', ')} WHERE id = ?`,
        args: updateArgs
      });

      // Audit log
      await logModAction(db, {
        community_id: communityId,
        actor_uid: uid,
        action: 'edit_community_settings',
        target_type: 'community',
        target_id: communityId,
        reason: 'Community settings updated',
        metadata: { updated_fields: updates },
        is_platform_override: isPlatformSuperAdmin && callerRole !== CommunityRoles.OWNER
      });

      return Response.json({ success: true, message: "Community updated successfully." }, { status: 200, headers: corsHeaders });
    }

    // --- DELETE /api/communities/:id ---
    // Remove or archive community (Owner or Platform Admin only)
    if (request.method === 'DELETE') {
      let body = {};
      try { body = await request.json(); } catch {}
      const authUid = callerUid || body.uid;

      if (!authUid) {
        return Response.json({ success: false, error: "Authentication required." }, { status: 401, headers: corsHeaders });
      }

      const isOwner = callerRole === CommunityRoles.OWNER;
      if (!isOwner && !isPlatformSuperAdmin) {
        return Response.json({ success: false, error: "Only the community owner or a platform admin can delete a community." }, { status: 403, headers: corsHeaders });
      }

      // Remove community and clean up associations
      await db.batch([
        { sql: "DELETE FROM communities WHERE id = ?", args: [communityId] },
        { sql: "DELETE FROM community_members WHERE community_id = ?", args: [communityId] },
        { sql: "DELETE FROM community_rules WHERE community_id = ?", args: [communityId] },
        { sql: "DELETE FROM community_bans WHERE community_id = ?", args: [communityId] },
        { sql: "DELETE FROM join_requests WHERE community_id = ?", args: [communityId] },
        // Detach community from image posts without deleting the actual user images
        { sql: "UPDATE images SET community_id = NULL WHERE community_id = ?", args: [communityId] }
      ]);

      // Audit log
      await logModAction(db, {
        community_id: communityId,
        actor_uid: authUid,
        action: 'delete_community',
        target_type: 'community',
        target_id: communityId,
        reason: body.reason || 'Community deleted by owner/admin',
        is_platform_override: isPlatformSuperAdmin && !isOwner
      });

      return Response.json({ success: true, message: "Community deleted successfully." }, { status: 200, headers: corsHeaders });
    }

    return Response.json({ success: false, error: `Method ${request.method} not allowed.` }, { status: 405, headers: corsHeaders });
  } catch (error) {
    console.error("[API /communities/:id Error]:", error);
    return Response.json({ success: false, error: error.message }, { status: 500, headers: corsHeaders });
  }
}

