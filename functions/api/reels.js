import { getDb } from "./lib/turso.js";

const corsHeaders = {
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
};

// Configurable algorithm parameters
export const REELS_ALGO_CONFIG = {
  alpha: 1.8,       // Creator affinity boost
  beta: 1.0,        // Normalized popularity weight
  gamma: 4.5,       // Freshness boost for recent uploads (strongly prioritizes new reels)
  delta: 80.0,      // Aggressive seen penalty
  eta: 0.2,         // Learning rate for taste updates
  decay_lambda: Math.LN2 / (14 * 86400 * 1000), // 14-day exponential decay half-life in ms
};

const VIDEO_REGEX = /\.(mp4|webm|mov|ogg|avi|mkv|m4v)(\?.*)?$/i;

// Simple deterministic hash function for jitter
function deterministicJitter(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return (Math.sin(hash) * 0.15); // [-0.15, +0.15]
}

let tablesInitialized = false;
async function ensureTables(db) {
  if (tablesInitialized) return;
  try {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS reel_events (
        id TEXT PRIMARY KEY,
        user_or_device_id TEXT NOT NULL,
        video_id TEXT NOT NULL,
        watch_ms INTEGER DEFAULT 0,
        duration REAL DEFAULT 0,
        loops INTEGER DEFAULT 0,
        completed INTEGER DEFAULT 0,
        liked INTEGER DEFAULT 0,
        saved INTEGER DEFAULT 0,
        shared INTEGER DEFAULT 0,
        commented INTEGER DEFAULT 0,
        fast_skip INTEGER DEFAULT 0,
        muted INTEGER DEFAULT 1,
        timestamp INTEGER NOT NULL
      );
    `);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_reel_events_user ON reel_events(user_or_device_id);`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_reel_events_video ON reel_events(video_id);`);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS user_taste (
        user_or_device_id TEXT NOT NULL,
        key_type TEXT NOT NULL,
        key TEXT NOT NULL,
        weight REAL DEFAULT 0,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (user_or_device_id, key_type, key)
      );
    `);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_user_taste_user ON user_taste(user_or_device_id);`);
    tablesInitialized = true;
  } catch (err) {
    console.warn("[Reels DB Schema Info]:", err.message);
  }
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(request.url);
  const db = getDb(env);
  await ensureTables(db);

  // -------------------------------------------------------------
  // POST /api/reels?action=events OR POST /reels/events
  // Batched tracking events ingestion & user taste updating
  // -------------------------------------------------------------
  if (request.method === 'POST') {
    try {
      const body = await request.json();
      const userOrDeviceId = body.userUid || body.deviceId;
      const rawEvents = Array.isArray(body.events) ? body.events : (body.event ? [body.event] : []);

      if (!userOrDeviceId || rawEvents.length === 0) {
        return Response.json({ success: true, count: 0 }, { headers: corsHeaders });
      }

      const now = Date.now();
      const tasteUpdates = new Map(); // key -> { type, key, deltaScore }

      for (const ev of rawEvents) {
        const eventId = `rev_${now}_${Math.random().toString(36).substring(2, 9)}`;
        const videoId = (ev.videoId || '').split('_loop_')[0].split('_rel_loop_')[0];
        if (!videoId) continue;

        const duration = Math.max(parseFloat(ev.duration) || 1, 0.1);
        const watchMs = Math.max(parseInt(ev.watchMs) || 0, 0);
        const watchRatio = watchMs / (duration * 1000);
        const loops = Math.max(parseInt(ev.loops) || 0, 0);
        const isLiked = ev.liked ? 1 : 0;
        const isSaved = ev.saved ? 1 : 0;
        const isShared = ev.shared ? 1 : 0;
        const isCommented = ev.commented ? 1 : 0;
        const isFastSkip = (watchMs < 1500 && watchRatio < 0.2 && !isLiked && !isSaved) ? 1 : 0;
        const isCompleted = (watchRatio >= 0.95 || loops > 0) ? 1 : 0;
        const isMuted = ev.muted ? 1 : 0;

        // Engagement formula:
        // e = 2.5 * min(r, 2) + 1.5 * loops + 3 * like + 2 * comment + 4 * share + 4 * save - 2 * fast_skip
        const e = (2.5 * Math.min(watchRatio, 2.0))
          + (1.5 * loops)
          + (3.0 * isLiked)
          + (2.0 * isCommented)
          + (4.0 * isShared)
          + (4.0 * isSaved)
          - (2.0 * isFastSkip);

        // Record event in reel_events
        try {
          await db.execute({
            sql: `INSERT INTO reel_events 
              (id, user_or_device_id, video_id, watch_ms, duration, loops, completed, liked, saved, shared, commented, fast_skip, muted, timestamp)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [eventId, userOrDeviceId, videoId, watchMs, duration, loops, isCompleted, isLiked, isSaved, isShared, isCommented, isFastSkip, isMuted, now]
          });
        } catch (dbErr) {
          console.error("Failed to insert reel_event:", dbErr.message);
        }

        // Aggregate taste signals for tags, concepts, creator
        const tags = Array.isArray(ev.tags) ? ev.tags : [];
        const concepts = Array.isArray(ev.concepts) ? ev.concepts : [];
        const creatorUid = ev.creatorUid || '';

        tags.forEach(t => {
          if (t && t.toLowerCase() !== 'flagged') {
            const k = `tag:${t.toLowerCase().trim()}`;
            tasteUpdates.set(k, { type: 'tag', key: t.toLowerCase().trim(), delta: (tasteUpdates.get(k)?.delta || 0) + e });
          }
        });

        concepts.forEach(c => {
          if (c) {
            const k = `concept:${c.toLowerCase().trim()}`;
            tasteUpdates.set(k, { type: 'concept', key: c.toLowerCase().trim(), delta: (tasteUpdates.get(k)?.delta || 0) + (e * 0.75) });
          }
        });

        if (creatorUid) {
          const k = `creator:${creatorUid}`;
          tasteUpdates.set(k, { type: 'creator', key: creatorUid, delta: (tasteUpdates.get(k)?.delta || 0) + (e * 1.2) });
        }
      }

      // Update user_taste with exponential decay:
      // w_k <- w_k * exp(-lambda * delta_t) + eta * e
      for (const [, item] of tasteUpdates.entries()) {
        try {
          const existingRes = await db.execute({
            sql: `SELECT weight, updated_at FROM user_taste WHERE user_or_device_id = ? AND key_type = ? AND key = ?`,
            args: [userOrDeviceId, item.type, item.key]
          });

          let currentWeight = 0;
          let lastUpdated = now;
          if (existingRes.rows.length > 0) {
            currentWeight = parseFloat(existingRes.rows[0].weight) || 0;
            lastUpdated = parseInt(existingRes.rows[0].updated_at) || now;
          }

          const deltaT = Math.max(now - lastUpdated, 0);
          const decayedWeight = currentWeight * Math.exp(-REELS_ALGO_CONFIG.decay_lambda * deltaT);
          const newWeight = Math.max(-5, Math.min(25, decayedWeight + (REELS_ALGO_CONFIG.eta * item.delta)));

          await db.execute({
            sql: `INSERT INTO user_taste (user_or_device_id, key_type, key, weight, updated_at)
              VALUES (?, ?, ?, ?, ?)
              ON CONFLICT(user_or_device_id, key_type, key) DO UPDATE SET weight = excluded.weight, updated_at = excluded.updated_at`,
            args: [userOrDeviceId, item.type, item.key, newWeight, now]
          });
        } catch (tasteErr) {
          console.warn("Failed to update user_taste entry:", tasteErr.message);
        }
      }

      // Merge anonymous device taste into user account if user just signed in
      if (body.userUid && body.deviceId && body.userUid !== body.deviceId) {
        try {
          const deviceTasteRes = await db.execute({
            sql: `SELECT key_type, key, weight FROM user_taste WHERE user_or_device_id = ?`,
            args: [body.deviceId]
          });
          for (const row of deviceTasteRes.rows) {
            await db.execute({
              sql: `INSERT INTO user_taste (user_or_device_id, key_type, key, weight, updated_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(user_or_device_id, key_type, key) DO UPDATE SET weight = weight + excluded.weight, updated_at = excluded.updated_at`,
              args: [body.userUid, row.key_type, row.key, row.weight, now]
            });
          }
        } catch (mergeErr) {
          console.warn("Failed to merge device taste to userUid:", mergeErr.message);
        }
      }

      return Response.json({ success: true, count: rawEvents.length }, { headers: corsHeaders });
    } catch (err) {
      console.error("[Reels Events Error]:", err);
      return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
    }
  }

  // -------------------------------------------------------------
  // GET /api/reels?action=feed OR GET /reels/feed
  // Ranked, diversified, infinitely paginated video reels
  // -------------------------------------------------------------
  const userUid = url.searchParams.get('userUid') || null;
  const deviceId = url.searchParams.get('deviceId') || null;
  const userOrDeviceId = userUid || deviceId;
  const startId = (url.searchParams.get('startId') || url.searchParams.get('videoId') || '').split('_loop_')[0];
  const cursor = parseInt(url.searchParams.get('cursor') || '0') || 0;
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '10'), 3), 25);
  const now = Date.now();

  try {
    // 1. Fetch all candidate video rows from Turso images table
    const allImagesRes = await db.execute(`SELECT * FROM images ORDER BY uploadedAt DESC`);
    const candidateVideos = allImagesRes.rows.filter(img => {
      const urlStr = (img.imageUrl || '').toLowerCase();
      let flags = [];
      try { flags = typeof img.flags === 'string' ? JSON.parse(img.flags) : (img.flags || []); } catch {}
      const isFlagVideo = Array.isArray(flags) && flags.some(f => typeof f === 'string' && /video|reels|reel/i.test(f));
      return VIDEO_REGEX.test(urlStr) || 
             urlStr.includes('.mp4') || 
             urlStr.includes('.webm') || 
             urlStr.includes('.mov') || 
             urlStr.includes('.m4v') || 
             isFlagVideo;
    });

    if (candidateVideos.length === 0) {
      return Response.json({ success: true, reels: [], nextCursor: null, hasMore: false }, { headers: corsHeaders });
    }

    // 2. Fetch User Taste Weights
    const tasteMap = {
      tag: new Map(),
      concept: new Map(),
      creator: new Map()
    };
    if (userOrDeviceId) {
      try {
        const tasteRes = await db.execute({
          sql: `SELECT key_type, key, weight, updated_at FROM user_taste WHERE user_or_device_id = ?`,
          args: [userOrDeviceId]
        });
        tasteRes.rows.forEach(r => {
          const deltaT = Math.max(now - (parseInt(r.updated_at) || now), 0);
          const decayed = (parseFloat(r.weight) || 0) * Math.exp(-REELS_ALGO_CONFIG.decay_lambda * deltaT);
          if (tasteMap[r.key_type]) {
            tasteMap[r.key_type].set(r.key.toLowerCase(), decayed);
          }
        });
      } catch (err) {}
    }

    // 3. Fetch Followed Creators
    const followedSet = new Set();
    if (userUid) {
      try {
        const followRes = await db.execute({
          sql: `SELECT followingUid FROM follows WHERE followerUid = ?`,
          args: [userUid]
        });
        followRes.rows.forEach(r => followedSet.add(r.followingUid));
      } catch (err) {}
    }

    // 4. Fetch Liked Video IDs for user (both from likes table and reel_events)
    const likedSet = new Set();
    if (userUid) {
      try {
        const likesRes = await db.execute({
          sql: `SELECT imageId FROM likes WHERE userUid = ?`,
          args: [userUid]
        });
        likesRes.rows.forEach(r => likedSet.add(r.imageId));
      } catch (err) {}
    }

    // 5. Fetch comprehensive watch history for user/device (last 30 days)
    // and parse client-reported session seen IDs
    const clientSeenParam = url.searchParams.get('seenIds') || '';
    const clientSeenSet = new Set(
      clientSeenParam.split(',').map(s => s.trim().split('_loop_')[0].split('_rel_loop_')[0]).filter(Boolean)
    );

    const seenInfoMap = new Map(); // videoId -> { count, completed, watchMs, lastSeen, liked }
    if (userOrDeviceId) {
      try {
        const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);
        const seenRes = await db.execute({
          sql: `SELECT video_id, 
                       COUNT(*) as cnt, 
                       MAX(completed) as was_completed, 
                       MAX(liked) as was_liked,
                       MAX(watch_ms) as max_watch,
                       MAX(timestamp) as last_seen
                FROM reel_events 
                WHERE user_or_device_id = ? AND timestamp > ? 
                GROUP BY video_id`,
          args: [userOrDeviceId, thirtyDaysAgo]
        });
        seenRes.rows.forEach(r => {
          seenInfoMap.set(r.video_id, {
            count: parseInt(r.cnt) || 1,
            completed: parseInt(r.was_completed) || 0,
            watchMs: parseInt(r.max_watch) || 0,
            lastSeen: parseInt(r.last_seen) || now,
            liked: parseInt(r.was_liked) || 0
          });
          if (parseInt(r.was_liked) === 1) {
            likedSet.add(r.video_id);
          }
        });
      } catch (err) {}
    }

    // 6. Global Popularity normalization stats
    let maxLikes = 1;
    let maxDownloads = 1;
    candidateVideos.forEach(v => {
      maxLikes = Math.max(maxLikes, parseInt(v.likeCount) || 0);
      maxDownloads = Math.max(maxDownloads, parseInt(v.downloadCount) || 0);
    });

    // 7. Score every candidate reel with AGGRESSIVE anti-repeat penalties:
    const scoredList = candidateVideos.map(vid => {
      let tags = [];
      let concepts = [];
      try { tags = vid.flags ? JSON.parse(vid.flags) : []; } catch {}
      try { concepts = vid.aiConcepts ? JSON.parse(vid.aiConcepts) : []; } catch {}

      // a) Taste sum
      let tasteScore = 0;
      tags.forEach(t => {
        if (t) tasteScore += (tasteMap.tag.get(t.toLowerCase()) || 0);
      });
      concepts.forEach(c => {
        if (c) tasteScore += (tasteMap.concept.get(c.toLowerCase()) || 0);
      });
      if (vid.uploaderUid) {
        tasteScore += (tasteMap.creator.get(vid.uploaderUid) || 0);
      }

      // b) Creator affinity
      const creatorAffinity = followedSet.has(vid.uploaderUid) ? 2.5 : 0;

      // c) Normalized popularity
      const normLikes = (parseInt(vid.likeCount) || 0) / maxLikes;
      const normDownloads = (parseInt(vid.downloadCount) || 0) / maxDownloads;
      const popularity = (normLikes * 0.7) + (normDownloads * 0.3);

      // d) Freshness (decay over 72h) + Immediate New Upload Priority
      let uploadTime = now;
      try { uploadTime = new Date(vid.uploadedAt).getTime() || now; } catch {}
      const ageHours = Math.max((now - uploadTime) / (3600 * 1000), 0);
      const freshness = Math.max(0, 1.0 - (ageHours / 72.0));
      // Give brand new uploads (e.g. within 24 hours) an extra instant discovery push!
      const isVeryRecent = ageHours <= 24;
      const recentBonus = isVeryRecent ? (3.0 * (1.0 - (ageHours / 24.0))) : 0.0;

      // e) AGGRESSIVE ANTI-REPEAT PENALTIES
      // 1. Liked penalty: videos already liked should NEVER repeat in discovery feed
      const isLiked = likedSet.has(vid.id);
      const likedPenalty = isLiked ? 600.0 : 0.0;

      // 2. Watched / Seen penalty
      const inClientSeen = clientSeenSet.has(vid.id);
      const seenInfo = seenInfoMap.get(vid.id);
      const seenCount = (seenInfo ? seenInfo.count : 0) + (inClientSeen ? 1 : 0);
      let seenPenalty = 0;

      if (seenCount > 0) {
        const timeSince = seenInfo?.lastSeen ? (now - seenInfo.lastSeen) : 0;
        if (inClientSeen || timeSince < 2 * 3600 * 1000) {
          // Seen in current session or within last 2 hours: absolute maximum penalty
          seenPenalty = 300.0;
        } else if (timeSince < 24 * 3600 * 1000) {
          // Seen in last 24h
          seenPenalty = 180.0 + (seenCount * 40.0);
        } else if (timeSince < 7 * 86400 * 1000) {
          // Seen in last 7 days
          seenPenalty = 90.0 + (seenCount * 25.0);
        } else {
          // Older history
          seenPenalty = 50.0 * seenCount;
        }

        // Additional penalty if user completed video or watched > 6 seconds
        if (seenInfo?.completed || (seenInfo?.watchMs && seenInfo.watchMs > 6000)) {
          seenPenalty += 60.0;
        }
      }

      // f) Deterministic jitter
      const jitter = deterministicJitter(vid.id);

      const totalScore = tasteScore 
        + (REELS_ALGO_CONFIG.alpha * creatorAffinity)
        + (REELS_ALGO_CONFIG.beta * popularity)
        + (REELS_ALGO_CONFIG.gamma * freshness)
        + recentBonus
        - seenPenalty
        - likedPenalty
        + jitter;

      const isUnseen = !isLiked && seenCount === 0 && !inClientSeen;

      return {
        video: vid,
        tags,
        concepts,
        totalScore,
        tasteScore,
        creatorAffinity,
        popularity,
        freshness,
        seenCount,
        isLiked,
        isUnseen,
        seenPenalty,
        likedPenalty
      };
    });

    // 8. Strict Unseen-First Feed Partition:
    // Sort all candidates by totalScore
    scoredList.sort((a, b) => b.totalScore - a.totalScore);

    const unseenList = scoredList.filter(s => s.isUnseen);
    const seenList = scoredList.filter(s => !s.isUnseen);

    // Feed Mixing Pools:
    // Build from unseen candidates first to guarantee zero repetition!
    const activePool = unseenList.length >= limit ? unseenList : scoredList;

    const personalizedPool = [...activePool];
    const explorePool = [...activePool].sort((a, b) => {
      const aExplore = a.popularity - (a.tasteScore * 0.5);
      const bExplore = b.popularity - (b.tasteScore * 0.5);
      return bExplore - aExplore;
    });
    const freshPool = [...activePool].sort((a, b) => b.freshness - a.freshness);

    // 9. Diverse assembly enforcing creator diversity & unseen priority:
    // Max 2 reels from the same creator in any 5 consecutive reels!
    const finalSelection = [];
    const usedIds = new Set();
    const recentCreators = []; // sliding window of 5

    // If a startId was requested (e.g. user tapped "Open in Reels" on a specific video), insert it first!
    if (startId && cursor === 0) {
      const matchStart = scoredList.find(s => s.video.id === startId);
      if (matchStart) {
        finalSelection.push(matchStart);
        usedIds.add(matchStart.video.id);
        recentCreators.push(matchStart.video.uploaderUid);
      }
    }

    let pIdx = 0, eIdx = 0, fIdx = 0;
    const targetCount = candidateVideos.length;

    while (finalSelection.length < targetCount) {
      let candidate = null;
      const slotMod = finalSelection.length % 10;

      // Slot 0-6: Personalized (70%)
      // Slot 7-8: Exploration (20%)
      // Slot 9: Fresh/Trending (10%)
      if (slotMod < 7) {
        while (pIdx < personalizedPool.length && usedIds.has(personalizedPool[pIdx].video.id)) pIdx++;
        candidate = personalizedPool[pIdx++] || null;
      } else if (slotMod < 9) {
        while (eIdx < explorePool.length && usedIds.has(explorePool[eIdx].video.id)) eIdx++;
        candidate = explorePool[eIdx++] || null;
      } else {
        while (fIdx < freshPool.length && usedIds.has(freshPool[fIdx].video.id)) fIdx++;
        candidate = freshPool[fIdx++] || null;
      }

      // Fallback: pick next highest unused unseen video, then next highest scored
      if (!candidate) {
        candidate = unseenList.find(s => !usedIds.has(s.video.id)) || scoredList.find(s => !usedIds.has(s.video.id));
      }
      if (!candidate) break; // All videos exhausted

      // Check Creator Diversity: no more than 2 in last 5
      const creatorCount = recentCreators.slice(-4).filter(c => c === candidate.video.uploaderUid).length;
      if (creatorCount >= 2 && scoredList.some(s => !usedIds.has(s.video.id) && s.video.uploaderUid !== candidate.video.uploaderUid)) {
        const alt = scoredList.find(s => !usedIds.has(s.video.id) && s.video.uploaderUid !== candidate.video.uploaderUid);
        if (alt) candidate = alt;
      }

      usedIds.add(candidate.video.id);
      recentCreators.push(candidate.video.uploaderUid);
      if (recentCreators.length > 5) recentCreators.shift();
      finalSelection.push(candidate);
    }

    // 10. Slice for cursor-based pagination
    const paged = finalSelection.slice(cursor, cursor + limit);
    const nextCursor = (cursor + limit < finalSelection.length) ? (cursor + limit) : null;

    // 11. Format final response
    const reels = paged.map(item => {
      const v = item.video;
      return {
        id: v.id,
        videoUrl: v.imageUrl,
        poster: v.thumbnailUrl || v.imageUrl, // Will be paired with DARK_VIDEO_POSTER
        width: v.width || 1080,
        height: v.height || 1920,
        duration: v.duration || 15,
        title: v.title || 'Reels',
        description: v.description || '',
        uploaderUid: v.uploaderUid,
        uploaderName: v.uploaderName || 'Creator',
        uploaderPhotoURL: v.uploaderPhotoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${v.uploaderName || 'Creator'}`,
        tags: item.tags,
        concepts: item.concepts,
        likeCount: parseInt(v.likeCount) || 0,
        commentCount: parseInt(v.commentCount) || 0,
        shareCount: parseInt(v.shareCount) || 0,
        hasLiked: likedSet.has(v.id),
        hasSaved: likedSet.has(v.id), // Synced with saves
        isFollowing: followedSet.has(v.uploaderUid),
        uploadedAt: v.uploadedAt,
        // Debug metadata for verification
        _debugScore: {
          total: Math.round(item.totalScore * 100) / 100,
          taste: Math.round(item.tasteScore * 100) / 100,
          creator: Math.round(item.creatorAffinity * 100) / 100,
          popularity: Math.round(item.popularity * 100) / 100,
          freshness: Math.round(item.freshness * 100) / 100,
          seenCount: item.seenCount
        }
      };
    });

    return Response.json({
      success: true,
      reels,
      nextCursor,
      hasMore: nextCursor !== null
    }, { headers: corsHeaders });

  } catch (err) {
    console.error("[Reels Feed Error]:", err);
    return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
  }
}
