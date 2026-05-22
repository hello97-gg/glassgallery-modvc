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

    // --- GET Method: Fetch User Profile ---
    if (request.method === 'GET') {
      const url = new URL(request.url);
      const uid = url.searchParams.get('uid');
      const includeApiKey = url.searchParams.get('includeApiKey');

      if (!uid) {
        return Response.json({ success: false, error: "Missing uid parameter." }, { status: 400, headers: corsHeaders });
      }

      const result = await db.execute({
        sql: "SELECT * FROM users WHERE uploaderUid = ?",
        args: [uid]
      });

      if (result.rows.length === 0) {
        return Response.json({ success: true, user: null }, { status: 200, headers: corsHeaders });
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
        onboarded: parseInt(row.onboarded || 0) === 1,
        isVerified: parseInt(row.isVerified || 0) === 1,
        followedTags: row.followedTags ? JSON.parse(row.followedTags) : [],
        ...(includeApiKey === 'true' ? { apiKey: row.apiKey || null } : {})
      };

      return Response.json({ success: true, user }, { status: 200, headers: corsHeaders });
    }

    // --- POST Method: Create / Update User Profile ---
    if (request.method === 'POST') {
      let body;
      try {
        body = await request.json();
      } catch (err) {
        return Response.json({ success: false, error: "Invalid JSON body" }, { status: 400, headers: corsHeaders });
      }
      
      const { uid, action, data } = body;

      if (action === 'generate_key') {
        if (!uid) {
          return Response.json({ success: false, error: "Missing uid parameter." }, { status: 400, headers: corsHeaders });
        }
        
        // Use Cloudflare Workers WebCrypto API instead of Node crypto
        const randomBytes = new Uint8Array(24);
        crypto.getRandomValues(randomBytes);
        const newApiKey = 'gg_' + Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('');
        
        await db.execute({
          sql: "UPDATE users SET apiKey = ? WHERE uploaderUid = ?",
          args: [newApiKey, uid]
        });
        return Response.json({ success: true, apiKey: newApiKey }, { status: 200, headers: corsHeaders });
      }

      if (!uid || !data) {
        return Response.json({ success: false, error: "Missing uid or profile data." }, { status: 400, headers: corsHeaders });
      }

      // Check existence
      const checkRes = await db.execute({
        sql: "SELECT 1 FROM users WHERE uploaderUid = ?",
        args: [uid]
      });

      if (checkRes.rows.length === 0) {
        // Insert new user
        await db.execute({
          sql: `INSERT INTO users (uploaderUid, uploaderName, uploaderPhotoURL, backgroundImageURL, location, email, bio, onboarded, followedTags, isVerified)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            uid,
            data.uploaderName || 'Anonymous',
            data.uploaderPhotoURL || '',
            data.backgroundImageURL || '',
            data.location || '',
            data.email || '',
            data.bio || '',
            data.onboarded ? 1 : 0,
            JSON.stringify(data.followedTags || []),
            data.isVerified ? 1 : 0
          ]
        });
      } else {
        // Update user with dynamic fields
        const fields = ['uploaderName', 'uploaderPhotoURL', 'backgroundImageURL', 'location', 'email', 'bio', 'onboarded', 'followedTags', 'isVerified'];
        const keys = [];
        const args = [];

        fields.forEach(f => {
          if (data[f] !== undefined) {
            keys.push(`${f} = ?`);
            if (f === 'onboarded' || f === 'isVerified') {
              args.push(data[f] ? 1 : 0);
            } else if (f === 'followedTags') {
              args.push(JSON.stringify(data[f] || []));
            } else {
              args.push(data[f]);
            }
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

      return Response.json({ success: true }, { status: 200, headers: corsHeaders });
    }

    return Response.json({ success: false, error: "Method not allowed." }, { status: 405, headers: corsHeaders });

  } catch (error) {
    console.error("API Users DB Error:", error);
    return Response.json({ success: false, error: error.message }, { status: 500, headers: corsHeaders });
  }
}
