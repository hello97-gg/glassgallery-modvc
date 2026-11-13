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

    // --- GET /api/communities/members?communityId=XYZ ---
    if (request.method === 'GET') {
      const communityId = url.searchParams.get('communityId');
      const roleFilter = url.searchParams.get('role'); // 'moderator', 'member', etc.
      const type = url.searchParams.get('type'); // 'requests' for pending join requests
      const search = (url.searchParams.get('q') || '').trim().toLowerCase();
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '30', 10), 100);

      if (!communityId) {
        return Response.json({ success: false, error: "Missing communityId parameter." }, { status: 400, headers: corsHeaders });
      }

      // If fetching pending join requests (for private communities)
      if (type === 'requests') {
        const reqRes = await db.execute({
          sql: `
            SELECT jr.id, jr.community_id, jr.uid, jr.message, jr.status, jr.created_at, jr.updated_at,
                   u.uploaderName as name, u.uploaderPhotoURL as photo_url, u.bio
            FROM join_requests jr
            LEFT JOIN users u ON jr.uid = u.uploaderUid
            WHERE jr.community_id = ? AND jr.status = 'pending'
            ORDER BY jr.created_at DESC
            LIMIT ?
          `,
          args: [communityId, limit]
        });
        return Response.json({ success: true, requests: reqRes.rows || [] }, { status: 200, headers: corsHeaders });
      }

      const conditions = ["cm.community_id = ?"];
      const args = [communityId];

      if (roleFilter) {
        if (roleFilter === 'mods') {
          conditions.push("cm.role IN ('owner', 'moderator')");
        } else {
          conditions.push("cm.role = ?");
          args.push(roleFilter);
        }
      }

      if (search) {
        conditions.push("LOWER(u.uploaderName) LIKE ?");
        args.push(`%${search}%`);
      }

      const sql = `
        SELECT cm.community_id, cm.uid, cm.role, cm.permissions, cm.joined_at, cm.status,
               u.uploaderName as name, u.uploaderPhotoURL as photo_url, u.bio
        FROM community_members cm
        LEFT JOIN users u ON cm.uid = u.uploaderUid
        WHERE ${conditions.join(" AND ")}
        ORDER BY 
          CASE cm.role WHEN 'owner' THEN 1 WHEN 'moderator' THEN 2 WHEN 'approved' THEN 3 ELSE 4 END,
          cm.joined_at ASC
        LIMIT ?
      `;
      args.push(limit);

      const res = await db.execute({ sql, args });
      return Response.json({ success: true, members: res.rows || [] }, { status: 200, headers: corsHeaders });
    }

    // --- POST /api/communities/members ---
    if (request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch {
        return Response.json({ success: false, error: "Invalid JSON body." }, { status: 400, headers: corsHeaders });
      }

      const action = body.action || 'join';
      const communityId = body.communityId || body.community_id;
      const callerUid = extractUid(request, body) || body.uid;

      if (!communityId || !callerUid) {
        return Response.json({ success: false, error: "Missing communityId or uid." }, { status: 400, headers: corsHeaders });
      }

      // Fetch community details
      const commRes = await db.execute({
        sql: "SELECT id, slug, name, type, owner_uid, member_count FROM communities WHERE id = ? OR slug = ? LIMIT 1",
        args: [communityId, communityId]
      });

      if (!commRes.rows || commRes.rows.length === 0) {
        return Response.json({ success: false, error: "Community not found." }, { status: 404, headers: corsHeaders });
      }

      const comm = commRes.rows[0];
      const targetCommId = comm.id;
      const isPlatformSuperAdmin = await checkUserPlatformAdmin(db, callerUid);

      // Check if caller is banned
      const banCheck = await db.execute({
        sql: "SELECT id, expires_at FROM community_bans WHERE community_id = ? AND uid = ? LIMIT 1",
        args: [targetCommId, callerUid]
      });
      if (banCheck.rows && banCheck.rows.length > 0) {
        const ban = banCheck.rows[0];
        if (!ban.expires_at || new Date(ban.expires_at).getTime() > Date.now()) {
          return Response.json({ success: false, error: "You are currently banned from this community." }, { status: 403, headers: corsHeaders });
        }
      }

      // Action: Join Community
      if (action === 'join') {
        // Check existing membership
        const memRes = await db.execute({
          sql: "SELECT role FROM community_members WHERE community_id = ? AND uid = ? LIMIT 1",
          args: [targetCommId, callerUid]
        });

        if (memRes.rows && memRes.rows.length > 0) {
          return Response.json({ success: true, isJoined: true, message: "Already a member." }, { status: 200, headers: corsHeaders });
        }

        // If private, handle join request
        if (comm.type === 'private' && !isPlatformSuperAdmin) {
          const now = new Date().toISOString();
          const reqId = 'req_' + Math.random().toString(36).substring(2, 10);
          await db.execute({
            sql: `INSERT INTO join_requests (id, community_id, uid, message, status, created_at, updated_at)
                  VALUES (?, ?, ?, ?, 'pending', ?, ?)
                  ON CONFLICT(community_id, uid) DO UPDATE SET status = 'pending', message = ?, updated_at = ?`,
            args: [reqId, targetCommId, callerUid, body.message || '', now, now, body.message || '', now]
          });
          return Response.json({ success: true, pendingApproval: true, message: "Join request submitted to moderators." }, { status: 200, headers: corsHeaders });
        }

        // Add to community_members
        const joinedAt = new Date().toISOString();
        await db.execute({
          sql: `INSERT INTO community_members (community_id, uid, role, permissions, joined_at, status)
                VALUES (?, ?, 'member', 0, ?, 'active')`,
          args: [targetCommId, callerUid, joinedAt]
        });

        // Update member count
        await db.execute({
          sql: "UPDATE communities SET member_count = member_count + 1 WHERE id = ?",
          args: [targetCommId]
        });

        // Record join event
        try {
          await db.execute({
            sql: "INSERT INTO community_events (id, uid, community_id, event, created_at) VALUES (?, ?, ?, 'join', ?)",
            args: ['ev_' + Math.random().toString(36).substring(2, 11), callerUid, targetCommId, joinedAt]
          });
        } catch {}

        return Response.json({ success: true, isJoined: true, userRole: 'member', message: "Joined successfully." }, { status: 200, headers: corsHeaders });
      }

      // Moderator / Owner Actions require caller membership resolution
      const callerMemRes = await db.execute({
        sql: "SELECT role, permissions FROM community_members WHERE community_id = ? AND uid = ? LIMIT 1",
        args: [targetCommId, callerUid]
      });
      const callerRole = callerMemRes.rows?.[0]?.role || (comm.owner_uid === callerUid ? CommunityRoles.OWNER : CommunityRoles.NONE);
      const callerPerms = parseInt(callerMemRes.rows?.[0]?.permissions || 0, 10);

      // Action: Leave Community
      if (action === 'leave') {
        const isOwner = (comm.owner_uid === callerUid || callerRole === CommunityRoles.OWNER);
        if (isOwner) {
          return Response.json({ success: false, error: "Community owner cannot leave without transferring ownership first." }, { status: 400, headers: corsHeaders });
        }

        const delRes = await db.execute({
          sql: "DELETE FROM community_members WHERE community_id = ? AND uid = ?",
          args: [targetCommId, callerUid]
        });

        if (delRes.rowsAffected > 0) {
          await db.execute({
            sql: "UPDATE communities SET member_count = MAX(0, member_count - 1) WHERE id = ?",
            args: [targetCommId]
          });
        }

        return Response.json({ success: true, isJoined: false, message: "Left community successfully." }, { status: 200, headers: corsHeaders });
      }

      // Action: Directly Add/Invite Member (Moderator / Owner)
      if (action === 'add_member' || action === 'invite') {
        const { targetUid, targetUsername } = body;
        let resolvedUid = targetUid;

        if (!resolvedUid && targetUsername) {
          const cleanUser = targetUsername.replace(/^@/, '').trim().toLowerCase();
          const userRes = await db.execute({
            sql: "SELECT uploaderUid FROM users WHERE LOWER(uploaderName) = ? OR LOWER(REPLACE(uploaderName, ' ', '')) = ? LIMIT 1",
            args: [cleanUser, cleanUser]
          });
          if (userRes.rows && userRes.rows.length > 0) {
            resolvedUid = userRes.rows[0].uploaderUid;
          } else {
            return Response.json({ success: false, error: `User "@${cleanUser}" not found.` }, { status: 404, headers: corsHeaders });
          }
        }

        if (!resolvedUid) {
          return Response.json({ success: false, error: "Missing targetUid or targetUsername." }, { status: 400, headers: corsHeaders });
        }

        const isAllowed = isPlatformSuperAdmin || hasPermission(callerRole, callerPerms, ModPermissions.MANAGE_MEMBERS, callerUid) || callerRole === CommunityRoles.OWNER || comm.owner_uid === callerUid;
        if (!isAllowed) {
          return Response.json({ success: false, error: "Permission denied. Only moderators or owners can invite members." }, { status: 403, headers: corsHeaders });
        }

        const now = new Date().toISOString();
        await db.batch([
          {
            sql: `INSERT INTO community_members (community_id, uid, role, permissions, joined_at, status)
                  VALUES (?, ?, 'member', 0, ?, 'active')
                  ON CONFLICT(community_id, uid) DO UPDATE SET status = 'active', role = 'member'`,
            args: [targetCommId, resolvedUid, now]
          },
          {
            sql: "UPDATE communities SET member_count = member_count + 1 WHERE id = ?",
            args: [targetCommId]
          },
          {
            sql: "UPDATE join_requests SET status = 'approved', updated_at = ? WHERE community_id = ? AND uid = ?",
            args: [now, targetCommId, resolvedUid]
          }
        ]);

        // Send community invite notification to the user
        try {
          const notifId = 'notif_' + Math.random().toString(36).substring(2, 15);
          await db.execute({
            sql: `INSERT INTO notifications (id, recipientUid, actorUid, actorName, actorPhotoURL, type, imageId, imageUrl, createdAt, read)
                  VALUES (?, ?, ?, ?, ?, 'community_invite', '', '', ?, 0)`,
            args: [
              notifId,
              resolvedUid,
              'c/' + comm.slug,
              comm.name || ('c/' + comm.slug),
              comm.icon_url || '',
              now
            ]
          });
        } catch (e) {
          console.warn("[Invite Notif Error]:", e.message);
        }

        return Response.json({ success: true, message: "Member successfully added to community." }, { status: 200, headers: corsHeaders });
      }

      // Action: Approve or Reject Join Request (Private Communities)
      if (action === 'approve_request' || action === 'reject_request') {
        const { targetUid } = body;
        if (!targetUid) {
          return Response.json({ success: false, error: "Missing targetUid." }, { status: 400, headers: corsHeaders });
        }

        const isAllowed = isPlatformSuperAdmin || hasPermission(callerRole, callerPerms, ModPermissions.MANAGE_MEMBERS, callerUid);
        if (!isAllowed) {
          return Response.json({ success: false, error: "Permission denied." }, { status: 403, headers: corsHeaders });
        }

        const now = new Date().toISOString();
        if (action === 'approve_request') {
          await db.batch([
            {
              sql: `INSERT INTO community_members (community_id, uid, role, permissions, joined_at, status)
                    VALUES (?, ?, 'member', 0, ?, 'active')
                    ON CONFLICT(community_id, uid) DO UPDATE SET status = 'active', role = 'member'`,
              args: [targetCommId, targetUid, now]
            },
            {
              sql: "UPDATE communities SET member_count = member_count + 1 WHERE id = ?",
              args: [targetCommId]
            },
            {
              sql: "UPDATE join_requests SET status = 'approved', updated_at = ? WHERE community_id = ? AND uid = ?",
              args: [now, targetCommId, targetUid]
            }
          ]);

          // Send approval notification
          try {
            const notifId = 'notif_' + Math.random().toString(36).substring(2, 15);
            await db.execute({
              sql: `INSERT INTO notifications (id, recipientUid, actorUid, actorName, actorPhotoURL, type, imageId, imageUrl, createdAt, read)
                    VALUES (?, ?, ?, ?, ?, 'join_request_approved', '', '', ?, 0)`,
              args: [
                notifId,
                targetUid,
                'c/' + comm.slug,
                comm.name || ('c/' + comm.slug),
                comm.icon_url || '',
                now
              ]
            });
          } catch (e) {
            console.warn("[Approve Join Notif Error]:", e.message);
          }
        } else {
          await db.execute({
            sql: "UPDATE join_requests SET status = 'rejected', updated_at = ? WHERE community_id = ? AND uid = ?",
            args: [now, targetCommId, targetUid]
          });
        }

        await logModAction(db, {
          community_id: targetCommId,
          actor_uid: callerUid,
          action,
          target_type: 'user',
          target_id: targetUid,
          is_platform_override: isPlatformSuperAdmin && callerRole !== CommunityRoles.OWNER
        });

        return Response.json({ success: true, message: `Request ${action === 'approve_request' ? 'approved' : 'rejected'}.` }, { status: 200, headers: corsHeaders });
      }

      // Action: Update Member Role or Permissions (Promote to Mod, Demote, etc.)
      if (action === 'update_role') {
        const { targetUid, newRole, newPermissions } = body;
        if (!targetUid || !newRole) {
          return Response.json({ success: false, error: "Missing targetUid or newRole." }, { status: 400, headers: corsHeaders });
        }

        // Fetch target's current role
        const targetRes = await db.execute({
          sql: "SELECT role, permissions FROM community_members WHERE community_id = ? AND uid = ? LIMIT 1",
          args: [targetCommId, targetUid]
        });

        if (!targetRes.rows || targetRes.rows.length === 0) {
          return Response.json({ success: false, error: "Target is not a member." }, { status: 404, headers: corsHeaders });
        }

        const targetRole = targetRes.rows[0].role;

        // Rank escalation check: Must be able to act on target
        if (!canActOnUser(callerRole, targetRole, callerUid, targetUid) && !isPlatformSuperAdmin) {
          return Response.json({ success: false, error: "You cannot modify someone with equal or higher rank." }, { status: 403, headers: corsHeaders });
        }

        // Promoting to or modifying a moderator requires MANAGE_MODS (or Owner)
        if (newRole === CommunityRoles.MODERATOR || targetRole === CommunityRoles.MODERATOR) {
          const canManageMods = isPlatformSuperAdmin || callerRole === CommunityRoles.OWNER || hasPermission(callerRole, callerPerms, ModPermissions.MANAGE_MODS, callerUid);
          if (!canManageMods) {
            return Response.json({ success: false, error: "Only the community owner or authorized moderators can manage mod roles." }, { status: 403, headers: corsHeaders });
          }
        }

        const perms = (newRole === CommunityRoles.MODERATOR && newPermissions !== undefined)
          ? parseInt(newPermissions, 10)
          : (newRole === CommunityRoles.MODERATOR ? (ModPermissions.MANAGE_POSTS | ModPermissions.MANAGE_COMMENTS | ModPermissions.VIEW_MOD_LOG) : 0);

        await db.execute({
          sql: "UPDATE community_members SET role = ?, permissions = ? WHERE community_id = ? AND uid = ?",
          args: [newRole, perms, targetCommId, targetUid]
        });

        await logModAction(db, {
          community_id: targetCommId,
          actor_uid: callerUid,
          action: 'update_role',
          target_type: 'user',
          target_id: targetUid,
          reason: `Role updated from ${targetRole} to ${newRole}`,
          metadata: { oldRole: targetRole, newRole, permissions: perms },
          is_platform_override: isPlatformSuperAdmin && callerRole !== CommunityRoles.OWNER
        });

        return Response.json({ success: true, message: `Member role updated to ${newRole}.` }, { status: 200, headers: corsHeaders });
      }

      // Action: Transfer Ownership
      if (action === 'transfer_ownership') {
        const { targetUid } = body;
        if (!targetUid) {
          return Response.json({ success: false, error: "Missing targetUid." }, { status: 400, headers: corsHeaders });
        }

        if (callerRole !== CommunityRoles.OWNER && !isPlatformSuperAdmin) {
          return Response.json({ success: false, error: "Only the current community owner can transfer ownership." }, { status: 403, headers: corsHeaders });
        }

        await db.batch([
          // 1. Demote old owner to moderator with full permissions
          {
            sql: "UPDATE community_members SET role = 'moderator', permissions = ? WHERE community_id = ? AND uid = ?",
            args: [ModPermissions.ALL, targetCommId, comm.owner_uid]
          },
          // 2. Promote target to owner
          {
            sql: `INSERT INTO community_members (community_id, uid, role, permissions, joined_at, status)
                  VALUES (?, ?, 'owner', ?, datetime('now'), 'active')
                  ON CONFLICT(community_id, uid) DO UPDATE SET role = 'owner', permissions = ?`,
            args: [targetCommId, targetUid, ModPermissions.ALL, ModPermissions.ALL]
          },
          // 3. Update owner_uid on communities table
          {
            sql: "UPDATE communities SET owner_uid = ? WHERE id = ?",
            args: [targetUid, targetCommId]
          }
        ]);

        await logModAction(db, {
          community_id: targetCommId,
          actor_uid: callerUid,
          action: 'transfer_ownership',
          target_type: 'community',
          target_id: targetCommId,
          reason: `Ownership transferred from ${comm.owner_uid} to ${targetUid}`,
          is_platform_override: isPlatformSuperAdmin && callerRole !== CommunityRoles.OWNER
        });

        return Response.json({ success: true, message: "Ownership transferred successfully." }, { status: 200, headers: corsHeaders });
      }

      return Response.json({ success: false, error: `Unknown action: ${action}` }, { status: 400, headers: corsHeaders });
    }

    // --- DELETE /api/communities/members ---
    // Leave community (self) or Kick/Remove member (moderator)
    if (request.method === 'DELETE') {
      let body = {};
      try { body = await request.json(); } catch {}
      const callerUid = url.searchParams.get('uid') || body.uid;
      const targetUid = url.searchParams.get('targetUid') || body.targetUid || callerUid;
      const communityId = url.searchParams.get('communityId') || body.communityId;

      if (!communityId || !callerUid) {
        return Response.json({ success: false, error: "Missing communityId or uid." }, { status: 400, headers: corsHeaders });
      }

      const isSelfLeave = (callerUid === targetUid);
      const isPlatformSuperAdmin = await checkUserPlatformAdmin(db, callerUid);

      // Fetch caller and target roles
      const [callerRes, targetRes] = await Promise.all([
        db.execute({
          sql: "SELECT role, permissions FROM community_members WHERE community_id = ? AND uid = ? LIMIT 1",
          args: [communityId, callerUid]
        }),
        db.execute({
          sql: "SELECT role FROM community_members WHERE community_id = ? AND uid = ? LIMIT 1",
          args: [communityId, targetUid]
        })
      ]);

      if (!targetRes.rows || targetRes.rows.length === 0) {
        return Response.json({ success: true, message: "User is not a member." }, { status: 200, headers: corsHeaders });
      }

      const targetRole = targetRes.rows[0].role;
      const callerRole = callerRes.rows?.[0]?.role || CommunityRoles.NONE;
      const callerPerms = parseInt(callerRes.rows?.[0]?.permissions || 0, 10);

      // If owner is trying to leave, they must transfer ownership first
      if (isSelfLeave && targetRole === CommunityRoles.OWNER) {
        return Response.json({ success: false, error: "Community owner cannot leave without transferring ownership first." }, { status: 400, headers: corsHeaders });
      }

      // If kicking someone else, verify permission and rank escalation
      if (!isSelfLeave) {
        const canKick = isPlatformSuperAdmin || hasPermission(callerRole, callerPerms, ModPermissions.MANAGE_MEMBERS, callerUid);
        if (!canKick) {
          return Response.json({ success: false, error: "Permission denied." }, { status: 403, headers: corsHeaders });
        }
        if (!canActOnUser(callerRole, targetRole, callerUid, targetUid) && !isPlatformSuperAdmin) {
          return Response.json({ success: false, error: "Cannot kick someone with equal or higher rank." }, { status: 403, headers: corsHeaders });
        }
      }

      // Remove from community_members
      await db.execute({
        sql: "DELETE FROM community_members WHERE community_id = ? AND uid = ?",
        args: [communityId, targetUid]
      });

      // Decrement member count
      await db.execute({
        sql: "UPDATE communities SET member_count = MAX(1, member_count - 1) WHERE id = ?",
        args: [communityId]
      });

      if (!isSelfLeave) {
        await logModAction(db, {
          community_id: communityId,
          actor_uid: callerUid,
          action: 'kick_member',
          target_type: 'user',
          target_id: targetUid,
          reason: body.reason || 'Kicked by moderator',
          is_platform_override: isPlatformSuperAdmin && callerRole !== CommunityRoles.OWNER
        });
      } else {
        try {
          await db.execute({
            sql: "INSERT INTO community_events (id, uid, community_id, event, created_at) VALUES (?, ?, ?, 'leave', ?)",
            args: ['ev_' + Math.random().toString(36).substring(2, 11), callerUid, communityId, new Date().toISOString()]
          });
        } catch {}
      }

      return Response.json({ success: true, message: isSelfLeave ? "Left community." : "Member removed." }, { status: 200, headers: corsHeaders });
    }

    return Response.json({ success: false, error: `Method ${request.method} not allowed.` }, { status: 405, headers: corsHeaders });
  } catch (error) {
    console.error("[API /communities/members Error]:", error);
    return Response.json({ success: false, error: error.message }, { status: 500, headers: corsHeaders });
  }
}

