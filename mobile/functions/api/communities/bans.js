import { getDb } from "../lib/turso.js";
import {
  CommunityRoles,
  ModPermissions,
  hasPermission,
  canActOnUser,
  checkUserPlatformAdmin,
  logModAction
} from "../lib/communityPermissions.js";

const corsHeaders = {
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
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

    // --- GET /api/communities/bans?communityId=XYZ ---
    if (request.method === 'GET') {
      const communityId = url.searchParams.get('communityId') || url.searchParams.get('community_id');
      const uid = url.searchParams.get('uid');

      if (!communityId) {
        return Response.json({ success: false, error: "Missing communityId parameter." }, { status: 400, headers: corsHeaders });
      }

      if (!uid) {
        return Response.json({ success: false, error: "Authentication required." }, { status: 401, headers: corsHeaders });
      }

      const isPlatformSuperAdmin = await checkUserPlatformAdmin(db, uid);

      if (!isPlatformSuperAdmin) {
        const memRes = await db.execute({
          sql: "SELECT role, permissions FROM community_members WHERE community_id = ? AND uid = ? LIMIT 1",
          args: [communityId, uid]
        });

        if (!memRes.rows || memRes.rows.length === 0) {
          return Response.json({ success: false, error: "Access denied." }, { status: 403, headers: corsHeaders });
        }

        const role = memRes.rows[0].role;
        const perms = memRes.rows[0].permissions || 0;

        if (role !== 'owner' && !hasPermission(perms, ModPermissions.BAN_USERS)) {
          return Response.json({ success: false, error: "Insufficient permissions to view bans." }, { status: 403, headers: corsHeaders });
        }
      }

      const bansRes = await db.execute({
        sql: `SELECT b.*, u.uploaderName as userName, u.uploaderPhotoURL as userPhoto,
                     m.uploaderName as bannerName
              FROM community_bans b
              LEFT JOIN users u ON b.uid = u.uploaderUid
              LEFT JOIN users m ON b.banned_by = m.uploaderUid
              WHERE b.community_id = ?
              ORDER BY b.created_at DESC`,
        args: [communityId]
      });

      return Response.json({
        success: true,
        bans: bansRes.rows || []
      }, { status: 200, headers: corsHeaders });
    }

    // --- POST /api/communities/bans ---
    // Issue a temporary or permanent ban
    if (request.method === 'POST') {
      let body;
      try {
        body = await request.json();
      } catch {
        return Response.json({ success: false, error: "Invalid JSON body." }, { status: 400, headers: corsHeaders });
      }

      const actorUid = extractUid(request, body);
      const { communityId, community_id, targetUid, target_uid, reason = '', durationDays } = body;
      const finalCommId = communityId || community_id;
      const finalTargetUid = targetUid || target_uid;

      if (!actorUid) {
        return Response.json({ success: false, error: "Authentication required." }, { status: 401, headers: corsHeaders });
      }

      if (!finalCommId || !finalTargetUid) {
        return Response.json({ success: false, error: "Missing communityId or targetUid." }, { status: 400, headers: corsHeaders });
      }

      if (actorUid === finalTargetUid) {
        return Response.json({ success: false, error: "You cannot ban yourself." }, { status: 400, headers: corsHeaders });
      }

      const isPlatformSuperAdmin = await checkUserPlatformAdmin(db, actorUid);

      if (!isPlatformSuperAdmin) {
        const [actorRes, targetRes] = await Promise.all([
          db.execute({
            sql: "SELECT role, permissions FROM community_members WHERE community_id = ? AND uid = ? LIMIT 1",
            args: [finalCommId, actorUid]
          }),
          db.execute({
            sql: "SELECT role FROM community_members WHERE community_id = ? AND uid = ? LIMIT 1",
            args: [finalCommId, finalTargetUid]
          })
        ]);

        const actorRole = actorRes.rows?.[0]?.role || CommunityRoles.NONE;
        const actorPerms = actorRes.rows?.[0]?.permissions || 0;
        const targetRole = targetRes.rows?.[0]?.role || CommunityRoles.NONE;

        if (actorRole !== 'owner' && !hasPermission(actorPerms, ModPermissions.BAN_USERS)) {
          return Response.json({ success: false, error: "Insufficient permissions to ban users." }, { status: 403, headers: corsHeaders });
        }

        if (!canActOnUser(actorRole, targetRole)) {
          return Response.json({ success: false, error: "You cannot ban a user with equal or higher rank." }, { status: 403, headers: corsHeaders });
        }
      }

      let expiresAt = null;
      if (durationDays && typeof durationDays === 'number' && durationDays > 0) {
        expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString();
      }

      const banId = 'ban_' + Math.random().toString(36).substring(2, 11);
      const now = new Date().toISOString();

      // Upsert into community_bans
      await db.execute({
        sql: `INSERT INTO community_bans (id, community_id, uid, reason, banned_by, expires_at, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(community_id, uid) DO UPDATE SET
                reason = excluded.reason,
                banned_by = excluded.banned_by,
                expires_at = excluded.expires_at,
                created_at = excluded.created_at`,
        args: [banId, finalCommId, finalTargetUid, reason.slice(0, 300), actorUid, expiresAt, now]
      });

      // Update membership status if member exists
      await db.execute({
        sql: "UPDATE community_members SET status = 'banned' WHERE community_id = ? AND uid = ?",
        args: [finalCommId, finalTargetUid]
      });

      // Send ban notification to the user
      try {
        const commRes = await db.execute({
          sql: "SELECT slug, name, icon_url FROM communities WHERE id = ? LIMIT 1",
          args: [finalCommId]
        });
        if (commRes.rows?.length > 0) {
          const commRow = commRes.rows[0];
          const notifId = 'notif_' + Math.random().toString(36).substring(2, 15);
          await db.execute({
            sql: `INSERT INTO notifications (id, recipientUid, actorUid, actorName, actorPhotoURL, type, imageId, imageUrl, createdAt, read)
                  VALUES (?, ?, ?, ?, ?, 'community_ban', '', '', ?, 0)`,
            args: [
              notifId,
              finalTargetUid,
              'c/' + commRow.slug,
              commRow.name || ('c/' + commRow.slug),
              commRow.icon_url || '',
              now
            ]
          });
        }
      } catch (e) {
        console.warn("[Ban Notif Error]:", e.message);
      }

      await logModAction(
        db,
        finalCommId,
        actorUid,
        'ban_user',
        'user',
        finalTargetUid,
        reason || 'Banned from community'
      );

      return Response.json({
        success: true,
        message: `User banned successfully ${expiresAt ? `until ${new Date(expiresAt).toLocaleDateString()}` : 'permanently'}.`
      }, { status: 200, headers: corsHeaders });
    }

    // --- DELETE /api/communities/bans ---
    // Lift a ban
    if (request.method === 'DELETE') {
      let body;
      try {
        body = await request.json();
      } catch {
        return Response.json({ success: false, error: "Invalid JSON body." }, { status: 400, headers: corsHeaders });
      }

      const actorUid = extractUid(request, body);
      const { communityId, community_id, targetUid, target_uid } = body;
      const finalCommId = communityId || community_id;
      const finalTargetUid = targetUid || target_uid;

      if (!actorUid || !finalCommId || !finalTargetUid) {
        return Response.json({ success: false, error: "Missing required parameters." }, { status: 400, headers: corsHeaders });
      }

      const isPlatformSuperAdmin = await checkUserPlatformAdmin(db, actorUid);

      if (!isPlatformSuperAdmin) {
        const actorRes = await db.execute({
          sql: "SELECT role, permissions FROM community_members WHERE community_id = ? AND uid = ? LIMIT 1",
          args: [finalCommId, actorUid]
        });

        const actorRole = actorRes.rows?.[0]?.role || CommunityRoles.NONE;
        const actorPerms = actorRes.rows?.[0]?.permissions || 0;

        if (actorRole !== 'owner' && !hasPermission(actorPerms, ModPermissions.BAN_USERS)) {
          return Response.json({ success: false, error: "Insufficient permissions to unban users." }, { status: 403, headers: corsHeaders });
        }
      }

      await db.execute({
        sql: "DELETE FROM community_bans WHERE community_id = ? AND uid = ?",
        args: [finalCommId, finalTargetUid]
      });

      await db.execute({
        sql: "UPDATE community_members SET status = 'active' WHERE community_id = ? AND uid = ?",
        args: [finalCommId, finalTargetUid]
      });

      await logModAction(
        db,
        finalCommId,
        actorUid,
        'unban_user',
        'user',
        finalTargetUid,
        'Ban revoked'
      );

      return Response.json({
        success: true,
        message: "Ban lifted successfully."
      }, { status: 200, headers: corsHeaders });
    }

    return Response.json({ success: false, error: "Method not allowed." }, { status: 405, headers: corsHeaders });
  } catch (err) {
    console.error("[Community Bans Error]:", err);
    return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
  }
}

