import { getDb } from "./lib/turso.js";

const corsHeaders = {
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version',
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  'Pragma': 'no-cache',
  'Expires': '0'
};

export async function onRequest(context) {
  const request = context.request;

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const db = getDb(context.env);

    // --- GET Method: Fetch stats or user lists ---
    if (request.method === 'GET') {
      const url = new URL(request.url);
      const action = url.searchParams.get('action');
      const uid = url.searchParams.get('uid');
      const currentUserUid = url.searchParams.get('currentUserUid');

      if (!uid) {
        return Response.json({ success: false, error: "Missing uid parameter." }, { status: 400, headers: corsHeaders });
      }

      if (action === 'stats') {
        const followersRes = await db.execute({
          sql: "SELECT COUNT(*) as count FROM follows WHERE followingUid = ?",
          args: [uid]
        });
        const followersCount = parseInt(followersRes.rows[0].count || 0);

        const followingRes = await db.execute({
          sql: "SELECT COUNT(*) as count FROM follows WHERE followerUid = ?",
          args: [uid]
        });
        const followingCount = parseInt(followingRes.rows[0].count || 0);

        let isFollowing = false;
        if (currentUserUid) {
          const checkRes = await db.execute({
            sql: "SELECT 1 FROM follows WHERE followerUid = ? AND followingUid = ?",
            args: [currentUserUid, uid]
          });
          isFollowing = checkRes.rows.length > 0;
        }

        return Response.json({
          success: true,
          followersCount,
          followingCount,
          isFollowing
        }, { status: 200, headers: corsHeaders });
      }

      if (action === 'followers') {
        const result = await db.execute({
          sql: `SELECT u.uploaderUid, u.uploaderName, u.uploaderPhotoURL 
                FROM follows f 
                JOIN users u ON f.followerUid = u.uploaderUid 
                WHERE f.followingUid = ? 
                ORDER BY f.createdAt DESC`,
          args: [uid]
        });

        const list = result.rows.map(row => ({
          uploaderUid: row.uploaderUid,
          uploaderName: row.uploaderName || 'Anonymous',
          uploaderPhotoURL: row.uploaderPhotoURL || ''
        }));

        return Response.json({ success: true, list }, { status: 200, headers: corsHeaders });
      }

      if (action === 'following') {
        const result = await db.execute({
          sql: `SELECT u.uploaderUid, u.uploaderName, u.uploaderPhotoURL 
                FROM follows f 
                JOIN users u ON f.followingUid = u.uploaderUid 
                WHERE f.followerUid = ? 
                ORDER BY f.createdAt DESC`,
          args: [uid]
        });

        const list = result.rows.map(row => ({
          uploaderUid: row.uploaderUid,
          uploaderName: row.uploaderName || 'Anonymous',
          uploaderPhotoURL: row.uploaderPhotoURL || ''
        }));

        return Response.json({ success: true, list }, { status: 200, headers: corsHeaders });
      }

      return Response.json({ success: false, error: "Invalid action parameter." }, { status: 400, headers: corsHeaders });
    }

    // --- POST Method: Toggle follow state ---
    if (request.method === 'POST') {
      let body;
      try {
        body = await request.json();
      } catch (err) {
        return Response.json({ success: false, error: "Invalid JSON body" }, { status: 400, headers: corsHeaders });
      }
      
      const { followerUid, followingUid, actorName, actorPhotoURL } = body;

      if (!followerUid || !followingUid) {
        return Response.json({ success: false, error: "Missing followerUid or followingUid parameter." }, { status: 400, headers: corsHeaders });
      }

      if (followerUid === followingUid) {
        return Response.json({ success: false, error: "Self-following is not allowed." }, { status: 400, headers: corsHeaders });
      }

      const checkRes = await db.execute({
        sql: "SELECT 1 FROM follows WHERE followerUid = ? AND followingUid = ?",
        args: [followerUid, followingUid]
      });

      const hasFollowed = checkRes.rows.length > 0;
      let isFollowing = false;

      if (hasFollowed) {
        await db.execute({
          sql: "DELETE FROM follows WHERE followerUid = ? AND followingUid = ?",
          args: [followerUid, followingUid]
        });

        await db.execute({
          sql: "DELETE FROM notifications WHERE recipientUid = ? AND actorUid = ? AND type = 'follow'",
          args: [followingUid, followerUid]
        }).catch(err => console.error("Unfollow notification cleanup failed:", err));
      } else {
        const createdAt = new Date().toISOString();
        await db.execute({
          sql: "INSERT INTO follows (followerUid, followingUid, createdAt) VALUES (?, ?, ?)",
          args: [followerUid, followingUid, createdAt]
        });
        isFollowing = true;

        const notifId = 'notif_' + Math.random().toString(36).substring(2, 15);
        await db.execute({
          sql: `INSERT INTO notifications (id, recipientUid, actorUid, actorName, actorPhotoURL, type, imageId, imageUrl, createdAt, read) 
                VALUES (?, ?, ?, ?, ?, 'follow', '', '', ?, 0)`,
          args: [
            notifId,
            followingUid,
            followerUid,
            actorName || 'Someone',
            actorPhotoURL || '',
            createdAt
          ]
        }).catch(err => console.error("Follow notification failed:", err));
      }

      return Response.json({ success: true, isFollowing }, { status: 200, headers: corsHeaders });
    }

    return Response.json({ success: false, error: "Method not allowed." }, { status: 405, headers: corsHeaders });

  } catch (error) {
    console.error("API Follows DB Error:", error);
    return Response.json({ success: false, error: error.message }, { status: 500, headers: corsHeaders });
  }
}
