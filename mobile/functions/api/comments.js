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

    // --- GET Method: Fetch Comments for an Image OR User ---
    if (request.method === 'GET') {
      const imageId = url.searchParams.get('imageId');
      const userUid = url.searchParams.get('userUid');

      if (!imageId && !userUid) {
        return Response.json(
          { success: false, error: "Missing imageId or userUid parameter." },
          { status: 400, headers: corsHeaders }
        );
      }

      // Fetch all comments authored by a specific user across all posts
      if (userUid) {
        // Privacy check: check if user has hidden their replies
        const requesterUid = url.searchParams.get('requesterUid');
        if (requesterUid !== userUid) {
          try {
            const userCheck = await db.execute({
              sql: "SELECT hideReplies FROM users WHERE uploaderUid = ? LIMIT 1",
              args: [userUid]
            });
            if (userCheck.rows.length > 0 && parseInt(userCheck.rows[0].hideReplies || 0) === 1) {
              return Response.json({ success: true, comments: [], hidden: true }, { status: 200, headers: corsHeaders });
            }
          } catch {
            // If hideReplies column doesn't exist yet, proceed normally
          }
        }

        const result = await db.execute({
          sql: `SELECT c.*, 
                       i.imageUrl as postImageUrl, 
                       i.uploaderUid as postUploaderUid, 
                       i.uploaderName as postUploaderName, 
                       i.uploaderPhotoURL as postUploaderPhotoURL,
                       i.title as postTitle, 
                       i.description as postDescription,
                       i.flags as postFlags,
                       i.license as postLicense,
                       i.licenseUrl as postLicenseUrl,
                       i.originalWorkUrl as postOriginalWorkUrl,
                       i.uploadedAt as postUploadedAt,
                       i.likeCount as postLikeCount,
                       i.downloadCount as postDownloadCount,
                       i.commentCount as postCommentCount,
                       i.location as postLocation
                FROM comments c
                LEFT JOIN images i ON c.imageId = i.id
                WHERE c.userUid = ?
                ORDER BY c.createdAt DESC
                LIMIT 50`,
          args: [userUid]
        });

        const likesMap = {};
        if (result.rows.length > 0) {
          const commentIds = result.rows.map(r => r.id);
          const placeholders = commentIds.map(() => '?').join(',');
          try {
            const likesRes = await db.execute({
              sql: `SELECT commentId, userUid FROM comment_likes WHERE commentId IN (${placeholders})`,
              args: commentIds
            });
            likesRes.rows.forEach(row => {
              if (!likesMap[row.commentId]) likesMap[row.commentId] = [];
              likesMap[row.commentId].push(row.userUid);
            });
          } catch (e) {
            console.error("Failed to query comment likes for user comments:", e);
          }
        }

        const comments = result.rows.map(row => {
          let parsedFlags = [];
          try { parsedFlags = row.postFlags ? JSON.parse(row.postFlags) : []; } catch { }

          const post = row.postImageUrl ? {
            id: row.imageId,
            imageUrl: row.postImageUrl,
            uploaderUid: row.postUploaderUid || '',
            uploaderName: row.postUploaderName || 'Unknown',
            uploaderPhotoURL: row.postUploaderPhotoURL || '',
            title: row.postTitle || '',
            description: row.postDescription || '',
            tags: parsedFlags,
            flags: parsedFlags,
            license: row.postLicense || 'CC0',
            licenseUrl: row.postLicenseUrl || '',
            originalWorkUrl: row.postOriginalWorkUrl || '',
            uploadedAt: row.postUploadedAt,
            likeCount: parseInt(row.postLikeCount || 0),
            downloadCount: parseInt(row.postDownloadCount || 0),
            commentCount: parseInt(row.postCommentCount || 0),
            location: row.postLocation || ''
          } : null;

          return {
            id: row.id,
            imageId: row.imageId,
            userUid: row.userUid,
            userName: row.userName,
            userPhotoURL: row.userPhotoURL || '',
            content: row.content,
            createdAt: row.createdAt,
            parentId: row.parentId || null,
            likeCount: parseInt(row.likeCount || 0),
            likedBy: likesMap[row.id] || [],
            post
          };
        });

        return Response.json({ success: true, comments }, { status: 200, headers: corsHeaders });
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

      // --- Action: Edit a comment ---
      if (action === 'edit') {
        const { commentId, userUid, content } = body;
        if (!commentId || !userUid || !content || !content.trim()) {
          return Response.json({ success: false, error: "Missing required fields for edit." }, { status: 400, headers: corsHeaders });
        }

        // Verify ownership
        const ownerRes = await db.execute({
          sql: "SELECT userUid FROM comments WHERE id = ?",
          args: [commentId]
        });
        if (ownerRes.rows.length === 0 || ownerRes.rows[0].userUid !== userUid) {
          return Response.json({ success: false, error: "Unauthorized to edit this comment." }, { status: 403, headers: corsHeaders });
        }

        await db.execute({
          sql: "UPDATE comments SET content = ? WHERE id = ?",
          args: [content.trim(), commentId]
        });

        return Response.json({ success: true }, { status: 200, headers: corsHeaders });
      }

      // --- Action: Delete a comment ---
      if (action === 'delete') {
        const { commentId, userUid } = body;
        if (!commentId || !userUid) {
          return Response.json({ success: false, error: "Missing commentId or userUid." }, { status: 400, headers: corsHeaders });
        }

        // Verify ownership (comment author or post uploader)
        const commentRes = await db.execute({
          sql: "SELECT c.userUid, c.imageId, i.uploaderUid FROM comments c LEFT JOIN images i ON c.imageId = i.id WHERE c.id = ?",
          args: [commentId]
        });
        if (commentRes.rows.length === 0) {
          return Response.json({ success: false, error: "Comment not found." }, { status: 404, headers: corsHeaders });
        }

        const commentOwner = commentRes.rows[0].userUid;
        const postOwner = commentRes.rows[0].uploaderUid;
        const imageId = commentRes.rows[0].imageId;

        if (commentOwner !== userUid && postOwner !== userUid) {
          return Response.json({ success: false, error: "Unauthorized to delete this comment." }, { status: 403, headers: corsHeaders });
        }

        // Count how many comments being removed (this comment + child replies)
        const countRes = await db.execute({
          sql: "SELECT COUNT(*) as cnt FROM comments WHERE id = ? OR parentId = ?",
          args: [commentId, commentId]
        });
        const removedCount = parseInt(countRes.rows[0]?.cnt || 1);

        // Delete child replies and comment likes
        await db.execute({ sql: "DELETE FROM comment_likes WHERE commentId = ? OR commentId IN (SELECT id FROM comments WHERE parentId = ?)", args: [commentId, commentId] });
        await db.execute({ sql: "DELETE FROM comments WHERE id = ? OR parentId = ?", args: [commentId, commentId] });

        // Decrement image commentCount
        await db.execute({
          sql: "UPDATE images SET commentCount = max(0, commentCount - ?) WHERE id = ?",
          args: [removedCount, imageId]
        });

        return Response.json({ success: true, removedCount }, { status: 200, headers: corsHeaders });
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
