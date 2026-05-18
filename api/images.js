import { db } from "./lib/turso.js";
import fs from "fs";
import path from "path";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

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
    // --- GET Method: Fetch all images or suggestions ---
    if (req.method === 'GET') {
      const { action, uploaderUid, imageId, userUid } = req.query;

      if (action === 'get_single') {
        const targetId = imageId || req.query.id;
        if (!targetId) {
          return res.status(400).json({ success: false, error: "Missing imageId or id parameter." });
        }

        const targetRes = await db.execute({
          sql: "SELECT * FROM images WHERE id = ?",
          args: [targetId]
        });

        if (targetRes.rows.length === 0) {
          return res.status(404).json({ success: false, error: "Image not found." });
        }

        const row = targetRes.rows[0];
        const likesRes = await db.execute({
          sql: "SELECT userUid FROM likes WHERE imageId = ?",
          args: [targetId]
        });
        const likedBy = likesRes.rows.map(r => r.userUid);

        const image = {
          id: row.id,
          imageUrl: row.imageUrl,
          uploaderUid: row.uploaderUid,
          uploaderName: row.uploaderName,
          uploaderPhotoURL: row.uploaderPhotoURL || '',
          authorName: row.uploaderName,
          title: row.title || '',
          description: row.description || '',
          license: row.license || 'CC0',
          licenseUrl: row.licenseUrl || '',
          originalWorkUrl: row.originalWorkUrl || '',
          uploadedAt: row.uploadedAt,
          location: row.location || '',
          likeCount: parseInt(row.likeCount || 0),
          downloadCount: parseInt(row.downloadCount || 0),
          flags: row.flags ? JSON.parse(row.flags) : [],
          tags: row.flags ? JSON.parse(row.flags) : [],
          aiConcepts: row.aiConcepts ? JSON.parse(row.aiConcepts) : [],
          likedBy: likedBy
        };

        return res.status(200).json({ success: true, image });
      }

      if (action === 'suggestions') {
        if (!imageId) {
          return res.status(400).json({ success: false, error: "Missing imageId parameter." });
        }

        // 1. Fetch the target image
        const targetRes = await db.execute({
          sql: "SELECT * FROM images WHERE id = ?",
          args: [imageId]
        });

        if (targetRes.rows.length === 0) {
          return res.status(404).json({ success: false, error: "Target image not found." });
        }

        const target = targetRes.rows[0];
        let targetFlags = target.flags ? JSON.parse(target.flags) : [];
        let targetConcepts = target.aiConcepts ? JSON.parse(target.aiConcepts) : [];

        // 2. Cold-Start/Past image: Auto-generate visual concepts if empty (IN BACKGROUND)
        if (targetConcepts.length === 0 && !targetFlags.includes("Flagged")) {
          console.log(`[Smart Suggestions] Triggering background AI concepts generation for past upload: ${imageId}...`);
          checkContentSafety(
            target.title,
            target.description,
            target.location,
            target.imageUrl,
            imageId
          ).then(async (safetyRes) => {
            if (safetyRes.isUnsafe) {
              const updatedFlags = [...new Set([...targetFlags, "Flagged"])];
              await db.execute({
                sql: "UPDATE images SET flags = ? WHERE id = ?",
                args: [JSON.stringify(updatedFlags), imageId]
              });
            } else {
              const concepts = safetyRes.aiConcepts || [];
              await db.execute({
                sql: "UPDATE images SET aiConcepts = ? WHERE id = ?",
                args: [JSON.stringify(concepts), imageId]
              });
              console.log(`[Smart Suggestions] Cached ${concepts.length} AI concepts for past upload: ${imageId} in background!`);
            }
          }).catch(err => {
            console.error("[Smart Suggestions] Background content safety / concepts generation failed:", err);
          });
        }


        // 3. Fetch all other images
        const allImagesRes = await db.execute({
          sql: "SELECT * FROM images WHERE id != ? ORDER BY uploadedAt DESC",
          args: [imageId]
        });
        const likesRes = await db.execute("SELECT * FROM likes");

        // Group likes by imageId
        const likesMap = {};
        likesRes.rows.forEach(like => {
          const imgId = like.imageId;
          const uUid = like.userUid;
          if (!likesMap[imgId]) likesMap[imgId] = [];
          likesMap[imgId].push(uUid);
        });

        // 4. Construct Dynamic User Taste Vector if userUid provided
        const tasteProfile = {};
        if (userUid) {
          try {
            // Uploads history (weight = 1.5)
            const userUploads = await db.execute({
              sql: "SELECT flags, aiConcepts FROM images WHERE uploaderUid = ?",
              args: [userUid]
            });
            userUploads.rows.forEach(row => {
              const fl = row.flags ? JSON.parse(row.flags) : [];
              const co = row.aiConcepts ? JSON.parse(row.aiConcepts) : [];
              fl.forEach(f => { tasteProfile[f] = (tasteProfile[f] || 0) + 1.5; });
              co.forEach(c => { tasteProfile[c] = (tasteProfile[c] || 0) + 1.5; });
            });

            // Likes history (weight = 1.0)
            const userLikes = await db.execute({
              sql: "SELECT i.flags, i.aiConcepts FROM likes l JOIN images i ON l.imageId = i.id WHERE l.userUid = ?",
              args: [userUid]
            });
            userLikes.rows.forEach(row => {
              const fl = row.flags ? JSON.parse(row.flags) : [];
              const co = row.aiConcepts ? JSON.parse(row.aiConcepts) : [];
              fl.forEach(f => { tasteProfile[f] = (tasteProfile[f] || 0) + 1.0; });
              co.forEach(c => { tasteProfile[c] = (tasteProfile[c] || 0) + 1.0; });
            });

            // Views history (weight = 0.5)
            const userViews = await db.execute({
              sql: "SELECT i.flags, i.aiConcepts FROM views v JOIN images i ON v.imageId = i.id WHERE v.userUid = ?",
              args: [userUid]
            });
            userViews.rows.forEach(row => {
              const fl = row.flags ? JSON.parse(row.flags) : [];
              const co = row.aiConcepts ? JSON.parse(row.aiConcepts) : [];
              fl.forEach(f => { tasteProfile[f] = (tasteProfile[f] || 0) + 0.5; });
              co.forEach(c => { tasteProfile[c] = (tasteProfile[c] || 0) + 0.5; });
            });
          } catch (err) {
            console.error("[Smart Suggestions] Failed to build Taste Vector:", err);
          }
        }

        // 5. Score candidate images
        const scoredImages = allImagesRes.rows.map(row => {
          const id = row.id;
          const fl = row.flags ? JSON.parse(row.flags) : [];
          const co = row.aiConcepts ? JSON.parse(row.aiConcepts) : [];

          // AI Concept Overlap (Weight = 4)
          let conceptOverlap = 0;
          co.forEach(c => {
            if (targetConcepts.includes(c)) conceptOverlap++;
          });

          // Tag Overlap (Weight = 3)
          let tagOverlap = 0;
          fl.forEach(f => {
            if (targetFlags.includes(f)) tagOverlap++;
          });

          // Title / Description / Location metadata match (Weight = 3)
          let metadataMatch = 0;
          const targetText = `${target.title || ''} ${target.description || ''} ${target.location || ''}`.toLowerCase();
          const candidateText = `${row.title || ''} ${row.description || ''} ${row.location || ''}`.toLowerCase();
          
          // Check for token matches
          const tokens = targetText.split(/\s+/).filter(t => t.length > 3);
          tokens.forEach(tok => {
            if (candidateText.includes(tok)) metadataMatch += 0.5;
          });

          // User Taste Alignment (Weight = 2)
          let tasteScore = 0;
          fl.forEach(f => {
            if (tasteProfile[f]) tasteScore += tasteProfile[f];
          });
          co.forEach(c => {
            if (tasteProfile[c]) tasteScore += tasteProfile[c];
          });

          // Popularity (Weight = 0.1)
          const popularity = (row.likeCount || 0) * 0.1 + (row.downloadCount || 0) * 0.05;

          const totalScore = (conceptOverlap * 4.0) + (tagOverlap * 3.0) + (metadataMatch * 3.0) + (tasteScore * 2.0) + popularity;

          return {
            image: {
              id: row.id,
              imageUrl: row.imageUrl,
              uploaderUid: row.uploaderUid,
              uploaderName: row.uploaderName,
              uploaderPhotoURL: row.uploaderPhotoURL || '',
              title: row.title || '',
              description: row.description || '',
              license: row.license,
              licenseUrl: row.licenseUrl || '',
              originalWorkUrl: row.originalWorkUrl || '',
              uploadedAt: row.uploadedAt,
              location: row.location || '',
              likeCount: parseInt(row.likeCount || 0),
              downloadCount: parseInt(row.downloadCount || 0),
              flags: fl,
              aiConcepts: co,
              likedBy: likesMap[id] || [],
            },
            score: totalScore
          };
        });

        // Sort by score DESC
        scoredImages.sort((a, b) => b.score - a.score);

        // Map back and slice to top 12
        const suggestions = scoredImages.map(item => item.image).slice(0, 12);

        return res.status(200).json({ success: true, images: suggestions });
      }

      let imagesQuery = "SELECT * FROM images ORDER BY uploadedAt DESC";
      let imagesArgs = [];

      if (uploaderUid) {
        imagesQuery = "SELECT * FROM images WHERE uploaderUid = ? ORDER BY uploadedAt DESC";
        imagesArgs = [uploaderUid];
      }

      const imagesRes = await db.execute({ sql: imagesQuery, args: imagesArgs });
      const likesRes = await db.execute("SELECT * FROM likes");

      // Group likes by imageId
      const likesMap = {};
      likesRes.rows.forEach(like => {
        const imgId = like.imageId;
        const userUid = like.userUid;
        if (!likesMap[imgId]) {
          likesMap[imgId] = [];
        }
        likesMap[imgId].push(userUid);
      });

      const images = imagesRes.rows.map(row => {
        const id = row.id;
        return {
          id: row.id,
          imageUrl: row.imageUrl,
          uploaderUid: row.uploaderUid,
          uploaderName: row.uploaderName,
          uploaderPhotoURL: row.uploaderPhotoURL || '',
          title: row.title || '',
          description: row.description || '',
          license: row.license,
          licenseUrl: row.licenseUrl || '',
          originalWorkUrl: row.originalWorkUrl || '',
          uploadedAt: row.uploadedAt,
          location: row.location || '',
          likeCount: parseInt(row.likeCount || 0),
          downloadCount: parseInt(row.downloadCount || 0),
          flags: row.flags ? JSON.parse(row.flags) : [],
          aiConcepts: row.aiConcepts ? JSON.parse(row.aiConcepts) : [],
          likedBy: likesMap[id] || [],
        };
      });

      return res.status(200).json({ success: true, images });
    }

    // --- POST Method: Upload, Edit, Like, Download, Delete ---
    if (req.method === 'POST') {
      const { action } = req.query;

      if (!action) {
        return res.status(400).json({ success: false, error: "Missing action parameter." });
      }

      // Action: AI auto-tags and auto-fill details extraction
      if (action === 'auto_tags') {
        const { image } = req.body;
        if (!image) {
          return res.status(400).json({ success: false, error: "Missing required 'image' field (base64 data URL)." });
        }

        let mistralKey = process.env.MISTRAL_API_KEY;
        if (!mistralKey) {
          // Manually load from .env file
          try {
            const envPath = path.resolve(".env");
            if (fs.existsSync(envPath)) {
              const envFile = fs.readFileSync(envPath, 'utf-8');
              envFile.split(/\r?\n/).forEach(line => {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith('#')) return;
                const index = trimmed.indexOf('=');
                if (index > 0) {
                  const key = trimmed.substring(0, index).trim();
                  const value = trimmed.substring(index + 1).trim();
                  if (key === 'MISTRAL_API_KEY') {
                    mistralKey = value;
                  }
                }
              });
            }
          } catch (envErr) {
            console.error("[Auto-Tags] Error reading .env:", envErr);
          }
        }

        if (!mistralKey) {
          return res.status(500).json({ success: false, error: "MISTRAL_API_KEY is not defined on the server." });
        }

        const invokeUrl = "https://api.mistral.ai/v1/chat/completions";
        const payload = {
          model: "pixtral-12b-2409",
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `Task: Analyze the provided image to suggest tags, title, description, and location to help a photographer fill out their photo upload form.
                  
Available tags in our app: "Natural", "Monochrome", "Street", "Landscape", "Architecture", "Abstract", "Urban", "Creative", "Night", "Macro", "Minimalist", "Portrait", "Travel".

Select 1 to 5 tags from the available tags list that perfectly describe the image.

Suggest a beautiful, highly premium title, a professional short description (1-2 sentences max), and a plausible city/country location if identifiable from the image.

Return the response strictly as a JSON object with this exact format:
{
  "tags": ["Tag1", "Tag2"], // must match available tags list exactly (case-sensitive)
  "title": "Beautiful suggested title",
  "description": "Short description of the photo.",
  "location": "City, Country" // leave empty if not identifiable
}`
                },
                {
                  type: "image_url",
                  image_url: {
                    url: image
                  }
                }
              ]
            }
          ],
          response_format: { type: "json_object" },
          max_tokens: 350,
          temperature: 0.2
        };

        const apiRes = await fetch(invokeUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${mistralKey}`
          },
          body: JSON.stringify(payload)
        });

        if (!apiRes.ok) {
          const errMsg = await apiRes.text();
          throw new Error(`Mistral API request failed: ${errMsg}`);
        }

        const resData = await apiRes.json();
        const content = resData.choices[0].message.content;
        const parsed = JSON.parse(content);

        return res.status(200).json({
          success: true,
          tags: parsed.tags || [],
          title: parsed.title || '',
          description: parsed.description || '',
          location: parsed.location || ''
        });
      }

      // Action: Direct API key-authorized image upload
      if (action === 'api_upload') {
        // 1. Authenticate using API Key
        let authHeader = req.headers.authorization || req.headers['x-api-key'];
        if (!authHeader) {
          return res.status(401).json({ success: false, error: "Missing API Key in Authorization header or x-api-key header." });
        }
        
        let apiKeyInput = authHeader.replace(/^Bearer\s+/i, '').trim();
        
        const userRes = await db.execute({
          sql: "SELECT * FROM users WHERE apiKey = ?",
          args: [apiKeyInput]
        });

        if (userRes.rows.length === 0) {
          return res.status(401).json({ success: false, error: "Invalid API key." });
        }

        const userRow = userRes.rows[0];
        const uploaderUid = userRow.uploaderUid;
        const uploaderName = userRow.uploaderName;
        const uploaderPhotoURL = userRow.uploaderPhotoURL;

        // 2. Validate payload fields
        const {
          image, // Base64 string OR image URL
          title,
          description,
          license,
          licenseUrl,
          tags, // Array of strings (optional)
          originalWorkUrl,
          location
        } = req.body;

        if (!image) {
          return res.status(400).json({ success: false, error: "Missing required 'image' field in JSON body (base64 string or public image URL)." });
        }

        // 3. Process base64 or download from URL
        let buffer;
        
        if (image.startsWith('http://') || image.startsWith('https://')) {
          try {
            const fetchRes = await fetch(image);
            const arrayBuffer = await fetchRes.arrayBuffer();
            buffer = Buffer.from(arrayBuffer);
          } catch (err) {
            return res.status(400).json({ success: false, error: `Failed to download image from URL: ${err.message}` });
          }
        } else {
          try {
            const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
            buffer = Buffer.from(base64Data, "base64");
          } catch (err) {
            return res.status(400).json({ success: false, error: "Failed to parse Base64 image data." });
          }
        }

        // 4. Compress the image using sharp
        const sharp = (await import('sharp')).default;
        const imageObj = sharp(buffer);
        const metadata = await imageObj.metadata();

        const MAX_WIDTH = 1920;
        const ONE_MB = 1024 * 1024;

        if (metadata.width > MAX_WIDTH || buffer.length > ONE_MB) {
          buffer = await imageObj
            .resize({ width: MAX_WIDTH, withoutEnlargement: true })
            .webp({ quality: 80 })
            .toBuffer();
        }

        const processedMeta = await sharp(buffer).metadata();
        const contentType = `image/${processedMeta.format}`;
        const extension = processedMeta.format === 'jpeg' ? 'jpg' : processedMeta.format;
        
        // 5. Upload to Cloudflare R2
        const R2_ACCOUNT_ID = "d8e8828f54e7dac7c17e397d1998f745";
        const R2_BUCKET = process.env.R2_BUCKET_NAME || "glassgallery";
        const publicDomain = process.env.R2_PUBLIC_DOMAIN;
        if (!publicDomain) {
          throw new Error("Server Misconfiguration: R2_PUBLIC_DOMAIN environment variable is missing.");
        }

        const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
        const S3 = new S3Client({
          region: "auto",
          endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
          credentials: {
            accessKeyId: process.env.R2_ACCESS_KEY_ID,
            secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
          },
        });

        const uniqueFileName = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${extension}`;
        
        await S3.send(new PutObjectCommand({
          Bucket: R2_BUCKET,
          Key: uniqueFileName,
          Body: buffer,
          ContentType: contentType,
        }));

        const domain = publicDomain.endsWith('/') ? publicDomain.slice(0, -1) : publicDomain;
        const imageUrl = `${domain}/${uniqueFileName}`;

        // 6. Evaluate image safety and generate smart concepts
        const id = 'img_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        let updatedFlags = tags || [];
        let isUnsafe = false;
        let aiConceptsArr = [];

        try {
          const safetyRes = await checkContentSafety(title || '', description || '', location || '', imageUrl, id);
          isUnsafe = safetyRes.isUnsafe;
          aiConceptsArr = safetyRes.aiConcepts || [];
        } catch (err) {
          console.error("[API Upload Content Safety] Moderation failed:", err);
        }

        if (isUnsafe && !updatedFlags.includes("Flagged")) {
          updatedFlags.push("Flagged");
        }

        const uploadedAt = new Date().toISOString();

        // 7. Write to Turso images table
        await db.execute({
          sql: `INSERT INTO images (
            id, imageUrl, uploaderUid, uploaderName, uploaderPhotoURL,
            title, description, license, licenseUrl, flags, originalWorkUrl,
            uploadedAt, likeCount, downloadCount, location, aiConcepts
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)`,
          args: [
            id, imageUrl, uploaderUid, uploaderName || 'Anonymous', uploaderPhotoURL || '',
            title || '', description || '', license || 'CC0', licenseUrl || '',
            JSON.stringify(updatedFlags), originalWorkUrl || '', uploadedAt, location || '',
            JSON.stringify(aiConceptsArr)
          ]
        });

        // 8. Add warning notification if unsafe
        if (isUnsafe) {
          const notifId = 'notif_' + Math.random().toString(36).substring(2, 15);
          await db.execute({
            sql: `INSERT INTO notifications (id, recipientUid, actorUid, actorName, actorPhotoURL, type, imageId, imageUrl, createdAt, read)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
            args: [notifId, uploaderUid, 'system', 'System Moderator', '', 'flagged', id, imageUrl, uploadedAt]
          }).catch(err => console.error("[Content Safety] Notification failed:", err));
        }

        return res.status(200).json({
          success: true,
          imageId: id,
          imageUrl,
          flagged: isUnsafe,
          aiConcepts: aiConceptsArr
        });
      }

      // Action: Add/Upload image
      if (action === 'upload') {
        const {
          id,
          imageUrl,
          uploaderUid,
          uploaderName,
          uploaderPhotoURL,
          title,
          description,
          license,
          licenseUrl,
          flags,
          originalWorkUrl,
          location,
        } = req.body;

        if (!id || !imageUrl || !uploaderUid) {
          return res.status(400).json({ success: false, error: "Missing required fields." });
        }



        // 1. Evaluate image safety and generate smart concepts before database insert
        let updatedFlags = flags || [];
        let isUnsafe = false;
        let aiConceptsArr = [];
        try {
          const safetyRes = await checkContentSafety(title, description, location, imageUrl, id);
          isUnsafe = safetyRes.isUnsafe;
          aiConceptsArr = safetyRes.aiConcepts || [];
        } catch (err) {
          console.error("[Content Safety] Moderation & Auto-Categorization failed during upload:", err);
        }

        if (isUnsafe) {
          console.log(`[Content Safety] Image ${id} is UNSAFE. Pre-flagging record...`);
          if (!updatedFlags.includes("Flagged")) {
            updatedFlags.push("Flagged");
          }
        }

        const uploadedAt = new Date().toISOString();

        // 2. Perform DB Insertion with pre-moderated state and cached AI concepts!
        await db.execute({
          sql: `INSERT INTO images (
            id, imageUrl, uploaderUid, uploaderName, uploaderPhotoURL,
            title, description, license, licenseUrl, flags, originalWorkUrl,
            uploadedAt, likeCount, downloadCount, location, aiConcepts
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)`,
          args: [
            id, imageUrl, uploaderUid, uploaderName || 'Anonymous', uploaderPhotoURL || '',
            title || '', description || '', license || 'CC0', licenseUrl || '',
            JSON.stringify(updatedFlags), originalWorkUrl || '', uploadedAt, location || '',
            JSON.stringify(aiConceptsArr)
          ]
        });

        // 3. Send warning notification asynchronously if flagged
        if (isUnsafe) {
          const notifId = 'notif_' + Math.random().toString(36).substring(2, 15);
          await db.execute({
            sql: `INSERT INTO notifications (id, recipientUid, actorUid, actorName, actorPhotoURL, type, imageId, imageUrl, createdAt, read)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
            args: [notifId, uploaderUid, 'system', 'System Moderator', '', 'flagged', id, imageUrl, uploadedAt]
          }).catch(err => console.error("[Content Safety] Notification insert failed:", err));
        }

        return res.status(200).json({ success: true, flagged: isUnsafe });
      }

      // Action: Update image details
      if (action === 'update') {
        const { imageId, updates } = req.body;

        if (!imageId || !updates) {
          return res.status(400).json({ success: false, error: "Missing imageId or updates." });
        }

        // Dynamically build update query
        const allowedUpdates = ['title', 'description', 'license', 'licenseUrl', 'originalWorkUrl', 'location', 'flags'];
        const updateKeys = [];
        const updateArgs = [];

        Object.keys(updates).forEach(key => {
          if (allowedUpdates.includes(key)) {
            updateKeys.push(`${key} = ?`);
            if (key === 'flags') {
              updateArgs.push(JSON.stringify(updates[key]));
            } else {
              updateArgs.push(updates[key]);
            }
          }
        });

        if (updateKeys.length === 0) {
          return res.status(400).json({ success: false, error: "No valid update fields provided." });
        }

        updateArgs.push(imageId);

        await db.execute({
          sql: `UPDATE images SET ${updateKeys.join(', ')} WHERE id = ?`,
          args: updateArgs
        });

        return res.status(200).json({ success: true });
      }

      // Action: Delete image
      if (action === 'delete') {
        const { imageId } = req.body;

        if (!imageId) {
          return res.status(400).json({ success: false, error: "Missing imageId." });
        }

        await db.execute({
          sql: "DELETE FROM images WHERE id = ?",
          args: [imageId]
        });

        return res.status(200).json({ success: true });
      }

      // Action: Increment download count
      if (action === 'download') {
        const { imageId } = req.body;

        if (!imageId) {
          return res.status(400).json({ success: false, error: "Missing imageId." });
        }

        await db.execute({
          sql: "UPDATE images SET downloadCount = downloadCount + 1 WHERE id = ?",
          args: [imageId]
        });

        return res.status(200).json({ success: true });
      }

      // Action: Toggle like
      if (action === 'like') {
        const { imageId, userUid, userName, userPhotoURL } = req.body;

        if (!imageId || !userUid) {
          return res.status(400).json({ success: false, error: "Missing imageId or userUid." });
        }

        // Start transaction or do atomic operations
        // 1. Check if user already liked
        const checkLike = await db.execute({
          sql: "SELECT 1 FROM likes WHERE imageId = ? AND userUid = ?",
          args: [imageId, userUid]
        });

        const hasLiked = checkLike.rows.length > 0;
        let wasLike = false;

        if (hasLiked) {
          // Unlike
          await db.execute({
            sql: "DELETE FROM likes WHERE imageId = ? AND userUid = ?",
            args: [imageId, userUid]
          });
        } else {
          // Like
          await db.execute({
            sql: "INSERT INTO likes (imageId, userUid) VALUES (?, ?)",
            args: [imageId, userUid]
          });
          wasLike = true;
        }

        // 2. Update likeCount on the image doc
        const newCountRes = await db.execute({
          sql: "SELECT COUNT(*) as count FROM likes WHERE imageId = ?",
          args: [imageId]
        });
        const newCount = parseInt(newCountRes.rows[0].count);

        await db.execute({
          sql: "UPDATE images SET likeCount = ? WHERE id = ?",
          args: [newCount, imageId]
        });

        // 3. Create Notification if it's a new like and not self-like
        if (wasLike) {
          const imgMetaRes = await db.execute({
            sql: "SELECT uploaderUid, imageUrl FROM images WHERE id = ?",
            args: [imageId]
          });

          if (imgMetaRes.rows.length > 0) {
            const uploaderUid = imgMetaRes.rows[0].uploaderUid;
            const imageUrl = imgMetaRes.rows[0].imageUrl;

            if (uploaderUid && uploaderUid !== userUid) {
              const notifId = 'notif_' + Math.random().toString(36).substring(2, 15);
              const createdAt = new Date().toISOString();

              await db.execute({
                sql: `INSERT INTO notifications (id, recipientUid, actorUid, actorName, actorPhotoURL, type, imageId, imageUrl, createdAt, read)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
                args: [notifId, uploaderUid, userUid, userName || 'Someone', userPhotoURL || '', 'like', imageId, imageUrl, createdAt]
              });
            }
          }
        }

        return res.status(200).json({ success: true, hasLiked: !hasLiked });
      }

      // Action: Register user view/click
      if (action === 'view') {
        const { imageId, userUid } = req.body;

        if (!imageId || !userUid) {
          return res.status(400).json({ success: false, error: "Missing imageId or userUid." });
        }

        const viewedAt = new Date().toISOString();

        await db.execute({
          sql: "INSERT OR REPLACE INTO views (userUid, imageId, viewedAt) VALUES (?, ?, ?)",
          args: [userUid, imageId, viewedAt]
        });

        return res.status(200).json({ success: true });
      }

      return res.status(400).json({ success: false, error: `Invalid action: ${action}` });
    }

    return res.status(405).json({ success: false, error: "Method not allowed." });

  } catch (error) {
    console.error("API DB Error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
}

// Mistral AI Content Safety Moderation Helper (returns true if unsafe, false if safe)
// Mistral AI Content Safety Moderation and Smart Concept Generator Helper
// Returns { isUnsafe: boolean, aiConcepts: string[] }
async function checkContentSafety(title, description, location, imageUrl, imageId) {
  try {
    let mistralKey = process.env.MISTRAL_API_KEY;
    if (!mistralKey) {
      // Manually load from .env file to support dev hot-reloads without server restart
      try {
        const envPath = path.resolve(".env");
        if (fs.existsSync(envPath)) {
          const envFile = fs.readFileSync(envPath, 'utf-8');
          envFile.split(/\r?\n/).forEach(line => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) return;
            const index = trimmed.indexOf('=');
            if (index > 0) {
              const key = trimmed.substring(0, index).trim();
              const value = trimmed.substring(index + 1).trim();
              if (key === 'MISTRAL_API_KEY') {
                mistralKey = value;
              }
            }
          });
        }
      } catch (envErr) {
        console.error("[Content Safety] Error reading .env file manually:", envErr.message);
      }
    }

    if (!mistralKey) {
      console.warn("[Content Safety] MISTRAL_API_KEY is not defined. Skipping safety moderation.");
      return { isUnsafe: false, aiConcepts: [] };
    }

    // Wait for CDN propagation before calling Mistral (important for custom domains/R2/Catbox lag)
    let propagated = false;
    let urlAttempt = 0;
    while (urlAttempt < 6) {
      try {
        const checkRes = await fetch(imageUrl);
        if (checkRes.ok) {
          propagated = true;
          break;
        }
      } catch (e) {}
      console.log(`[Content Safety] CDN not yet propagated for ${imageUrl}. Waiting 1.5s (attempt ${urlAttempt + 1})...`);
      await new Promise(resolve => setTimeout(resolve, 1500));
      urlAttempt++;
    }

    if (!propagated) {
      console.warn(`[Content Safety] Image URL ${imageUrl} was not reachable after propagation checks. Proceeding with Mistral anyway.`);
    }

    const invokeUrl = "https://api.mistral.ai/v1/chat/completions";

    // Multimodal payload supporting both image evaluation and text details
    const payload = {
      model: "pixtral-12b-2409",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Task: Analyze the uploaded image and its metadata details to:
1. Evaluate safety: Check if there is unsafe content based on the Safety Policy Categories (S1-S6). Intimate anatomy or medical/disease raw graphics of intimate areas MUST be rated as 'unsafe'. Provide a rating of either 'safe' or 'unsafe'.
2. Generate concepts: If safe, generate 5 descriptive, high-quality aesthetic keyword/concept tags representing its style, subject, mood, color tone, or theme (e.g. "warm fireplace glow", "cyberpunk alleyway", "minimalist architecture", "retro setup").

Metadata:
Title: ${title || "Untitled"}
Description: ${description || "No description"}
Location: ${location || "No location"}

Safety Policy Categories:
S1: Violence
S2: Sexual/Explicit/Nudity (IMPORTANT: intimate anatomy or medical/disease raw graphics of intimate body areas must be flagged as 'unsafe' for our family-safe public gallery).
S3: Criminal Planning/Illegal activity
S4: Suicide and Self Harm
S5: Hate Speech / Identity Hate
S6: Harassment / Profanity

Return the response strictly as a JSON object with this exact format:
{
  "safety": "safe" or "unsafe",
  "reason": "explanation of safety violation if unsafe, or clean if safe",
  "keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"]
}`
            },
            {
              type: "image_url",
              image_url: {
                url: imageUrl
              }
            }
          ]
        }
      ],
      response_format: { type: "json_object" },
      max_tokens: 512,
      temperature: 0.20,
      top_p: 0.70
    };

    console.log(`[Content Safety] Dispatching unified Mistral check for image: ${imageId} (URL: ${imageUrl})`);

    let attempt = 0;
    const maxAttempts = 3;
    let delay = 2000;
    let response;

    while (attempt < maxAttempts) {
      try {
        response = await fetch(invokeUrl, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${mistralKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        });

        if (response.status === 429) {
          console.warn(`[Content Safety] Rate limit (429) hit on attempt ${attempt + 1}. Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          attempt++;
          delay *= 2.5;
          continue;
        }

        break;
      } catch (fetchErr) {
        console.error(`[Content Safety] Fetch network error on attempt ${attempt + 1}:`, fetchErr);
        attempt++;
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2.5;
      }
    }

    if (!response || !response.ok) {
      const errText = response ? await response.text() : "No response";
      console.error(`[Content Safety] Safety check failed after ${attempt} attempts. Status: ${response?.status}. Error:`, errText);
      return { isUnsafe: false, aiConcepts: [] };
    }

    const data = await response.json();
    const resultText = data.choices?.[0]?.message?.content || "{}";
    console.log(`[Content Safety] Unified moderation and suggestion response for ${imageId}: ${resultText}`);

    let isUnsafe = false;
    let aiConcepts = [];
    try {
      const parsed = JSON.parse(resultText);
      isUnsafe = parsed.safety === "unsafe";
      aiConcepts = parsed.keywords || [];
    } catch (e) {
      const normalizedText = resultText.toLowerCase();
      isUnsafe = normalizedText.includes("unsafe");
      const match = resultText.match(/\[.*?\]/s);
      if (match) {
        try {
          aiConcepts = JSON.parse(match[0]);
        } catch (je) {}
      }
    }

    return { isUnsafe, aiConcepts };

  } catch (error) {
    console.error("[Content Safety] Critical error during multimodal safety moderation:", error);
    return { isUnsafe: false, aiConcepts: [] };
  }
}
