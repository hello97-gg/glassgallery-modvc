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

    // --- POST /api/communities/moderation ---
    // Actions: pin, unpin, lock, unlock, approve_post, remove_post, update_automod
    if (request.method === 'POST') {
      let body;
      try {
        body = await request.json();
      } catch {
        return Response.json({ success: false, error: "Invalid JSON body." }, { status: 400, headers: corsHeaders });
      }

      const actorUid = extractUid(request, body);
      const { action, communityId, community_id, postId, settings } = body;
      const finalCommId = communityId || community_id;

      if (!actorUid || !finalCommId || !action) {
        return Response.json({ success: false, error: "Missing required parameters (action, communityId)." }, { status: 400, headers: corsHeaders });
      }

      const isPlatformSuperAdmin = await checkUserPlatformAdmin(db, actorUid);

      let actorRole = 'none';
      let actorPerms = 0;

      if (!isPlatformSuperAdmin) {
        const memRes = await db.execute({
          sql: "SELECT role, permissions FROM community_members WHERE community_id = ? AND uid = ? LIMIT 1",
          args: [finalCommId, actorUid]
        });

        if (!memRes.rows || memRes.rows.length === 0) {
          return Response.json({ success: false, error: "Access denied." }, { status: 403, headers: corsHeaders });
        }

        actorRole = memRes.rows[0].role;
        actorPerms = memRes.rows[0].permissions || 0;
      }

      // 1. Post Pinning & Unpinning
      if (action === 'pin' || action === 'unpin') {
        if (!isPlatformSuperAdmin && actorRole !== 'owner' && !hasPermission(actorPerms, ModPermissions.MANAGE_POSTS)) {
          return Response.json({ success: false, error: "Insufficient permissions to pin posts." }, { status: 403, headers: corsHeaders });
        }

        const isPinned = action === 'pin' ? 1 : 0;
        await db.execute({
          sql: "UPDATE images SET is_pinned = ? WHERE id = ? AND community_id = ?",
          args: [isPinned, postId, finalCommId]
        });

        await logModAction(
          db,
          finalCommId,
          actorUid,
          action === 'pin' ? 'pin_post' : 'unpin_post',
          'image',
          postId,
          `Post ${action}ned`
        );

        return Response.json({ success: true, message: `Post ${action}ned.` }, { status: 200, headers: corsHeaders });
      }

      // 2. Post Locking & Unlocking
      if (action === 'lock' || action === 'unlock') {
        if (!isPlatformSuperAdmin && actorRole !== 'owner' && !hasPermission(actorPerms, ModPermissions.MANAGE_POSTS)) {
          return Response.json({ success: false, error: "Insufficient permissions to lock posts." }, { status: 403, headers: corsHeaders });
        }

        const isLocked = action === 'lock' ? 1 : 0;
        await db.execute({
          sql: "UPDATE images SET is_locked = ? WHERE id = ? AND community_id = ?",
          args: [isLocked, postId, finalCommId]
        });

        await logModAction(
          db,
          finalCommId,
          actorUid,
          action === 'lock' ? 'lock_post' : 'unlock_post',
          'image',
          postId,
          `Post comments ${action}ed`
        );

        return Response.json({ success: true, message: `Post comments ${action}ed.` }, { status: 200, headers: corsHeaders });
      }

      // 3. Post Approval or Removal
      if (action === 'approve_post' || action === 'remove_post') {
        if (!isPlatformSuperAdmin && actorRole !== 'owner' && !hasPermission(actorPerms, ModPermissions.MANAGE_POSTS)) {
          return Response.json({ success: false, error: "Insufficient permissions to manage post visibility." }, { status: 403, headers: corsHeaders });
        }

        const modStatus = action === 'approve_post' ? 'approved' : 'removed';
        await db.execute({
          sql: "UPDATE images SET mod_status = ? WHERE id = ? AND community_id = ?",
          args: [modStatus, postId, finalCommId]
        });

        // Increment community post_count if approved
        if (modStatus === 'approved') {
          try {
            await db.execute({
              sql: "UPDATE communities SET post_count = post_count + 1 WHERE id = ?",
              args: [finalCommId]
            });
          } catch (e) {
            console.warn("[Approve Post] Update post_count error:", e.message);
          }
        }

        // Send notification to author
        try {
          const postRes = await db.execute({
            sql: "SELECT uploaderUid, imageUrl, thumbnailUrl FROM images WHERE id = ? LIMIT 1",
            args: [postId]
          });
          const commRes = await db.execute({
            sql: "SELECT slug, name, icon_url FROM communities WHERE id = ? LIMIT 1",
            args: [finalCommId]
          });

          if (postRes.rows?.length > 0 && commRes.rows?.length > 0) {
            const postRow = postRes.rows[0];
            const commRow = commRes.rows[0];
            const notifType = action === 'approve_post' ? 'community_post_approved' : 'community_post_removed';
            const notifId = 'notif_' + Math.random().toString(36).substring(2, 15);
            const now = new Date().toISOString();
            const imgUrl = (postRow.imageUrl && postRow.imageUrl !== 'text://post' && !postRow.imageUrl.startsWith('text://'))
              ? (postRow.thumbnailUrl || postRow.imageUrl)
              : '';

            await db.execute({
              sql: `INSERT INTO notifications (id, recipientUid, actorUid, actorName, actorPhotoURL, type, imageId, imageUrl, createdAt, read)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
              args: [
                notifId,
                postRow.uploaderUid,
                'c/' + commRow.slug,
                commRow.name || ('c/' + commRow.slug),
                commRow.icon_url || '',
                notifType,
                postId,
                imgUrl,
                now
              ]
            });
          }
        } catch (notifErr) {
          console.warn("[Mod Action Notif Error]:", notifErr.message);
        }

        await logModAction(
          db,
          finalCommId,
          actorUid,
          action,
          'image',
          postId,
          `Post marked as ${modStatus}`
        );

        return Response.json({ success: true, message: `Post ${modStatus}.` }, { status: 200, headers: corsHeaders });
      }

      // 4. Update Community Automod Settings
      if (action === 'update_automod') {
        if (!isPlatformSuperAdmin && actorRole !== 'owner' && !hasPermission(actorPerms, ModPermissions.MANAGE_RULES_SETTINGS)) {
          return Response.json({ success: false, error: "Insufficient permissions to edit automod settings." }, { status: 403, headers: corsHeaders });
        }

        const commRes = await db.execute({
          sql: "SELECT settings_json FROM communities WHERE id = ? LIMIT 1",
          args: [finalCommId]
        });

        if (!commRes.rows || commRes.rows.length === 0) {
          return Response.json({ success: false, error: "Community not found." }, { status: 404, headers: corsHeaders });
        }

        const currentSettings = typeof commRes.rows[0].settings_json === 'string'
          ? JSON.parse(commRes.rows[0].settings_json || '{}')
          : (commRes.rows[0].settings_json || {});

        const updatedSettings = {
          ...currentSettings,
          ...settings
        };

        await db.execute({
          sql: "UPDATE communities SET settings_json = ? WHERE id = ?",
          args: [JSON.stringify(updatedSettings), finalCommId]
        });

        await logModAction(
          db,
          finalCommId,
          actorUid,
          'edit_automod_settings',
          'community',
          finalCommId,
          'Automod settings updated'
        );

        return Response.json({ success: true, message: "Automod settings saved.", settings: updatedSettings }, { status: 200, headers: corsHeaders });
      }

      return Response.json({ success: false, error: `Unknown action: ${action}` }, { status: 400, headers: corsHeaders });
    }

    return Response.json({ success: false, error: "Method not allowed." }, { status: 405, headers: corsHeaders });
  } catch (err) {
    console.error("[Community Moderation Error]:", err);
    return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
  }
}

