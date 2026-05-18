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

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    // --- GET Method: Fetch notifications ---
    if (req.method === 'GET') {
      const { userId } = req.query;

      if (!userId) {
        return res.status(400).json({ success: false, error: "Missing userId parameter." });
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

      return res.status(200).json({ success: true, notifications });
    }

    // --- POST Method: Mark notifications as read ---
    if (req.method === 'POST') {
      const { notificationIds } = req.body;

      if (!notificationIds || !Array.isArray(notificationIds) || notificationIds.length === 0) {
        return res.status(200).json({ success: true });
      }

      // Execute batch statements in Turso
      const statements = notificationIds.map(id => ({
        sql: "UPDATE notifications SET read = 1 WHERE id = ?",
        args: [id]
      }));

      await db.batch(statements);

      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ success: false, error: "Method not allowed." });

  } catch (error) {
    console.error("API Notifications DB Error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
