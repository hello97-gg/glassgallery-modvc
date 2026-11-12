import { getDb } from "../lib/turso.js";
import {
  ModPermissions,
  hasPermission,
  checkUserPlatformAdmin
} from "../lib/communityPermissions.js";

const corsHeaders = {
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Date, X-Api-Version'
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

    const communityId = url.searchParams.get('communityId') || url.searchParams.get('community_id');
    const uid = url.searchParams.get('uid');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '40', 10), 100);

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

      if (role !== 'owner' && !hasPermission(perms, ModPermissions.VIEW_MOD_LOG)) {
        return Response.json({ success: false, error: "Insufficient permissions to inspect moderation log." }, { status: 403, headers: corsHeaders });
      }
    }

    const logRes = await db.execute({
      sql: `SELECT ml.*, u.uploaderName as actorName, u.uploaderPhotoURL as actorPhoto
            FROM mod_log ml
            LEFT JOIN users u ON ml.actor_uid = u.uploaderUid
            WHERE ml.community_id = ?
            ORDER BY ml.created_at DESC LIMIT ?`,
      args: [communityId, limit]
    });

    return Response.json({
      success: true,
      logs: logRes.rows || []
    }, { status: 200, headers: corsHeaders });
  } catch (err) {
    console.error("[ModLog Error]:", err);
    return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
  }
}

