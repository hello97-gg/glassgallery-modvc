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

    // --- GET Method: Fetch notifications ---
    if (request.method === 'GET') {
      const url = new URL(request.url);
      const userId = url.searchParams.get('userId');

      if (!userId) {
        return Response.json({ success: false, error: "Missing userId parameter." }, { status: 400, headers: corsHeaders });
      }

      const result = await db.execute({
        sql: "SELECT * FROM notifications WHERE recipientUid = ? ORDER BY createdAt DESC LIMIT 30",
        args: [userId]
      });

      const notifications = result.rows.map(row => ({
        id: row.id,
        recipientUid: row.recipientUid,
        actorUid: row.actorUid,
        actorName: row.actorName,
        actorPhotoURL: row.actorPhotoURL || '',
        type: row.type,
        imageId: row.imageId,
        imageUrl: row.imageUrl,
        createdAt: row.createdAt,
        read: Boolean(row.read === 1 || row.read === true)
      }));

      return Response.json({ success: true, notifications }, { status: 200, headers: corsHeaders });
    }

    // --- POST Method: Mark notifications as read ---
    if (request.method === 'POST') {
      let body;
      try {
        body = await request.json();
      } catch (err) {
        return Response.json({ success: false, error: "Invalid JSON body" }, { status: 400, headers: corsHeaders });
      }
      
      const { notificationIds } = body;

      if (!notificationIds || !Array.isArray(notificationIds) || notificationIds.length === 0) {
        return Response.json({ success: true }, { status: 200, headers: corsHeaders });
      }

      // Execute batch statements in Turso
      const statements = notificationIds.map(id => ({
        sql: "UPDATE notifications SET read = 1 WHERE id = ?",
        args: [id]
      }));

      await db.batch(statements);

      return Response.json({ success: true }, { status: 200, headers: corsHeaders });
    }

    return Response.json({ success: false, error: "Method not allowed." }, { status: 405, headers: corsHeaders });

  } catch (error) {
    console.error("API Notifications DB Error:", error);
    return Response.json({ success: false, error: error.message }, { status: 500, headers: corsHeaders });
  }
}
