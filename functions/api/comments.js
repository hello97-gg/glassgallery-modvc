import { getDb } from "./lib/turso.js";

const corsHeaders = {
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
};

export async function onRequest(context) {
  const request = context.request;

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const db = getDb(context.env);
    const url = new URL(request.url);

    // --- GET Method: Fetch Comments for an Image ---
    if (request.method === 'GET') {
      const imageId = url.searchParams.get('imageId');

      if (!imageId) {
        return Response.json(
          { success: false, error: "Missing imageId parameter." },
          { status: 400, headers: corsHeaders }
        );
      }

      // Fetch all comments for the image.
      const result = await db.execute({
        sql: "SELECT * FROM comments WHERE imageId = ? ORDER BY createdAt ASC",
        args: [imageId]
      });

      // Fetch all likes for these comments
      const likesRes = await db.execute({
        sql: "SELECT commentId, userUid FROM comment_likes WHERE commentId IN (SELECT id FROM comments WHERE imageId = ?)",
        args: [imageId]
      });

      const likesMap = {};
      likesRes.rows.forEach(row => {
        if (!likesMap[row.commentId]) likesMap[row.commentId] = [];
        likesMap[row.commentId].push(row.userUid);
      });

      const comments = result.rows.map(row => ({
        id: row.id,
        imageId: row.imageId,
        userUid: row.userUid,
        userName: row.userName,
        userPhotoURL: row.userPhotoURL || '',
        content: row.content,
        createdAt: row.createdAt,
        parentId: row.parentId || null,
        likeCount: parseInt(row.likeCount || 0),
        likedBy: likesMap[row.id] || []
      }));

      return Response.json({ success: true, comments }, { status: 200, headers: corsHeaders });
    }

    // --- POST Method ---
    if (request.method === 'POST') {
      const action = url.searchParams.get('action');

      let body;
      try {
        body = await request.json();
      } catch (err) {
        return Response.json(
          { success: false, error: "Invalid JSON body." },
          { status: 400, headers: corsHeaders }
        );
      }

      // --- Action: Like a comment ---
      if (action === 'like') {
        const { commentId, userUid } = body;
        if (!commentId || !userUid) {
          return Response.json({ success: false, error: "Missing commentId or userUid" }, { status: 400, headers: corsHeaders });
        }

        // Check if like exists
        const likeRes = await db.execute({
          sql: "SELECT * FROM comment_likes WHERE commentId = ? AND userUid = ?",
          args: [commentId, userUid]
        });

        let isLiked = false;
        if (likeRes.rows.length > 0) {
          // Unlike
          await db.execute({ sql: "DELETE FROM comment_likes WHERE commentId = ? AND userUid = ?", args: [commentId, userUid] });
          await db.execute({ sql: "UPDATE comments SET likeCount = max(0, likeCount - 1) WHERE id = ?", args: [commentId] });
        } else {
          // Like
          await db.execute({ sql: "INSERT INTO comment_likes (commentId, userUid) VALUES (?, ?)", args: [commentId, userUid] });
          await db.execute({ sql: "UPDATE comments SET likeCount = likeCount + 1 WHERE id = ?", args: [commentId] });
          isLiked = true;
        }

        return Response.json({ success: true, isLiked }, { status: 200, headers: corsHeaders });
      }

      // --- Action: Add a Comment or Nested Reply ---
      const { imageId, userUid, userName, userPhotoURL, content, parentId } = body;

      if (!imageId || !userUid || !userName || !content || !content.trim()) {
        return Response.json(
          { success: false, error: "Missing required fields (imageId, userUid, userName, content)." },
          { status: 400, headers: corsHeaders }
        );
      }

      const randomBytes = new Uint8Array(12);
      crypto.getRandomValues(randomBytes);
      const commentId = 'comment_' + Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('');

      const createdAt = new Date().toISOString();
      const parentIdClean = parentId || null;

      await db.execute({
        sql: `INSERT INTO comments (id, imageId, userUid, userName, userPhotoURL, content, createdAt, parentId, likeCount)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        args: [
          commentId,
          imageId,
          userUid,
          userName,
          userPhotoURL || '',
          content.trim(),
          createdAt,
          parentIdClean
        ]
      });

      // Increment image commentCount
      await db.execute({
        sql: "UPDATE images SET commentCount = commentCount + 1 WHERE id = ?",
        args: [imageId]
      });

      try {
        const imgRes = await db.execute({
          sql: "SELECT uploaderUid, imageUrl FROM images WHERE id = ?",
          args: [imageId]
        });
        if (imgRes.rows.length > 0) {
          const uploaderUid = imgRes.rows[0].uploaderUid;
          const imageUrl = imgRes.rows[0].imageUrl;
          let recipientUid = uploaderUid;
          
          if (parentIdClean) {
            const parentRes = await db.execute({
              sql: "SELECT userUid FROM comments WHERE id = ?",
              args: [parentIdClean]
            });
            if (parentRes.rows.length > 0) {
               recipientUid = parentRes.rows[0].userUid;
            }
          }

          if (recipientUid && recipientUid !== userUid) {
            const notifId = 'notif_' + Math.random().toString(36).substring(2, 15);
            await db.execute({
              sql: `INSERT INTO notifications (id, recipientUid, actorUid, actorName, actorPhotoURL, type, imageId, imageUrl, createdAt, read)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
              args: [notifId, recipientUid, userUid, userName, userPhotoURL || '', parentIdClean ? 'reply' : 'comment', imageId, imageUrl, createdAt]
            });
          }
        }
      } catch (err) {
        console.error("Failed to send comment notification:", err);
      }

      const newComment = {
        id: commentId,
        imageId,
        userUid,
        userName,
        userPhotoURL: userPhotoURL || '',
        content: content.trim(),
        createdAt,
        parentId: parentIdClean,
        likeCount: 0,
        likedBy: []
      };

      return Response.json({ success: true, comment: newComment }, { status: 200, headers: corsHeaders });
    }

    return Response.json({ success: false, error: "Method not allowed." }, { status: 405, headers: corsHeaders });

  } catch (error) {
    console.error("API Comments Error:", error);
    return Response.json({ success: false, error: error.message }, { status: 500, headers: corsHeaders });
  }
}
