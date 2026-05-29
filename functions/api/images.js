import { getDb } from "./lib/turso.js";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { PhotonImage, resize, SamplingFilter } from "@cf-wasm/photon";

const corsHeaders = {
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
};

const cacheHeaders = {
  ...corsHeaders,
  'Cache-Control': 'public, max-age=15, s-maxage=60'
};

export async function onRequest(context) {
  const request = context.request;
  const env = context.env;

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const db = getDb(env);
    const url = new URL(request.url);

    // --- GET Method: Fetch all images or suggestions ---
    if (request.method === 'GET') {
      const action = url.searchParams.get('action');
      const uploaderUid = url.searchParams.get('uploaderUid');
      const rawImageId = url.searchParams.get('imageId') || url.searchParams.get('id');
      const imageId = rawImageId ? rawImageId.split('_loop_')[0] : null;
      const userUid = url.searchParams.get('userUid');

      if (action === 'download') {
        const targetId = imageId;
        if (!targetId) {
          return Response.json({ success: false, error: "Missing imageId or id parameter." }, { status: 400, headers: corsHeaders });
        }

        // 1. Check if image exists and fetch the CDN URL
        const targetRes = await db.execute({
          sql: "SELECT imageUrl FROM images WHERE id = ?",
          args: [targetId]
        });

        if (targetRes.rows.length === 0) {
          return Response.json({ success: false, error: "Image not found." }, { status: 404, headers: corsHeaders });
        }

        // 2. Increment download count only for valid images
        await db.execute({
          sql: "UPDATE images SET downloadCount = downloadCount + 1 WHERE id = ?",
          args: [targetId]
        });

        const imageUrl = targetRes.rows[0].imageUrl;
        // 3. Redirect the browser/client to the download file URL
        return Response.redirect(imageUrl, 302);
      }

      // --- Render/Embed: Let external websites embed images via <img src="..."> ---
      // Usage:
      //   By ID:       /api/images?action=render&imageId=img_xxx
      //   By category: /api/images?action=render&category=Landscape
      //   Random:      /api/images?action=render
      //   JSON info:   /api/images?action=render&imageId=img_xxx&format=json
      if (action === 'render') {
        const category = url.searchParams.get('category') || url.searchParams.get('tag');
        const format = url.searchParams.get('format'); // 'json' for metadata instead of redirect
        const embedHeaders = {
          ...corsHeaders,
          'Cache-Control': 'public, max-age=300, s-maxage=600', // Cache 5-10 min
        };

        let targetImage = null;

        if (imageId) {
          // Render specific image by ID
          const res = await db.execute({
            sql: "SELECT id, imageUrl, title, uploaderName, license, flags, likeCount, downloadCount FROM images WHERE id = ?",
            args: [imageId]
          });
          if (res.rows.length > 0) targetImage = res.rows[0];
        } else if (category) {
          // Render random image from a category/tag
          const res = await db.execute(
            "SELECT id, imageUrl, title, uploaderName, license, flags, likeCount, downloadCount FROM images ORDER BY uploadedAt DESC"
          );
          const matching = res.rows.filter(row => {
            try {
              const flags = row.flags ? JSON.parse(row.flags) : [];
              return flags.some(f => f.toLowerCase() === category.toLowerCase());
            } catch { return false; }
          });
          if (matching.length > 0) {
            targetImage = matching[Math.floor(Math.random() * matching.length)];
          }
        } else {
          // Render completely random image
          const res = await db.execute(
            "SELECT id, imageUrl, title, uploaderName, license, flags, likeCount, downloadCount FROM images ORDER BY RANDOM() LIMIT 1"
          );
          if (res.rows.length > 0) targetImage = res.rows[0];
        }

        if (!targetImage) {
          return Response.json({ success: false, error: "No image found." }, { status: 404, headers: embedHeaders });
        }

        // JSON format: return metadata + URL for programmatic use
        if (format === 'json') {
          let parsedFlags = [];
          try { parsedFlags = targetImage.flags ? JSON.parse(targetImage.flags) : []; } catch {}
          return Response.json({
            success: true,
            image: {
              id: targetImage.id,
              imageUrl: targetImage.imageUrl,
              title: targetImage.title || '',
              uploaderName: targetImage.uploaderName || '',
              license: targetImage.license || 'CC0',
              tags: parsedFlags,
              likeCount: parseInt(targetImage.likeCount || 0),
              downloadCount: parseInt(targetImage.downloadCount || 0),
              embedUrl: `${url.origin}/api/images?action=render&imageId=${targetImage.id}`,
              pageUrl: `${url.origin}/image/${targetImage.id}`,
            }
          }, { status: 200, headers: embedHeaders });
        }

        // Default: 302 redirect to CDN image (works directly in <img src="...">)
        return Response.redirect(targetImage.imageUrl, 302);
      }

      if (action === 'get_single') {
        const targetId = imageId;
        if (!targetId) {
          return Response.json({ success: false, error: "Missing imageId or id parameter." }, { status: 400, headers: corsHeaders });
        }

        const targetRes = await db.execute({
          sql: "SELECT *, (SELECT COUNT(*) FROM views WHERE imageId = images.id) as viewCount FROM images WHERE id = ?",
          args: [targetId]
        });

        if (targetRes.rows.length === 0) {
          return Response.json({ success: false, error: "Image not found." }, { status: 404, headers: corsHeaders });
        }

        const row = targetRes.rows[0];
        const likesRes = await db.execute({
          sql: "SELECT userUid FROM likes WHERE imageId = ?",
          args: [targetId]
        });
        const likedBy = likesRes.rows.map(r => r.userUid);

        let parsedFlags = [];
        let parsedConcepts = [];
        try { parsedFlags = row.flags ? JSON.parse(row.flags) : []; } catch {}
        try { parsedConcepts = row.aiConcepts ? JSON.parse(row.aiConcepts) : []; } catch {}

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
          commentCount: parseInt(row.commentCount || 0),
          viewCount: parseInt(row.viewCount || 0),
          flags: parsedFlags,
          tags: parsedFlags,
          aiConcepts: parsedConcepts,
          likedBy: likedBy
        };

        return Response.json({ success: true, image }, { status: 200, headers: cacheHeaders });
      }

      if (action === 'suggestions') {
        if (!imageId) {
          return Response.json({ success: false, error: "Missing imageId parameter." }, { status: 400, headers: corsHeaders });
        }

        const targetRes = await db.execute({
          sql: "SELECT *, (SELECT COUNT(*) FROM views WHERE imageId = images.id) as viewCount FROM images WHERE id = ?",
          args: [imageId]
        });

        if (targetRes.rows.length === 0) {
          return Response.json({ success: false, error: "Target image not found." }, { status: 404, headers: corsHeaders });
        }

        const target = targetRes.rows[0];
        let targetFlags = [];
        let targetConcepts = [];
        try { targetFlags = target.flags ? JSON.parse(target.flags) : []; } catch {}
        try { targetConcepts = target.aiConcepts ? JSON.parse(target.aiConcepts) : []; } catch {}

        if (targetConcepts.length === 0 && !targetFlags.includes("Flagged")) {
          // Cloudflare Pages Functions run in the request lifecycle. 
          // context.waitUntil lets us run things in the background without holding up the response.
          context.waitUntil((async () => {
            try {
              const safetyRes = await checkContentSafety(target.title, target.description, target.location, target.imageUrl, imageId, env);
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
              }
            } catch (err) {
              console.error("[Smart Suggestions] Background content safety / concepts generation failed:", err);
            }
          })());
        }

        const allImagesRes = await db.execute({
          sql: "SELECT *, (SELECT COUNT(*) FROM views WHERE imageId = images.id) as viewCount FROM images WHERE id != ? ORDER BY uploadedAt DESC",
          args: [imageId]
        });
        const likesRes = await db.execute("SELECT * FROM likes");

        const likesMap = {};
        likesRes.rows.forEach(like => {
          const imgId = like.imageId;
          const uUid = like.userUid;
          if (!likesMap[imgId]) likesMap[imgId] = [];
          likesMap[imgId].push(uUid);
        });

        const tasteProfile = {};
        if (userUid) {
          try {
            const userProfileRes = await db.execute({
              sql: "SELECT followedTags FROM users WHERE uploaderUid = ?",
              args: [userUid]
            });
            if (userProfileRes.rows.length > 0 && userProfileRes.rows[0].followedTags) {
              const tagsArray = JSON.parse(userProfileRes.rows[0].followedTags);
              if (Array.isArray(tagsArray)) {
                tagsArray.forEach(tag => { tasteProfile[tag] = (tasteProfile[tag] || 0) + 2.0; });
              }
            }
            const userUploads = await db.execute({
              sql: "SELECT flags, aiConcepts FROM images WHERE uploaderUid = ?",
              args: [userUid]
            });
            userUploads.rows.forEach(row => {
              let fl = []; let co = [];
              try { fl = row.flags ? JSON.parse(row.flags) : []; } catch {}
              try { co = row.aiConcepts ? JSON.parse(row.aiConcepts) : []; } catch {}
              fl.forEach(f => { tasteProfile[f] = (tasteProfile[f] || 0) + 1.5; });
              co.forEach(c => { tasteProfile[c] = (tasteProfile[c] || 0) + 1.5; });
            });
            const userLikes = await db.execute({
              sql: "SELECT i.flags, i.aiConcepts FROM likes l JOIN images i ON l.imageId = i.id WHERE l.userUid = ?",
              args: [userUid]
            });
            userLikes.rows.forEach(row => {
              let fl = []; let co = [];
              try { fl = row.flags ? JSON.parse(row.flags) : []; } catch {}
              try { co = row.aiConcepts ? JSON.parse(row.aiConcepts) : []; } catch {}
              fl.forEach(f => { tasteProfile[f] = (tasteProfile[f] || 0) + 1.0; });
              co.forEach(c => { tasteProfile[c] = (tasteProfile[c] || 0) + 1.0; });
            });
            const userViews = await db.execute({
              sql: "SELECT i.flags, i.aiConcepts FROM views v JOIN images i ON v.imageId = i.id WHERE v.userUid = ?",
              args: [userUid]
            });
            userViews.rows.forEach(row => {
              let fl = []; let co = [];
              try { fl = row.flags ? JSON.parse(row.flags) : []; } catch {}
              try { co = row.aiConcepts ? JSON.parse(row.aiConcepts) : []; } catch {}
              fl.forEach(f => { tasteProfile[f] = (tasteProfile[f] || 0) + 0.5; });
              co.forEach(c => { tasteProfile[c] = (tasteProfile[c] || 0) + 0.5; });
            });

            let maxWeight = 0;
            Object.values(tasteProfile).forEach(w => { if (w > maxWeight) maxWeight = w; });
            if (maxWeight > 0) {
              for (const key in tasteProfile) { tasteProfile[key] = tasteProfile[key] / maxWeight; }
            }
          } catch (err) {}
        }

        const followerCountMap = {};
        try {
          const countsRes = await db.execute("SELECT followingUid, COUNT(*) as cnt FROM follows GROUP BY followingUid");
          countsRes.rows.forEach(r => { followerCountMap[r.followingUid] = parseInt(r.cnt || 0); });
        } catch (err) {}

        const targetFollowing = new Set();
        const targetFollowers = new Set();
        try {
          const targetFollowsRes = await db.execute({
            sql: "SELECT followerUid, followingUid FROM follows WHERE followerUid = ? OR followingUid = ?",
            args: [target.uploaderUid, target.uploaderUid]
          });
          targetFollowsRes.rows.forEach(r => {
            if (r.followerUid === target.uploaderUid) targetFollowing.add(r.followingUid);
            if (r.followingUid === target.uploaderUid) targetFollowers.add(r.followerUid);
          });
        } catch (err) {}

        const followingUids = new Set();
        const secondDegreeUids = new Set();
        if (userUid) {
          try {
            const followingRes = await db.execute({
              sql: "SELECT followingUid FROM follows WHERE followerUid = ?",
              args: [userUid]
            });
            followingRes.rows.forEach(r => followingUids.add(r.followingUid));

            if (followingUids.size > 0) {
              const secondDegreeRes = await db.execute({
                sql: `
                  SELECT f2.followingUid 
                  FROM follows f1 
                  JOIN follows f2 ON f1.followingUid = f2.followerUid 
                  WHERE f1.followerUid = ? AND f2.followingUid != ?
                `,
                args: [userUid, userUid]
              });
              secondDegreeRes.rows.forEach(r => {
                if (!followingUids.has(r.followingUid)) secondDegreeUids.add(r.followingUid);
              });
            }
          } catch (err) {}
        }

        const scoredImages = allImagesRes.rows.map(row => {
          const id = row.id;
          let fl = []; let co = [];
          try { fl = row.flags ? JSON.parse(row.flags) : []; } catch {}
          try { co = row.aiConcepts ? JSON.parse(row.aiConcepts) : []; } catch {}

          let conceptOverlap = 0;
          const targetWords = new Set();
          targetConcepts.forEach(c => {
            c.toLowerCase().split(/[\s-_]+/).forEach(w => { if (w.length > 3) targetWords.add(w); });
          });
          co.forEach(c => {
            c.toLowerCase().split(/[\s-_]+/).forEach(w => {
              if (w.length > 3 && targetWords.has(w)) conceptOverlap += 0.5;
            });
          });

          let tagOverlap = 0;
          fl.forEach(f => { if (targetFlags.includes(f)) tagOverlap++; });

          let metadataMatch = 0;
          const targetText = `${target.title || ''} ${target.description || ''} ${target.location || ''}`.toLowerCase();
          const candidateText = `${row.title || ''} ${row.description || ''} ${row.location || ''}`.toLowerCase();
          
          const tokens = targetText.split(/\s+/).filter(t => t.length > 3);
          tokens.forEach(tok => { if (candidateText.includes(tok)) metadataMatch += 0.5; });

          let tasteScore = 0;
          fl.forEach(f => { if (tasteProfile[f]) tasteScore += tasteProfile[f]; });
          co.forEach(c => { if (tasteProfile[c]) tasteScore += tasteProfile[c]; });
          tasteScore = Math.min(tasteScore, 2.0);

          let followBoostScore = 0;
          const candidateUploader = row.uploaderUid;
          if (userUid) {
            if (followingUids.has(candidateUploader)) followBoostScore += 5.0;
            else if (secondDegreeUids.has(candidateUploader)) followBoostScore += 2.0;
          }

          let targetCreatorRelationBoost = 0;
          if (candidateUploader !== target.uploaderUid) {
            if (targetFollowing.has(candidateUploader)) targetCreatorRelationBoost += 1.5;
            if (targetFollowers.has(candidateUploader)) targetCreatorRelationBoost += 1.5;
          }

          const uploaderFollowers = followerCountMap[candidateUploader] || 0;
          const globalFollowerBoost = Math.min(uploaderFollowers * 0.2, 3.0);

          const popularity = (row.likeCount || 0) * 0.1 + (row.downloadCount || 0) * 0.05 + (row.commentCount || 0) * 0.2;

          const totalScore = (conceptOverlap * 4.0) + (tagOverlap * 3.0) + (metadataMatch * 3.0) + (tasteScore * 2.0) + popularity + followBoostScore + targetCreatorRelationBoost + globalFollowerBoost;

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
              commentCount: parseInt(row.commentCount || 0),
              viewCount: parseInt(row.viewCount || 0),
              flags: fl,
              aiConcepts: co,
              likedBy: likesMap[id] || [],
            },
            score: totalScore
          };
        });

        scoredImages.sort((a, b) => b.score - a.score);
        const suggestions = scoredImages.map(item => item.image).slice(0, 12);

        return Response.json({ success: true, images: suggestions }, { status: 200, headers: cacheHeaders });
      }

      // --- Personalized Feed: Full feed sorted by user's taste profile ---
      if (action === 'personalized_feed' && userUid) {
        const searchTerms = url.searchParams.get('searchTerms') || ''; // Client-side search history

        // Optimized: Combined taste profile query (uploads + likes + views in one UNION ALL) — reduces 7→5 DB calls
        const [allImagesRes, likesRes, userProfileRes, combinedTasteRes, followingRes] = await Promise.all([
          db.execute("SELECT *, (SELECT COUNT(*) FROM views WHERE imageId = images.id) as viewCount FROM images ORDER BY uploadedAt DESC"),
          db.execute("SELECT * FROM likes"),
          db.execute({ sql: "SELECT followedTags FROM users WHERE uploaderUid = ?", args: [userUid] }),
          // Single combined query for uploads + likes + views taste signals
          db.execute({
            sql: `
              SELECT flags, aiConcepts, 'upload' as source FROM images WHERE uploaderUid = ?
              UNION ALL
              SELECT i.flags, i.aiConcepts, 'like' as source FROM likes l JOIN images i ON l.imageId = i.id WHERE l.userUid = ?
              UNION ALL
              SELECT i.flags, i.aiConcepts, 'view' as source FROM views v JOIN images i ON v.imageId = i.id WHERE v.userUid = ?
            `,
            args: [userUid, userUid, userUid]
          }),
          db.execute({ sql: "SELECT followingUid FROM follows WHERE followerUid = ?", args: [userUid] }),
        ]);

        // Build likes map
        const likesMap = {};
        likesRes.rows.forEach(like => {
          if (!likesMap[like.imageId]) likesMap[like.imageId] = [];
          likesMap[like.imageId].push(like.userUid);
        });

        // Build follow set
        const followingUids = new Set();
        followingRes.rows.forEach(r => followingUids.add(r.followingUid));

        // Build taste profile from combined results + followed tags
        const tasteProfile = {};
        try {
          // Followed tags (strongest signal)
          if (userProfileRes.rows.length > 0 && userProfileRes.rows[0].followedTags) {
            const tagsArray = JSON.parse(userProfileRes.rows[0].followedTags);
            if (Array.isArray(tagsArray)) {
              tagsArray.forEach(tag => { tasteProfile[tag] = (tasteProfile[tag] || 0) + 2.0; });
            }
          }

          // Process combined taste signals with source-based weighting
          const sourceWeights = { upload: 1.5, like: 1.0, view: 0.5 };
          combinedTasteRes.rows.forEach(row => {
            const weight = sourceWeights[row.source] || 0.5;
            let fl = []; let co = [];
            try { fl = row.flags ? JSON.parse(row.flags) : []; } catch {}
            try { co = row.aiConcepts ? JSON.parse(row.aiConcepts) : []; } catch {}
            fl.forEach(f => { tasteProfile[f] = (tasteProfile[f] || 0) + weight; });
            co.forEach(c => { tasteProfile[c] = (tasteProfile[c] || 0) + weight; });
          });

          // Search intent: add search terms as taste signals (medium weight)
          if (searchTerms) {
            searchTerms.split(',').forEach(term => {
              const t = term.trim().toLowerCase();
              if (t.length >= 3) {
                tasteProfile[t] = (tasteProfile[t] || 0) + 1.2;
              }
            });
          }

          // Normalize taste profile
          let maxWeight = 0;
          Object.values(tasteProfile).forEach(w => { if (w > maxWeight) maxWeight = w; });
          if (maxWeight > 0) {
            for (const key in tasteProfile) { tasteProfile[key] = tasteProfile[key] / maxWeight; }
          }
        } catch (err) {
          console.error("[Personalized Feed] Taste profile build error:", err);
        }

        // Followed users' liked images: social proof boost
        // Build a set of imageIds that people you follow have liked
        const followLikedImageIds = new Set();
        if (followingUids.size > 0) {
          likesRes.rows.forEach(like => {
            if (followingUids.has(like.userUid)) {
              followLikedImageIds.add(like.imageId);
            }
          });
        }

        const hasProfile = Object.keys(tasteProfile).length > 0;
        const now = Date.now();

        // Parse search terms for metadata matching
        const searchWords = searchTerms ? searchTerms.split(',').map(t => t.trim().toLowerCase()).filter(t => t.length >= 3) : [];

        // Score all images
        const scoredImages = allImagesRes.rows.map(row => {
          let fl = []; let co = [];
          try { fl = row.flags ? JSON.parse(row.flags) : []; } catch {}
          try { co = row.aiConcepts ? JSON.parse(row.aiConcepts) : []; } catch {}

          // 1. Taste affinity score
          let tasteScore = 0;
          if (hasProfile) {
            fl.forEach(f => { if (tasteProfile[f]) tasteScore += tasteProfile[f]; });
            co.forEach(c => { if (tasteProfile[c]) tasteScore += tasteProfile[c]; });
            tasteScore = Math.min(tasteScore, 3.0);
          }

          // 2. Follow boost (direct follow)
          let followBoost = followingUids.has(row.uploaderUid) ? 2.0 : 0;

          // 3. Social proof: images liked by people you follow
          let socialProof = followLikedImageIds.has(row.id) ? 1.5 : 0;

          // 4. Search intent: match search history against image metadata
          let searchBoost = 0;
          if (searchWords.length > 0) {
            const candidateText = `${row.title || ''} ${row.description || ''} ${row.location || ''} ${fl.join(' ')} ${co.join(' ')}`.toLowerCase();
            searchWords.forEach(word => {
              if (candidateText.includes(word)) searchBoost += 0.8;
            });
            searchBoost = Math.min(searchBoost, 2.0);
          }

          // 5. Recency
          const uploadedAt = row.uploadedAt ? new Date(row.uploadedAt).getTime() : now;
          const ageInHours = (now - uploadedAt) / (1000 * 60 * 60);
          let recencyScore = 0;
          if (ageInHours < 1) recencyScore = 3.0;
          else if (ageInHours < 6) recencyScore = 2.0;
          else if (ageInHours < 24) recencyScore = 1.5;
          else if (ageInHours < 72) recencyScore = 0.8;
          else recencyScore = 0.3;

          // 6. Popularity
          const popularity = Math.min(((row.likeCount || 0) * 0.15 + (row.downloadCount || 0) * 0.05 + (row.commentCount || 0) * 0.25), 2.0);

          // 7. Discovery randomness
          const randomFactor = Math.random() * 1.5;

          const totalScore = (tasteScore * 4.0) + (followBoost * 2.0) + (socialProof * 2.0) + (searchBoost * 3.0) + (recencyScore * 2.0) + popularity + randomFactor;

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
              commentCount: parseInt(row.commentCount || 0),
              viewCount: parseInt(row.viewCount || 0),
              flags: fl,
              aiConcepts: co,
              likedBy: likesMap[row.id] || [],
            },
            score: totalScore
          };
        });

        scoredImages.sort((a, b) => b.score - a.score);
        const images = scoredImages.map(item => item.image);

        return Response.json({ success: true, images, personalized: true }, { status: 200, headers: cacheHeaders });
      }

      let imagesQuery = "SELECT *, (SELECT COUNT(*) FROM views WHERE imageId = images.id) as viewCount FROM images ORDER BY uploadedAt DESC";
      let imagesArgs = [];

      if (uploaderUid) {
        imagesQuery = "SELECT *, (SELECT COUNT(*) FROM views WHERE imageId = images.id) as viewCount FROM images WHERE uploaderUid = ? ORDER BY uploadedAt DESC";
        imagesArgs = [uploaderUid];
      }

      const imagesRes = await db.execute({ sql: imagesQuery, args: imagesArgs });
      const likesRes = await db.execute("SELECT * FROM likes");

      const likesMap = {};
      likesRes.rows.forEach(like => {
        const imgId = like.imageId;
        const uUid = like.userUid;
        if (!likesMap[imgId]) likesMap[imgId] = [];
        likesMap[imgId].push(uUid);
      });

      const images = imagesRes.rows.map(row => {
        const id = row.id;
        let parsedFlags = [];
        let parsedConcepts = [];
        try { parsedFlags = row.flags ? JSON.parse(row.flags) : []; } catch {}
        try { parsedConcepts = row.aiConcepts ? JSON.parse(row.aiConcepts) : []; } catch {}

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
          commentCount: parseInt(row.commentCount || 0),
          viewCount: parseInt(row.viewCount || 0),
          flags: parsedFlags,
          aiConcepts: parsedConcepts,
          likedBy: likesMap[id] || [],
        };
      });

      return Response.json({ success: true, images }, { status: 200, headers: cacheHeaders });
    }

    // --- POST Method: Upload, Edit, Like, Download, Delete ---
    if (request.method === 'POST') {
      const action = url.searchParams.get('action');

      if (!action) {
        return Response.json({ success: false, error: "Missing action parameter." }, { status: 400, headers: corsHeaders });
      }

      let body = {};
      try {
        body = await request.json();
      } catch (err) {
        return Response.json({ success: false, error: "Invalid JSON body" }, { status: 400, headers: corsHeaders });
      }

      // Action: AI auto-tags
      if (action === 'auto_tags') {
        const { image, images } = body;
        if (!image && (!images || !Array.isArray(images) || images.length === 0)) {
          return Response.json({ success: false, error: "Missing required 'image' or 'images' (array of base64 data URLs) field." }, { status: 400, headers: corsHeaders });
        }

        const mistralKey = env.MISTRAL_API_KEY;
        if (!mistralKey) {
          return Response.json({ success: false, error: "MISTRAL_API_KEY is not defined on the server." }, { status: 500, headers: corsHeaders });
        }

        const isVideo = Array.isArray(images) && images.length > 0;
        const promptText = isVideo
          ? `Task: Analyze the provided video keyframes (ordered chronologically) to suggest tags, title, description, and location.
          
Available tags in our app: "Natural", "Monochrome", "Street", "Landscape", "Architecture", "Abstract", "Urban", "Creative", "Night", "Macro", "Minimalist", "Portrait", "Travel".

Select 1 to 5 tags from the available tags list that perfectly describe the video.
Suggest a beautiful, highly premium title, a professional short description (1-2 sentences max) describing the visual progression across the keyframes, and a plausible city/country location if identifiable from the scenes.

Return the response strictly as a JSON object with this exact format:
{
  "tags": ["Tag1", "Tag2"],
  "title": "Beautiful suggested title",
  "description": "Short description of the video progression.",
  "location": "City, Country"
}`
          : `Task: Analyze the provided image to suggest tags, title, description, and location.
          
Available tags in our app: "Natural", "Monochrome", "Street", "Landscape", "Architecture", "Abstract", "Urban", "Creative", "Night", "Macro", "Minimalist", "Portrait", "Travel".

Select 1 to 5 tags from the available tags list that perfectly describe the image.
Suggest a beautiful, highly premium title, a professional short description (1-2 sentences max), and a plausible city/country location if identifiable from the image.

Return the response strictly as a JSON object with this exact format:
{
  "tags": ["Tag1", "Tag2"],
  "title": "Beautiful suggested title",
  "description": "Short description of the photo.",
  "location": "City, Country"
}`;

        const content = [{ type: "text", text: promptText }];
        if (isVideo) {
          images.forEach(img => {
            content.push({ type: "image_url", image_url: { url: img } });
          });
        } else {
          content.push({ type: "image_url", image_url: { url: image } });
        }

        const invokeUrl = "https://api.mistral.ai/v1/chat/completions";
        const payload = {
          model: "pixtral-12b-2409",
          messages: [
            {
              role: "user",
              content: content
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
        const responseContent = resData.choices[0].message.content;
        const parsed = JSON.parse(responseContent);

        return Response.json({
          success: true,
          tags: parsed.tags || [],
          title: parsed.title || '',
          description: parsed.description || '',
          location: parsed.location || ''
        }, { status: 200, headers: corsHeaders });
      }

      // Action: Direct API key-authorized image upload
      if (action === 'api_upload') {
        let authHeader = request.headers.get('authorization') || request.headers.get('x-api-key');
        if (!authHeader) {
          return Response.json({ success: false, error: "Missing API Key in Authorization header or x-api-key header." }, { status: 401, headers: corsHeaders });
        }
        
        let apiKeyInput = authHeader.replace(/^Bearer\s+/i, '').trim();
        
        const userRes = await db.execute({
          sql: "SELECT * FROM users WHERE apiKey = ?",
          args: [apiKeyInput]
        });

        if (userRes.rows.length === 0) {
          return Response.json({ success: false, error: "Invalid API key." }, { status: 401, headers: corsHeaders });
        }

        const userRow = userRes.rows[0];
        const uploaderUid = userRow.uploaderUid;
        const uploaderName = userRow.uploaderName;
        const uploaderPhotoURL = userRow.uploaderPhotoURL;

        const {
          image, title, description, license, licenseUrl, tags, originalWorkUrl, location
        } = body;

        if (!image) {
          return Response.json({ success: false, error: "Missing required 'image' field in JSON body (base64 string or public image/video URL)." }, { status: 400, headers: corsHeaders });
        }

        let buffer;
        let extension = 'jpg';
        let contentType = 'image/jpeg';
        let isVideo = false;
        
        if (image.startsWith('http://') || image.startsWith('https://')) {
          try {
            const fetchRes = await fetch(image);
            const arrayBuffer = await fetchRes.arrayBuffer();
            buffer = new Uint8Array(arrayBuffer);
            const fetchedContentType = fetchRes.headers.get('content-type');
            if (fetchedContentType && fetchedContentType.startsWith('video/')) {
              isVideo = true;
              contentType = fetchedContentType;
              extension = fetchedContentType.split('/')[1] || 'mp4';
            } else if (image.match(/\.(mp4|webm|mov|ogg|avi|mkv|m4v)(\?.*)?$/i)) {
              isVideo = true;
              extension = image.split('.').pop().split('?')[0].toLowerCase();
              contentType = `video/${extension}`;
            }
          } catch (err) {
            return Response.json({ success: false, error: `Failed to download media from URL: ${err.message}` }, { status: 400, headers: corsHeaders });
          }
        } else {
          try {
            const match = image.match(/^data:(image|video)\/(\w+);base64,/);
            if (match) {
              if (match[1] === 'video') {
                isVideo = true;
                contentType = match[0].split(';')[0].split(':')[1];
                extension = match[2];
              } else {
                contentType = match[0].split(';')[0].split(':')[1];
                extension = match[2];
              }
            }
            const base64Data = image.replace(/^data:(image|video)\/\w+;base64,/, "");
            const binaryString = atob(base64Data);
            const len = binaryString.length;
            buffer = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
                buffer[i] = binaryString.charCodeAt(i);
            }
          } catch (err) {
            return Response.json({ success: false, error: "Failed to parse Base64 media data." }, { status: 400, headers: corsHeaders });
          }
        }

        const TEN_MB = 10 * 1024 * 1024;
        if (buffer.byteLength > TEN_MB) {
            return Response.json({ success: false, error: "File exceeds maximum size of 10MB." }, { status: 400, headers: corsHeaders });
        }

        // --- Image Compression Logic using Photon (Skip for Videos) ---
        if (!isVideo) {
          try {
            let photonImg = PhotonImage.new_from_byteslice(buffer);
            const width = photonImg.get_width();
            const height = photonImg.get_height();

            const MAX_WIDTH = 1920;
            const ONE_MB = 1024 * 1024;

            if (width > MAX_WIDTH || buffer.byteLength > ONE_MB) {
                if (width > MAX_WIDTH) {
                  const newHeight = Math.round(height * (MAX_WIDTH / width));
                  const resized = resize(photonImg, MAX_WIDTH, newHeight, SamplingFilter.Lanczos3);
                  photonImg.free();
                  photonImg = resized;
                }
                buffer = photonImg.get_bytes_jpeg(80);
            }
            photonImg.free();
          } catch (photonErr) {
            console.error("Photon compression error:", photonErr);
          }
        }

        const R2_ACCOUNT_ID = "d8e8828f54e7dac7c17e397d1998f745";
        const R2_BUCKET = env.R2_BUCKET_NAME || "glassgallery";
        const publicDomain = env.R2_PUBLIC_DOMAIN;
        if (!publicDomain) {
          throw new Error("Server Misconfiguration: R2_PUBLIC_DOMAIN environment variable is missing.");
        }

        const S3 = new S3Client({
          region: "auto",
          endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
          credentials: {
            accessKeyId: env.R2_ACCESS_KEY_ID,
            secretAccessKey: env.R2_SECRET_ACCESS_KEY,
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

        const id = 'img_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        let updatedFlags = tags || [];
        let isUnsafe = false;
        let aiConceptsArr = [];

        try {
          const safetyRes = await checkContentSafety(title || '', description || '', location || '', imageUrl, id, env);
          isUnsafe = safetyRes.isUnsafe;
          aiConceptsArr = safetyRes.aiConcepts || [];
        } catch (err) {
          console.error("[API Upload Content Safety] Moderation failed:", err);
        }

        if (isUnsafe && !updatedFlags.includes("Flagged")) {
          updatedFlags.push("Flagged");
        }

        const uploadedAt = new Date().toISOString();

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

        if (isUnsafe) {
          const notifId = 'notif_' + Math.random().toString(36).substring(2, 15);
          await db.execute({
            sql: `INSERT INTO notifications (id, recipientUid, actorUid, actorName, actorPhotoURL, type, imageId, imageUrl, createdAt, read)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
            args: [notifId, uploaderUid, 'system', 'System Moderator', '', 'flagged', id, imageUrl, uploadedAt]
          }).catch(err => console.error("[Content Safety] Notification failed:", err));
        }

        return Response.json({
          success: true,
          imageId: id,
          imageUrl,
          flagged: isUnsafe,
          aiConcepts: aiConceptsArr
        }, { status: 200, headers: corsHeaders });
      }

      // Action: Add/Upload image
      if (action === 'upload') {
        const {
          id, imageUrl, uploaderUid, uploaderName, uploaderPhotoURL, title, description, license, licenseUrl, flags, originalWorkUrl, location,
        } = body;

        if (!id || !imageUrl || !uploaderUid) {
          return Response.json({ success: false, error: "Missing required fields." }, { status: 400, headers: corsHeaders });
        }

        let updatedFlags = flags || [];
        let isUnsafe = false;
        let aiConceptsArr = [];
        try {
          const safetyRes = await checkContentSafety(title, description, location, imageUrl, id, env);
          isUnsafe = safetyRes.isUnsafe;
          aiConceptsArr = safetyRes.aiConcepts || [];
        } catch (err) {
          console.error("[Content Safety] Moderation failed during upload:", err);
        }

        if (isUnsafe) {
          if (!updatedFlags.includes("Flagged")) updatedFlags.push("Flagged");
        }

        const uploadedAt = new Date().toISOString();

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

        if (isUnsafe) {
          const notifId = 'notif_' + Math.random().toString(36).substring(2, 15);
          await db.execute({
            sql: `INSERT INTO notifications (id, recipientUid, actorUid, actorName, actorPhotoURL, type, imageId, imageUrl, createdAt, read)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
            args: [notifId, uploaderUid, 'system', 'System Moderator', '', 'flagged', id, imageUrl, uploadedAt]
          }).catch(err => console.error("[Content Safety] Notification insert failed:", err));
        }

        return Response.json({ success: true, flagged: isUnsafe }, { status: 200, headers: corsHeaders });
      }

      // Action: Update image details
      if (action === 'update') {
        const { imageId, updates } = body;

        if (!imageId || !updates) {
          return Response.json({ success: false, error: "Missing imageId or updates." }, { status: 400, headers: corsHeaders });
        }

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
          return Response.json({ success: false, error: "No valid update fields provided." }, { status: 400, headers: corsHeaders });
        }

        updateArgs.push(imageId);

        await db.execute({
          sql: `UPDATE images SET ${updateKeys.join(', ')} WHERE id = ?`,
          args: updateArgs
        });

        return Response.json({ success: true }, { status: 200, headers: corsHeaders });
      }

      // Action: Delete image
      if (action === 'delete') {
        const { imageId: rawImageId } = body;
        const imageId = rawImageId ? rawImageId.split('_loop_')[0] : null;
        if (!imageId) return Response.json({ success: false, error: "Missing imageId." }, { status: 400, headers: corsHeaders });

        await db.execute({
          sql: "DELETE FROM images WHERE id = ?",
          args: [imageId]
        });

        return Response.json({ success: true }, { status: 200, headers: corsHeaders });
      }

      // Action: Increment download count
      if (action === 'download') {
        const { imageId: rawImageId } = body;
        if (!rawImageId) return Response.json({ success: false, error: "Missing imageId." }, { status: 400, headers: corsHeaders });
        const imageId = rawImageId.split('_loop_')[0];

        await db.execute({
          sql: "UPDATE images SET downloadCount = downloadCount + 1 WHERE id = ?",
          args: [imageId]
        });

        return Response.json({ success: true }, { status: 200, headers: corsHeaders });
      }

      // Action: Toggle like
      if (action === 'like') {
        const { imageId: rawImageId, userUid, userName, userPhotoURL } = body;
        const imageId = rawImageId ? rawImageId.split('_loop_')[0] : null;

        if (!imageId || !userUid) {
          return Response.json({ success: false, error: "Missing imageId or userUid." }, { status: 400, headers: corsHeaders });
        }

        const checkLike = await db.execute({
          sql: "SELECT 1 FROM likes WHERE imageId = ? AND userUid = ?",
          args: [imageId, userUid]
        });

        const hasLiked = checkLike.rows.length > 0;
        let wasLike = false;

        if (hasLiked) {
          await db.execute({
            sql: "DELETE FROM likes WHERE imageId = ? AND userUid = ?",
            args: [imageId, userUid]
          });
        } else {
          await db.execute({
            sql: "INSERT INTO likes (imageId, userUid) VALUES (?, ?)",
            args: [imageId, userUid]
          });
          wasLike = true;
        }

        const newCountRes = await db.execute({
          sql: "SELECT COUNT(*) as count FROM likes WHERE imageId = ?",
          args: [imageId]
        });
        const newCount = parseInt(newCountRes.rows[0].count);

        await db.execute({
          sql: "UPDATE images SET likeCount = ? WHERE id = ?",
          args: [newCount, imageId]
        });

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

        return Response.json({ success: true, hasLiked: !hasLiked }, { status: 200, headers: corsHeaders });
      }

      // Action: Register user view/click
      if (action === 'view') {
        const { imageId, userUid } = body;
        if (!imageId || !userUid) return Response.json({ success: false, error: "Missing imageId or userUid." }, { status: 400, headers: corsHeaders });

        const viewedAt = new Date().toISOString();

        await db.execute({
          sql: "INSERT OR REPLACE INTO views (userUid, imageId, viewedAt) VALUES (?, ?, ?)",
          args: [userUid, imageId, viewedAt]
        });

        return Response.json({ success: true }, { status: 200, headers: corsHeaders });
      }

      return Response.json({ success: false, error: `Invalid action: ${action}` }, { status: 400, headers: corsHeaders });
    }

    return Response.json({ success: false, error: "Method not allowed." }, { status: 405, headers: corsHeaders });

  } catch (error) {
    console.error("API DB Error:", error);
    return Response.json({ success: false, error: error.message }, { status: 500, headers: corsHeaders });
  }
}

async function checkContentSafety(title, description, location, imageUrl, imageId, env) {
  try {
    let mistralKey = env.MISTRAL_API_KEY;

    if (!mistralKey) {
      console.warn("[Content Safety] MISTRAL_API_KEY is not defined. Skipping safety moderation.");
      return { isUnsafe: false, aiConcepts: [] };
    }

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
      await new Promise(resolve => setTimeout(resolve, 1500));
      urlAttempt++;
    }

    const isVideo = imageUrl.match(/\.(mp4|webm|mov|ogg|avi|mkv|m4v)(\?.*)?$/i);
    let messagesContent = [
      {
        type: "text",
        text: `Task: Analyze the metadata details for the uploaded ${isVideo ? 'video' : 'image'} to:
1. Evaluate safety: Check if there is unsafe content based on the Safety Policy Categories (S1-S6). Intimate anatomy or medical/disease raw graphics of intimate areas MUST be rated as 'unsafe'. Provide a rating of either 'safe' or 'unsafe'.
2. Generate concepts: If safe, generate 5 descriptive, high-quality aesthetic keyword/concept tags.

Metadata:
Title: ${title || "Untitled"}
Description: ${description || "No description"}
Location: ${location || "No location"}

Return the response strictly as a JSON object with this exact format:
{
  "safety": "safe" or "unsafe",
  "keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"]
}`
      }
    ];

    if (!isVideo) {
      messagesContent.push({ type: "image_url", image_url: { url: imageUrl } });
    }

    const invokeUrl = "https://api.mistral.ai/v1/chat/completions";
    const payload = {
      model: "pixtral-12b-2409",
      messages: [
        {
          role: "user",
          content: messagesContent
        }
      ],
      response_format: { type: "json_object" },
      max_tokens: 512,
      temperature: 0.20,
      top_p: 0.70
    };

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
          await new Promise(resolve => setTimeout(resolve, delay));
          attempt++;
          delay *= 2.5;
          continue;
        }
        break;
      } catch (fetchErr) {
        attempt++;
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2.5;
      }
    }

    if (!response || !response.ok) {
      return { isUnsafe: false, aiConcepts: [] };
    }

    const data = await response.json();
    const resultText = data.choices?.[0]?.message?.content || "{}";

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
        try { aiConcepts = JSON.parse(match[0]); } catch (je) {}
      }
    }

    return { isUnsafe, aiConcepts };

  } catch (error) {
    console.error("[Content Safety] Critical error:", error);
    return { isUnsafe: false, aiConcepts: [] };
  }
}
