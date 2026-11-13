import { getDb } from "../lib/turso.js";
import {
  ModPermissions,
  hasPermission,
  checkUserPlatformAdmin,
  logModAction
} from "../lib/communityPermissions.js";

const corsHeaders = {
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
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

    // --- GET /api/communities/reports?communityId=XYZ ---
    if (request.method === 'GET') {
      const communityId = url.searchParams.get('communityId') || url.searchParams.get('community_id');
      const uid = url.searchParams.get('uid');
      const statusFilter = url.searchParams.get('status') || 'pending';

      if (!communityId) {
        return Response.json({ success: false, error: "Missing communityId parameter." }, { status: 400, headers: corsHeaders });
      }

      if (!uid) {
        return Response.json({ success: false, error: "Authentication required." }, { status: 401, headers: corsHeaders });
      }

      const isPlatformSuperAdmin = await checkUserPlatformAdmin(db, uid);

      if (!isPlatformSuperAdmin) {
        const commCheck = await db.execute({
          sql: "SELECT owner_uid FROM communities WHERE id = ? LIMIT 1",
          args: [communityId]
        });
        const isOwner = commCheck.rows?.length > 0 && commCheck.rows[0].owner_uid === uid;

        if (!isOwner) {
          const memRes = await db.execute({
            sql: "SELECT role, permissions FROM community_members WHERE community_id = ? AND uid = ? LIMIT 1",
            args: [communityId, uid]
          });

          if (!memRes.rows || memRes.rows.length === 0) {
            return Response.json({ success: false, error: "Access denied." }, { status: 403, headers: corsHeaders });
          }

          const role = memRes.rows[0].role;
          const perms = memRes.rows[0].permissions || 0;

          if (role !== 'owner' && !hasPermission(perms, ModPermissions.MANAGE_POSTS | ModPermissions.MANAGE_COMMENTS)) {
            return Response.json({ success: false, error: "Insufficient permissions to review reports." }, { status: 403, headers: corsHeaders });
          }
        }
      }

      const reportsRes = await db.execute({
        sql: `SELECT r.*, u.uploaderName as reporterName 
              FROM reports r
              LEFT JOIN users u ON r.reporter_uid = u.uploaderUid
              WHERE r.community_id = ? AND r.status = ?
              ORDER BY r.created_at DESC LIMIT 50`,
        args: [communityId, statusFilter]
      });

      return Response.json({
        success: true,
        reports: reportsRes.rows || []
      }, { status: 200, headers: corsHeaders });
    }

    // --- POST /api/communities/reports ---
    // Submit a report
    if (request.method === 'POST') {
      let body;
      try {
        body = await request.json();
      } catch {
        return Response.json({ success: false, error: "Invalid JSON body." }, { status: 400, headers: corsHeaders });
      }

      const reporterUid = extractUid(request, body);
      const { communityId, community_id, target_type, target_id, reason, details = '' } = body;
      const finalCommId = communityId || community_id;

      if (!reporterUid) {
        return Response.json({ success: false, error: "You must be signed in to submit a report." }, { status: 401, headers: corsHeaders });
      }

      if (!target_type || !target_id || !reason) {
        return Response.json({ success: false, error: "Missing required report fields (target_type, target_id, reason)." }, { status: 400, headers: corsHeaders });
      }

      const reportId = 'rep_' + Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
      const now = new Date().toISOString();

      await db.execute({
        sql: `INSERT INTO reports (id, community_id, target_type, target_id, reporter_uid, reason, details, status, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
        args: [reportId, finalCommId || null, target_type, target_id, reporterUid, reason.slice(0, 200), details.slice(0, 500), now]
      });

      return Response.json({
        success: true,
        reportId,
        message: "Report submitted successfully."
      }, { status: 200, headers: corsHeaders });
    }

    // --- PATCH /api/communities/reports ---
    // Resolve or dismiss report
    if (request.method === 'PATCH') {
      let body;
      try {
        body = await request.json();
      } catch {
        return Response.json({ success: false, error: "Invalid JSON body." }, { status: 400, headers: corsHeaders });
      }

      const actorUid = extractUid(request, body);
      const { reportId, action, communityId, community_id } = body; // action: 'approve' (remove content) or 'dismiss'
      const finalCommId = communityId || community_id;

      if (!actorUid) {
        return Response.json({ success: false, error: "Authentication required." }, { status: 401, headers: corsHeaders });
      }

      if (!reportId || !action) {
        return Response.json({ success: false, error: "Missing reportId or action." }, { status: 400, headers: corsHeaders });
      }

      const isPlatformSuperAdmin = await checkUserPlatformAdmin(db, actorUid);

      if (!isPlatformSuperAdmin && finalCommId) {
        const commCheck = await db.execute({
          sql: "SELECT owner_uid FROM communities WHERE id = ? LIMIT 1",
          args: [finalCommId]
        });
        const isOwner = commCheck.rows?.length > 0 && commCheck.rows[0].owner_uid === actorUid;

        if (!isOwner) {
          const memRes = await db.execute({
            sql: "SELECT role, permissions FROM community_members WHERE community_id = ? AND uid = ? LIMIT 1",
            args: [finalCommId, actorUid]
          });

          if (!memRes.rows || memRes.rows.length === 0) {
            return Response.json({ success: false, error: "Access denied." }, { status: 403, headers: corsHeaders });
          }

          const role = memRes.rows[0].role;
          const perms = memRes.rows[0].permissions || 0;

          if (role !== 'owner' && !hasPermission(perms, ModPermissions.MANAGE_POSTS | ModPermissions.MANAGE_COMMENTS)) {
            return Response.json({ success: false, error: "Insufficient permissions to manage reports." }, { status: 403, headers: corsHeaders });
          }
        }
      }

      // Fetch the report
      const repRes = await db.execute({
        sql: "SELECT * FROM reports WHERE id = ? LIMIT 1",
        args: [reportId]
      });

      if (!repRes.rows || repRes.rows.length === 0) {
        return Response.json({ success: false, error: "Report not found." }, { status: 404, headers: corsHeaders });
      }

      const report = repRes.rows[0];
      const now = new Date().toISOString();

      if (action === 'approve') {
        // Remove the offending content
        if (report.target_type === 'image' || report.target_type === 'post') {
          await db.execute({
            sql: "UPDATE images SET mod_status = 'removed' WHERE id = ?",
            args: [report.target_id]
          });
        }

        await db.execute({
          sql: "UPDATE reports SET status = 'approved', handled_by = ?, handled_at = ? WHERE id = ?",
          args: [actorUid, now, reportId]
        });

        if (report.community_id) {
          await logModAction(
            db,
            report.community_id,
            actorUid,
            'resolve_report_remove_content',
            report.target_type,
            report.target_id,
            `Report approved: ${report.reason}`
          );
        }
      } else {
        // Dismiss the report
        await db.execute({
          sql: "UPDATE reports SET status = 'dismissed', handled_by = ?, handled_at = ? WHERE id = ?",
          args: [actorUid, now, reportId]
        });

        if (report.community_id) {
          await logModAction(
            db,
            report.community_id,
            actorUid,
            'dismiss_report',
            report.target_type,
            report.target_id,
            'Report dismissed by moderator'
          );
        }
      }

      return Response.json({
        success: true,
        message: `Report ${action === 'approve' ? 'resolved and content removed' : 'dismissed'}.`
      }, { status: 200, headers: corsHeaders });
    }

    return Response.json({ success: false, error: "Method not allowed." }, { status: 405, headers: corsHeaders });
  } catch (err) {
    console.error("[Community Reports Error]:", err);
    return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
  }
}

