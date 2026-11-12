import { getDb } from "../lib/turso.js";
import {
  CommunityRoles,
  ModPermissions,
  hasPermission,
  checkUserPlatformAdmin,
  logModAction
} from "../lib/communityPermissions.js";

const corsHeaders = {
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
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

    // --- GET /api/communities/rules?communityId=XYZ ---
    if (request.method === 'GET') {
      const communityId = url.searchParams.get('communityId');
      if (!communityId) {
        return Response.json({ success: false, error: "Missing communityId." }, { status: 400, headers: corsHeaders });
      }

      const res = await db.execute({
        sql: `SELECT id, community_id, title, body, position, created_at
              FROM community_rules
              WHERE community_id = ?
              ORDER BY position ASC, created_at ASC`,
        args: [communityId]
      });

      return Response.json({ success: true, rules: res.rows || [] }, { status: 200, headers: corsHeaders });
    }

    // Auth & Permission helper for mutating rules
    async function checkRulePermission(communityId, uid) {
      if (!uid) return { allowed: false, error: "Authentication required." };
      const isPlatformSuperAdmin = await checkUserPlatformAdmin(db, uid);
      if (isPlatformSuperAdmin) return { allowed: true, isPlatformOverride: true };

      const memRes = await db.execute({
        sql: "SELECT role, permissions FROM community_members WHERE community_id = ? AND uid = ? LIMIT 1",
        args: [communityId, uid]
      });

      if (!memRes.rows || memRes.rows.length === 0) {
        return { allowed: false, error: "Not a member of this community." };
      }

      const role = memRes.rows[0].role;
      const perms = parseInt(memRes.rows[0].permissions || 0, 10);
      const allowed = hasPermission(role, perms, ModPermissions.MANAGE_RULES_SETTINGS, uid);

      if (!allowed) {
        return { allowed: false, error: "Requires MANAGE_RULES_SETTINGS permission." };
      }

      return { allowed: true, role, isPlatformOverride: false };
    }

    // --- POST /api/communities/rules ---
    if (request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch {
        return Response.json({ success: false, error: "Invalid JSON." }, { status: 400, headers: corsHeaders });
      }

      const { communityId, title, body: ruleBody = '', position = 0 } = body;
      const uid = extractUid(request, body) || body.uid;
      if (!communityId || !title || !title.trim()) {
        return Response.json({ success: false, error: "Missing communityId or rule title." }, { status: 400, headers: corsHeaders });
      }

      const perm = await checkRulePermission(communityId, uid);
      if (!perm.allowed) {
        return Response.json({ success: false, error: perm.error }, { status: 403, headers: corsHeaders });
      }

      const ruleId = 'rule_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
      const createdAt = new Date().toISOString();

      await db.execute({
        sql: `INSERT INTO community_rules (id, community_id, title, body, position, created_at)
              VALUES (?, ?, ?, ?, ?, ?)`,
        args: [ruleId, communityId, title.trim(), ruleBody.trim(), parseInt(position, 10) || 0, createdAt]
      });

      await logModAction(db, {
        community_id: communityId,
        actor_uid: uid,
        action: 'add_rule',
        target_type: 'rule',
        target_id: ruleId,
        reason: `Added rule: "${title.trim()}"`,
        is_platform_override: perm.isPlatformOverride
      });

      return Response.json({
        success: true,
        rule: {
          id: ruleId,
          community_id: communityId,
          title: title.trim(),
          body: ruleBody.trim(),
          position: parseInt(position, 10) || 0,
          created_at: createdAt
        }
      }, { status: 201, headers: corsHeaders });
    }

    // --- PUT /api/communities/rules ---
    // Update or reorder rules
    if (request.method === 'PUT') {
      let body;
      try { body = await request.json(); } catch {
        return Response.json({ success: false, error: "Invalid JSON." }, { status: 400, headers: corsHeaders });
      }

      const { communityId, ruleId, title, body: ruleBody, position, reorderedRules } = body;
      const uid = extractUid(request, body) || body.uid;
      if (!communityId) {
        return Response.json({ success: false, error: "Missing communityId." }, { status: 400, headers: corsHeaders });
      }

      const perm = await checkRulePermission(communityId, uid);
      if (!perm.allowed) {
        return Response.json({ success: false, error: perm.error }, { status: 403, headers: corsHeaders });
      }

      // Batch reorder
      if (Array.isArray(reorderedRules)) {
        const batchStmts = reorderedRules.map((r, idx) => ({
          sql: "UPDATE community_rules SET position = ? WHERE id = ? AND community_id = ?",
          args: [idx, r.id, communityId]
        }));
        await db.batch(batchStmts);
        return Response.json({ success: true, message: "Rules reordered." }, { status: 200, headers: corsHeaders });
      }

      // Single rule update
      if (!ruleId) {
        return Response.json({ success: false, error: "Missing ruleId." }, { status: 400, headers: corsHeaders });
      }

      const updates = [];
      const updateArgs = [];

      if (title !== undefined) {
        updates.push("title = ?");
        updateArgs.push(title.trim());
      }
      if (ruleBody !== undefined) {
        updates.push("body = ?");
        updateArgs.push(ruleBody.trim());
      }
      if (position !== undefined) {
        updates.push("position = ?");
        updateArgs.push(parseInt(position, 10));
      }

      if (updates.length > 0) {
        updateArgs.push(ruleId, communityId);
        await db.execute({
          sql: `UPDATE community_rules SET ${updates.join(', ')} WHERE id = ? AND community_id = ?`,
          args: updateArgs
        });
      }

      return Response.json({ success: true, message: "Rule updated." }, { status: 200, headers: corsHeaders });
    }

    // --- DELETE /api/communities/rules ---
    if (request.method === 'DELETE') {
      let body = {};
      try { body = await request.json(); } catch {}
      const communityId = url.searchParams.get('communityId') || body.communityId;
      const ruleId = url.searchParams.get('ruleId') || body.ruleId;
      const uid = extractUid(request, body) || url.searchParams.get('uid') || body.uid;

      if (!communityId || !ruleId) {
        return Response.json({ success: false, error: "Missing communityId or ruleId." }, { status: 400, headers: corsHeaders });
      }

      const perm = await checkRulePermission(communityId, uid);
      if (!perm.allowed) {
        return Response.json({ success: false, error: perm.error }, { status: 403, headers: corsHeaders });
      }

      await db.execute({
        sql: "DELETE FROM community_rules WHERE id = ? AND community_id = ?",
        args: [ruleId, communityId]
      });

      await logModAction(db, {
        community_id: communityId,
        actor_uid: uid,
        action: 'delete_rule',
        target_type: 'rule',
        target_id: ruleId,
        reason: 'Rule deleted',
        is_platform_override: perm.isPlatformOverride
      });

      return Response.json({ success: true, message: "Rule deleted." }, { status: 200, headers: corsHeaders });
    }

    return Response.json({ success: false, error: `Method ${request.method} not allowed.` }, { status: 405, headers: corsHeaders });
  } catch (error) {
    console.error("[API /communities/rules Error]:", error);
    return Response.json({ success: false, error: error.message }, { status: 500, headers: corsHeaders });
  }
}

