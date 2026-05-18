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
    // --- GET Method: Fetch User Profile ---
    if (req.method === 'GET') {
      const { uid, includeApiKey } = req.query;

      if (!uid) {
        return res.status(400).json({ success: false, error: "Missing uid parameter." });
      }

      const result = await db.execute({
        sql: "SELECT * FROM users WHERE uploaderUid = ?",
        args: [uid]
      });

      if (result.rows.length === 0) {
        return res.status(200).json({ success: true, user: null });
      }

      const row = result.rows[0];
      const user = {
        uploaderUid: row.uploaderUid,
        uploaderName: row.uploaderName || '',
        uploaderPhotoURL: row.uploaderPhotoURL || '',
        backgroundImageURL: row.backgroundImageURL || '',
        location: row.location || '',
        email: row.email || '',
        bio: row.bio || '',
        ...(includeApiKey === 'true' ? { apiKey: row.apiKey || null } : {})
      };

      return res.status(200).json({ success: true, user });
    }

    // --- POST Method: Create / Update User Profile ---
    if (req.method === 'POST') {
      const { uid, action, data } = req.body;

      if (action === 'generate_key') {
        if (!uid) {
          return res.status(400).json({ success: false, error: "Missing uid parameter." });
        }
        const crypto = await import('crypto');
        const newApiKey = 'gg_' + crypto.randomBytes(24).toString('hex');
        await db.execute({
          sql: "UPDATE users SET apiKey = ? WHERE uploaderUid = ?",
          args: [newApiKey, uid]
        });
        return res.status(200).json({ success: true, apiKey: newApiKey });
      }

      if (!uid || !data) {
        return res.status(400).json({ success: false, error: "Missing uid or profile data." });
      }

      // Check existence
      const checkRes = await db.execute({
        sql: "SELECT 1 FROM users WHERE uploaderUid = ?",
        args: [uid]
      });

      if (checkRes.rows.length === 0) {
        // Insert new user
        await db.execute({
          sql: `INSERT INTO users (uploaderUid, uploaderName, uploaderPhotoURL, backgroundImageURL, location, email, bio)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
          args: [
            uid,
            data.uploaderName || 'Anonymous',
            data.uploaderPhotoURL || '',
            data.backgroundImageURL || '',
            data.location || '',
            data.email || '',
            data.bio || ''
          ]
        });
      } else {
        // Update user with dynamic fields to support merge updates
        const fields = ['uploaderName', 'uploaderPhotoURL', 'backgroundImageURL', 'location', 'email', 'bio'];
        const keys = [];
        const args = [];

        fields.forEach(f => {
          if (data[f] !== undefined) {
            keys.push(`${f} = ?`);
            args.push(data[f]);
          }
        });

        if (keys.length > 0) {
          args.push(uid);
          await db.execute({
            sql: `UPDATE users SET ${keys.join(', ')} WHERE uploaderUid = ?`,
            args
          });
        }
      }

      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ success: false, error: "Method not allowed." });

  } catch (error) {
    console.error("API Users DB Error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
