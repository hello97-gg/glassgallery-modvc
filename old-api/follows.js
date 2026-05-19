import { db } from "./lib/turso.js";

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );
  
  // Anti-Caching Headers for Social Data
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    // --- GET Method: Fetch stats or user lists ---
    if (req.method === 'GET') {
      const { action, uid, currentUserUid } = req.query;

      if (!uid) {
        return res.status(400).json({ success: false, error: "Missing uid parameter." });
      }

      if (action === 'stats') {
        // 1. Get followers count
        const followersRes = await db.execute({
          sql: "SELECT COUNT(*) as count FROM follows WHERE followingUid = ?",
          args: [uid]
        });
        const followersCount = parseInt(followersRes.rows[0].count || 0);

        // 2. Get following count
        const followingRes = await db.execute({
          sql: "SELECT COUNT(*) as count FROM follows WHERE followerUid = ?",
          args: [uid]
        });
        const followingCount = parseInt(followingRes.rows[0].count || 0);

        // 3. Check if currentUserUid is following target
        let isFollowing = false;
        if (currentUserUid) {
          const checkRes = await db.execute({
            sql: "SELECT 1 FROM follows WHERE followerUid = ? AND followingUid = ?",
            args: [currentUserUid, uid]
          });
          isFollowing = checkRes.rows.length > 0;
        }

        return res.status(200).json({
          success: true,
          followersCount,
          followingCount,
          isFollowing
        });
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

        return res.status(200).json({ success: true, list });
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

        return res.status(200).json({ success: true, list });
      }

      return res.status(400).json({ success: false, error: "Invalid action parameter." });
    }

    // --- POST Method: Toggle follow state ---
    if (req.method === 'POST') {
      const { followerUid, followingUid, actorName, actorPhotoURL } = req.body;

      if (!followerUid || !followingUid) {
        return res.status(400).json({ success: false, error: "Missing followerUid or followingUid parameter." });
      }

      if (followerUid === followingUid) {
        return res.status(400).json({ success: false, error: "Self-following is not allowed." });
      }

      // Check if following relation already exists
      const checkRes = await db.execute({
        sql: "SELECT 1 FROM follows WHERE followerUid = ? AND followingUid = ?",
        args: [followerUid, followingUid]
      });

      const hasFollowed = checkRes.rows.length > 0;
      let isFollowing = false;

      if (hasFollowed) {
        // Unfollow
        await db.execute({
          sql: "DELETE FROM follows WHERE followerUid = ? AND followingUid = ?",
          args: [followerUid, followingUid]
        });

        // Delete notifications of type 'follow' from this follower to this recipient
        await db.execute({
          sql: "DELETE FROM notifications WHERE recipientUid = ? AND actorUid = ? AND type = 'follow'",
          args: [followingUid, followerUid]
        }).catch(err => console.error("Unfollow notification cleanup failed:", err));
      } else {
        // Follow
        const createdAt = new Date().toISOString();
        await db.execute({
          sql: "INSERT INTO follows (followerUid, followingUid, createdAt) VALUES (?, ?, ?)",
          args: [followerUid, followingUid, createdAt]
        });
        isFollowing = true;

        // Send a follow system notification
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

      return res.status(200).json({ success: true, isFollowing });
    }

    return res.status(405).json({ success: false, error: "Method not allowed." });

  } catch (error) {
    console.error("API Follows DB Error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
