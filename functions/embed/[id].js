import { getDb } from "../api/lib/turso.js";
import { getEmbedSigningSecret, signMediaUrl, isFreeLicense } from "../api/lib/embedCrypto.js";

function escapeHtml(unsafe) {
  if (!unsafe) return "";
  return unsafe.toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const GG_LOGO_BASE64 = "data:image/png;base64,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";

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // Extract post ID from path /embed/:id
  const pathMatch = url.pathname.match(/\/embed\/([^/?#]+)/i);
  const idParam = context.params?.id || (pathMatch ? pathMatch[1] : null);
  const cleanId = idParam ? decodeURIComponent(idParam).split('_loop_')[0].split('?')[0].replace(/\.html?$/i, '').trim() : "";

  // Common headers for embed responses
  const baseHeaders = {
    'Content-Type': 'text/html; charset=UTF-8',
    'Content-Security-Policy': "default-src 'self' 'unsafe-inline' 'unsafe-eval' https: data: blob: https://cdn.modvc.org https://gg.modvc.org; frame-ancestors *;",
    'X-Robots-Tag': 'noindex, follow',
    'Cache-Control': 'public, max-age=60, s-maxage=120'
  };

  const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  const siteOrigin = isLocal ? url.origin : 'https://gg.modvc.org';

  // Rate Limiting check (per-IP bucket in Redis if available)
  const clientIp = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'unknown';
  if (env?.REDIS_URL && env?.REDIS_AUTH && clientIp !== 'unknown') {
    try {
      const rateKey = `rate:embed:${clientIp.split(',')[0].trim()}`;
      const incrUrl = `${env.REDIS_URL}/INCR/${encodeURIComponent(rateKey)}`;
      const res = await fetch(incrUrl, { headers: { 'Authorization': env.REDIS_AUTH } });
      const data = await res.json();
      if (data?.result === 1) {
        const expUrl = `${env.REDIS_URL}/EXPIRE/${encodeURIComponent(rateKey)}/60`;
        context.waitUntil(fetch(expUrl, { headers: { 'Authorization': env.REDIS_AUTH } }));
      } else if (data?.result > 120) {
        return new Response(`<!DOCTYPE html><html><body style="background:#000;color:#aaa;font-family:sans-serif;text-align:center;padding:2rem;"><h3>429 Too Many Requests</h3></body></html>`, {
          status: 429,
          headers: { ...baseHeaders, 'Retry-After': '60' }
        });
      }
    } catch (e) {
      // Gracefully continue
    }
  }

  if (!cleanId) {
    return renderUnavailablePage("Post Not Specified", "No valid post identifier was provided.", siteOrigin, baseHeaders, 400);
  }

  try {
    const db = getDb(env);
    let postRes = await db.execute({
      sql: `SELECT i.*, 
                   c.slug as community_slug,
                   c.name as community_name,
                   c.type as community_type
            FROM images i
            LEFT JOIN communities c ON i.community_id = c.id
            WHERE i.id = ? LIMIT 1`,
      args: [cleanId]
    });

    if (postRes.rows.length === 0) {
      postRes = await db.execute({
        sql: `SELECT i.*, 
                     c.slug as community_slug,
                     c.name as community_name,
                     c.type as community_type
              FROM images i
              LEFT JOIN communities c ON i.community_id = c.id
              WHERE LOWER(i.id) = LOWER(?) LIMIT 1`,
        args: [cleanId]
      });
    }

    if (postRes.rows.length === 0) {
      return renderUnavailablePage("Post unavailable", "This post does not exist or may have been removed.", siteOrigin, baseHeaders, 404);
    }

    const post = postRes.rows[0];

    // Check post visibility: private communities, removed, pending approval
    if (post.mod_status === 'removed' || post.mod_status === 'pending_approval') {
      return renderUnavailablePage("Post unavailable", "This content has been removed or is pending moderation approval.", siteOrigin, baseHeaders, 404);
    }
    if (post.community_id && post.community_type === 'private') {
      return renderUnavailablePage("Private Post", "Playback on external websites has been disabled because this post belongs to a private community.", siteOrigin, baseHeaders, 403);
    }

    // Register Embed View (batching in Redis or Turso)
    const embedViewerUid = 'embed_' + Math.random().toString(36).substring(2, 10);
    const viewedAt = new Date().toISOString();
    context.waitUntil((async () => {
      try {
        if (env?.REDIS_URL && env?.REDIS_AUTH) {
          const payload = JSON.stringify({
            userUid: embedViewerUid,
            imageId: post.id,
            viewedAt,
            source: 'embed'
          });
          const redisUrl = `${env.REDIS_URL}/LPUSH/pending_views/${encodeURIComponent(payload)}`;
          await fetch(redisUrl, { headers: { 'Authorization': env.REDIS_AUTH } });
        } else {
          await db.execute({
            sql: "INSERT OR IGNORE INTO views (userUid, imageId, viewedAt) VALUES (?, ?, ?)",
            args: [embedViewerUid, post.id, viewedAt]
          });
        }
      } catch (err) {
        console.error("[Embed View Tracker] Failed to log embed view:", err);
      }
    })());

    // Generate short-lived HMAC signed media URL (expires in 2 hours = 7200s)
    const signingSecret = getEmbedSigningSecret(env);
    const exp = Math.floor(Date.now() / 1000) + 7200;
    const sig = await signMediaUrl(post.id, exp, signingSecret);
    const signedMediaSrc = `${siteOrigin}/api/images?action=render&imageId=${encodeURIComponent(post.id)}&exp=${exp}&sig=${sig}`;

    const isVideo = Boolean(
      post.isVideo ||
      (post.imageUrl && post.imageUrl.match(/\.(mp4|webm|mov|m4v)(\?.*)?$/i))
    );

    const title = post.title || (isVideo ? "Untitled Video" : "Untitled Artwork");
    const creator = post.uploaderName || "Glass Gallery Creator";
    const creatorAvatar = post.uploaderPhotoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(creator)}`;
    const postPageUrl = `${siteOrigin}/image/${post.id}`;
    const isOpenLicense = isFreeLicense(post.license);

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>${escapeHtml(title)} | Glass Gallery</title>
  <meta name="robots" content="noindex, follow">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 100%; height: 100%;
      background: #000; color: #fff;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      overflow: hidden;
      user-select: none; -webkit-user-select: none;
    }
    a { color: inherit; text-decoration: none; }
    button { background: none; border: none; color: inherit; cursor: pointer; outline: none; font-family: inherit; }

    /* Player Root Fills Iframe */
    .player-root {
      position: relative;
      width: 100%; height: 100%;
      background: #000;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }

    /* Media Element */
    .main-media {
      width: 100%; height: 100%;
      object-fit: contain;
      background: #000;
      display: block;
    }
    video.main-media::-webkit-media-controls { display: none !important; }

    /* Transparent Guard Overlay for Images */
    .image-guard {
      position: absolute;
      inset: 0;
      z-index: 5;
      background: transparent;
      pointer-events: auto;
    }

    /* Scrim Gradients */
    .scrim-top {
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 110px;
      background: linear-gradient(180deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.45) 55%, transparent 100%);
      pointer-events: none;
      z-index: 10;
      transition: opacity 0.25s ease;
    }
    .scrim-bottom {
      position: absolute;
      bottom: 0; left: 0; right: 0;
      height: 120px;
      background: linear-gradient(0deg, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.55) 55%, transparent 100%);
      pointer-events: none;
      z-index: 10;
      transition: opacity 0.25s ease;
    }

    /* Overlays Layer */
    .overlay-layer {
      position: absolute;
      inset: 0;
      z-index: 15;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 12px 16px;
      pointer-events: none;
      transition: opacity 0.25s ease;
    }
    .overlay-layer.hidden {
      opacity: 0;
    }
    .overlay-layer.hidden * {
      pointer-events: none !important;
    }
    .interactive {
      pointer-events: auto;
    }

    /* Top Bar */
    .top-row {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      width: 100%;
    }
    .creator-info {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
      flex: 1;
    }
    .creator-avatar {
      width: 38px; height: 38px;
      border-radius: 50%;
      object-fit: cover;
      flex-shrink: 0;
      border: 1.5px solid rgba(255,255,255,0.25);
      background: #222;
      box-shadow: 0 2px 8px rgba(0,0,0,0.5);
    }
    .header-text {
      min-width: 0;
      flex: 1;
    }
    .post-title {
      font-size: 14px;
      font-weight: 700;
      color: #fff;
      line-height: 1.25;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      text-shadow: 0 1px 4px rgba(0,0,0,0.9);
      transition: color 0.15s;
    }
    .post-title:hover {
      color: #f5c3b8;
    }
    .creator-name {
      font-size: 12px;
      color: #cbd5e1;
      margin-top: 2px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      text-shadow: 0 1px 3px rgba(0,0,0,0.9);
    }

    .top-right-tools {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }
    .icon-btn {
      width: 36px; height: 36px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      background: rgba(0,0,0,0.25);
      backdrop-filter: blur(8px);
      transition: background 0.18s, transform 0.18s, color 0.18s;
    }
    .icon-btn:hover {
      background: rgba(255,255,255,0.2);
      color: #f5c3b8;
      transform: scale(1.08);
    }
    .icon-btn svg {
      width: 20px; height: 20px;
      fill: currentColor;
    }

    /* Center Play / Replay Button (YouTube Style) */
    .center-btn-wrap {
      position: absolute;
      top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      z-index: 20;
      pointer-events: auto;
      transition: opacity 0.2s ease, transform 0.2s ease;
    }
    .center-btn {
      width: 64px; height: 64px;
      border-radius: 50%;
      background: rgba(18, 18, 24, 0.85);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.25);
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 8px 30px rgba(0,0,0,0.7);
      transition: transform 0.18s ease, background 0.18s ease;
    }
    .center-btn:hover {
      transform: scale(1.1);
      background: rgba(245, 195, 184, 0.3);
      border-color: #f5c3b8;
    }
    .center-btn svg {
      width: 28px; height: 28px;
      fill: #fff;
    }
    .center-btn-wrap.hidden {
      opacity: 0;
      pointer-events: none;
      transform: translate(-50%, -50%) scale(0.9);
    }

    /* Double Tap Seek Feedback Ripple */
    .seek-ripple {
      position: absolute;
      top: 0; bottom: 0; width: 40%;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 25;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.25s;
    }
    .seek-ripple.left { left: 0; }
    .seek-ripple.right { right: 0; }
    .seek-badge {
      background: rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(8px);
      padding: 10px 16px;
      border-radius: 999px;
      font-size: 13px;
      font-weight: 700;
      color: #fff;
      border: 1px solid rgba(255, 255, 255, 0.2);
    }

    /* Bottom Scrubber & Controls */
    .bottom-block {
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .scrubber-container {
      width: 100%;
      height: 18px;
      display: flex;
      align-items: center;
      cursor: pointer;
      position: relative;
    }
    .scrubber-track {
      width: 100%;
      height: 3px;
      background: rgba(255, 255, 255, 0.28);
      border-radius: 2px;
      position: relative;
      transition: height 0.15s ease;
    }
    .scrubber-container:hover .scrubber-track,
    .scrubber-container.dragging .scrubber-track {
      height: 5px;
    }
    .scrubber-buffered {
      position: absolute;
      top: 0; left: 0; bottom: 0;
      background: rgba(255, 255, 255, 0.45);
      border-radius: 2px;
      width: 0%;
    }
    .scrubber-playhead {
      position: absolute;
      top: 0; left: 0; bottom: 0;
      background: #f5c3b8;
      border-radius: 2px;
      width: 0%;
    }
    .scrubber-knob {
      position: absolute;
      top: 50%;
      right: -6px;
      transform: translateY(-50%) scale(0);
      width: 12px; height: 12px;
      border-radius: 50%;
      background: #fff;
      box-shadow: 0 0 6px rgba(0,0,0,0.8);
      transition: transform 0.15s;
    }
    .scrubber-container:hover .scrubber-knob,
    .scrubber-container.dragging .scrubber-knob {
      transform: translateY(-50%) scale(1);
    }

    .bottom-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      width: 100%;
    }
    .bottom-left, .bottom-right {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .time-readout {
      font-size: 11px;
      font-weight: 500;
      color: #e2e8f0;
      font-variant-numeric: tabular-nums;
      margin-left: 2px;
      text-shadow: 0 1px 3px rgba(0,0,0,0.8);
    }

    /* "More Videos" Pill Button (YouTube style at bottom-right) */
    .more-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(24, 24, 32, 0.75);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      border: 1px solid rgba(255, 255, 255, 0.18);
      color: #fff;
      font-size: 11px;
      font-weight: 600;
      padding: 3px 9px 3px 4px;
      border-radius: 999px;
      transition: background 0.18s, transform 0.18s, border-color 0.18s;
      cursor: pointer;
    }
    .more-pill:hover {
      background: rgba(40, 40, 52, 0.95);
      border-color: #f5c3b8;
      transform: translateY(-1px);
    }
    .more-pill-thumb {
      width: 22px; height: 16px;
      border-radius: 4px;
      object-fit: cover;
      background: #333;
      display: block;
    }

    /* Glass Gallery Official Logo (YouTube style at bottom-right) */
    .brand-link {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      opacity: 0.78;
      transition: opacity 0.2s, transform 0.2s;
      cursor: pointer;
    }
    .brand-link:hover {
      opacity: 1;
      transform: scale(1.05);
    }
    .brand-img {
      width: 20px; height: 20px;
      border-radius: 4px;
      display: block;
      object-fit: contain;
    }
    .brand-wordmark {
      font-size: 12px;
      font-weight: 800;
      color: #fff;
      letter-spacing: -0.2px;
      text-shadow: 0 1px 3px rgba(0,0,0,0.9);
    }
    @media (max-width: 480px) {
      .brand-wordmark { display: none; }
    }

    /* Full-Player "More Like This" Overlay Panel */
    .more-panel {
      position: absolute;
      inset: 0;
      z-index: 40;
      background: rgba(10, 10, 15, 0.95);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      display: flex;
      flex-direction: column;
      padding: 16px 20px;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.25s ease;
      overflow-y: auto;
    }
    .more-panel.active {
      opacity: 1;
      pointer-events: auto;
    }
    .panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 14px;
    }
    .panel-title {
      font-size: 15px;
      font-weight: 700;
      color: #fff;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .panel-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      width: 100%;
    }
    @media (max-width: 520px) {
      .panel-grid {
        grid-template-columns: repeat(2, 1fr);
        gap: 8px;
      }
    }
    .panel-card {
      background: rgba(25, 25, 35, 0.8);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 10px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      transition: transform 0.2s, border-color 0.2s;
      cursor: pointer;
    }
    .panel-card:hover {
      transform: translateY(-2px);
      border-color: #f5c3b8;
    }
    .card-thumb-wrap {
      width: 100%;
      aspect-ratio: 16 / 9;
      background: #14141c;
      position: relative;
      overflow: hidden;
    }
    .card-thumb-wrap img,
    .card-thumb-wrap video {
      width: 100%; height: 100%;
      object-fit: cover;
      display: block;
    }
    .card-fallback {
      width: 100%; height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #181822;
      color: #94a3b8;
      font-size: 11px;
      padding: 8px;
      text-align: center;
    }
    .card-video-badge {
      position: absolute;
      bottom: 5px; right: 5px;
      background: rgba(0,0,0,0.75);
      border: 1px solid rgba(255,255,255,0.2);
      border-radius: 4px;
      padding: 1px 5px;
      font-size: 9px;
      font-weight: 700;
      color: #fff;
    }
    .card-info {
      padding: 8px 10px;
    }
    .card-title {
      font-size: 11px;
      font-weight: 600;
      color: #fff;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .card-creator {
      font-size: 10px;
      color: #94a3b8;
      margin-top: 2px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* Share Dialog (YouTube style center popup) */
    .share-modal {
      position: absolute;
      inset: 0;
      z-index: 50;
      background: rgba(0,0,0,0.75);
      backdrop-filter: blur(10px);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 14px;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.2s ease;
    }
    .share-modal.active {
      opacity: 1;
      pointer-events: auto;
    }
    .share-box {
      background: rgba(28, 28, 38, 0.98);
      border: 1px solid rgba(255, 255, 255, 0.16);
      border-radius: 16px;
      padding: 18px 20px;
      width: 100%;
      max-width: 360px;
      box-shadow: 0 16px 40px rgba(0,0,0,0.8);
    }
    .share-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
    }
    .share-header h3 {
      font-size: 15px;
      font-weight: 700;
      color: #fff;
    }
    .copy-row {
      display: flex;
      align-items: center;
      gap: 6px;
      background: #12121a;
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 8px;
      padding: 4px 6px 4px 10px;
      margin-bottom: 14px;
    }
    .copy-input {
      flex: 1;
      background: none;
      border: none;
      color: #cbd5e1;
      font-size: 11px;
      outline: none;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .btn-copy {
      background: #f5c3b8;
      color: #0f0f14;
      font-size: 11px;
      font-weight: 700;
      padding: 6px 12px;
      border-radius: 6px;
      transition: opacity 0.15s;
    }
    .btn-copy:hover { opacity: 0.9; }
    .social-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
      max-height: 180px;
      overflow-y: auto;
      margin-bottom: 12px;
    }
    .social-btn {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 10px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      color: #e2e8f0;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.08);
      transition: background 0.15s;
    }
    .social-btn:hover {
      background: rgba(255, 255, 255, 0.12);
      color: #f5c3b8;
    }
    .btn-cancel {
      width: 100%;
      text-align: center;
      padding: 8px;
      font-size: 12px;
      font-weight: 600;
      color: #94a3b8;
      transition: color 0.15s;
    }
    .btn-cancel:hover { color: #fff; }

    /* Settings Menu (Speed / Quality) */
    .settings-menu {
      position: absolute;
      top: 50px; right: 16px;
      z-index: 35;
      background: rgba(24, 24, 34, 0.96);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 12px;
      padding: 6px 0;
      width: 170px;
      box-shadow: 0 12px 32px rgba(0,0,0,0.7);
      opacity: 0;
      pointer-events: none;
      transform: translateY(-8px);
      transition: opacity 0.18s, transform 0.18s;
    }
    .settings-menu.active {
      opacity: 1;
      pointer-events: auto;
      transform: translateY(0);
    }
    .menu-section-title {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #94a3b8;
      padding: 6px 14px 4px;
    }
    .menu-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      padding: 6px 14px;
      font-size: 11px;
      color: #e2e8f0;
      transition: background 0.15s;
    }
    .menu-item:hover {
      background: rgba(255, 255, 255, 0.1);
      color: #f5c3b8;
    }
    .menu-item.selected {
      color: #f5c3b8;
      font-weight: 700;
    }
  </style>
</head>
<body>
  <div class="player-root" id="playerRoot" oncontextmenu="return false;">
    ${isVideo ? `
      <video
        id="mediaPlayer"
        class="main-media"
        src="${signedMediaSrc}"
        playsinline
        preload="metadata"
        controlslist="nodownload noplaybackrate"
        disablepictureinpicture
        disableremoteplayback
        oncontextmenu="return false;"
      ></video>

      <!-- Center Play / Replay Button -->
      <div class="center-btn-wrap" id="centerBtnWrap">
        <button class="center-btn" id="centerPlayBtn" aria-label="Play">
          <svg id="centerPlayIcon" viewBox="0 0 24 24"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>
          <svg id="centerReplayIcon" viewBox="0 0 24 24" style="display:none;"><path fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" d="M1 4v6h6M23 20v-6h-6"/><path fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/></svg>
        </button>
      </div>

      <!-- Double Tap Ripples -->
      <div class="seek-ripple left" id="rippleLeft"><span class="seek-badge">-10s</span></div>
      <div class="seek-ripple right" id="rippleRight"><span class="seek-badge">+10s</span></div>
    ` : `
      <img
        id="mediaPlayer"
        class="main-media"
        src="${signedMediaSrc}"
        alt="${escapeHtml(title)}"
        draggable="false"
        oncontextmenu="return false;"
      />
      <div class="image-guard" oncontextmenu="return false;"></div>
    `}

    <!-- Scrim Gradients -->
    <div class="scrim-top" id="scrimTop"></div>
    <div class="scrim-bottom" id="scrimBottom"></div>

    <!-- UI Overlay Layer -->
    <div class="overlay-layer" id="overlayLayer">
      <!-- Top Row -->
      <div class="top-row">
        <div class="creator-info interactive">
          <a href="${postPageUrl}" target="_blank" rel="noopener">
            <img src="${escapeHtml(creatorAvatar)}" class="creator-avatar" alt="${escapeHtml(creator)}" onerror="this.src='https://api.dicebear.com/7.x/initials/svg?seed=GG';" />
          </a>
          <div class="header-text">
            <a href="${postPageUrl}" target="_blank" rel="noopener" class="post-title">${escapeHtml(title)}</a>
            <div class="creator-name">${escapeHtml(creator)}</div>
          </div>
        </div>

        <div class="top-right-tools interactive">
          ${isVideo ? `
            <button class="icon-btn" id="topMuteBtn" aria-label="Mute / Unmute" title="Mute">
              <svg id="volHighIcon" viewBox="0 0 24 24"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
              <svg id="volMuteIcon" viewBox="0 0 24 24" style="display:none;"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>
            </button>
            <button class="icon-btn" id="gearBtn" aria-label="Settings" title="Settings">
              <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
            </button>
          ` : `
            <a href="${postPageUrl}" target="_blank" rel="noopener" class="icon-btn" title="View on Glass Gallery">
              <svg viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
            </a>
          `}
        </div>
      </div>

      <!-- Bottom Block -->
      <div class="bottom-block">
        ${isVideo ? `
          <!-- Thin Scrubber -->
          <div class="scrubber-container interactive" id="scrubber">
            <div class="scrubber-track">
              <div class="scrubber-buffered" id="bufferedBar"></div>
              <div class="scrubber-playhead" id="playheadBar">
                <div class="scrubber-knob"></div>
              </div>
            </div>
          </div>
        ` : ''}

        <div class="bottom-row">
          <div class="bottom-left interactive">
            <!-- Share Icon (Bottom-Left) -->
            <button class="icon-btn" id="shareBtn" aria-label="Share" title="Share">
              <svg viewBox="0 0 24 24"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
            </button>

            ${isVideo ? `
              <button class="icon-btn" id="playPauseBtn" aria-label="Play / Pause" title="Play">
                <svg id="ctrlPlayIcon" viewBox="0 0 24 24"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>
                <svg id="ctrlPauseIcon" viewBox="0 0 24 24" style="display:none;"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
              </button>
              <span class="time-readout" id="timeDisplay">0:00 / 0:00</span>
            ` : ''}
          </div>

          <div class="bottom-right interactive">
            <!-- "More Videos" Pill Button (Bottom-Right, YouTube style) -->
            <button class="more-pill" id="morePillBtn" aria-label="More like this">
              <img id="pillThumbImg" class="more-pill-thumb" alt="" src="" style="display:none;" />
              <span id="morePillText">${isVideo ? 'More videos' : 'More like this'}</span>
            </button>

            <!-- Real Glass Gallery Logo (Bottom-Right) -->
            <a href="${postPageUrl}" target="_blank" rel="noopener" class="brand-link" title="Watch on Glass Gallery">
              <img src="${GG_LOGO_BASE64}" class="brand-img" alt="Glass Gallery" />
              <span class="brand-wordmark">Glass Gallery</span>
            </a>

            ${isVideo ? `
              <button class="icon-btn" id="fsBtn" aria-label="Fullscreen" title="Fullscreen">
                <svg viewBox="0 0 24 24"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>
              </button>
            ` : ''}
          </div>
        </div>
      </div>
    </div>

    <!-- Settings Menu Dropdown (Speed / Quality) -->
    <div class="settings-menu" id="settingsMenu">
      <div class="menu-section-title">Playback Speed</div>
      <button class="menu-item" data-speed="0.5">0.5x</button>
      <button class="menu-item" data-speed="0.75">0.75x</button>
      <button class="menu-item selected" data-speed="1.0">Normal (1x)</button>
      <button class="menu-item" data-speed="1.25">1.25x</button>
      <button class="menu-item" data-speed="1.5">1.5x</button>
      <button class="menu-item" data-speed="2.0">2x</button>
      <div class="menu-section-title" style="margin-top:4px;">Quality</div>
      <div class="menu-item selected" style="cursor:default;">Auto (1080p)</div>
    </div>

    <!-- Share Dialog (YouTube style popup) -->
    <div class="share-modal" id="shareModal">
      <div class="share-box">
        <div class="share-header">
          <h3>Share</h3>
          <button id="closeShareBtn" style="font-size:20px; color:#cbd5e1;">&times;</button>
        </div>
        <div class="copy-row">
          <input type="text" class="copy-input" id="shareUrlInput" readonly value="${postPageUrl}" />
          <button class="btn-copy" id="copyShareBtn">Copy</button>
        </div>
        <div class="social-list">
          <a class="social-btn" href="https://api.whatsapp.com/send?text=${encodeURIComponent(title + ' ' + postPageUrl)}" target="_blank" rel="noopener">WhatsApp</a>
          <a class="social-btn" href="https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(postPageUrl)}" target="_blank" rel="noopener">X (Twitter)</a>
          <a class="social-btn" href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(postPageUrl)}" target="_blank" rel="noopener">Facebook</a>
          <a class="social-btn" href="https://www.reddit.com/submit?url=${encodeURIComponent(postPageUrl)}&title=${encodeURIComponent(title)}" target="_blank" rel="noopener">Reddit</a>
          <a class="social-btn" href="mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(postPageUrl)}" target="_blank" rel="noopener">Email</a>
        </div>
        <button class="btn-cancel" id="cancelShareBtn">Cancel</button>
      </div>
    </div>

    <!-- Full-Player "More Like This" Panel -->
    <div class="more-panel" id="morePanel">
      <div class="panel-header">
        <div class="panel-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polygon points="12 8 8 12 12 16 12 8"></polygon></svg>
          More from Glass Gallery
        </div>
        <button id="closeMorePanel" style="font-size:24px; color:#cbd5e1; padding:4px 8px;">&times;</button>
      </div>
      <div class="panel-grid" id="panelGrid">
        <!-- Injected lazily via JS -->
      </div>
    </div>
  </div>

  <script>
    (function() {
      // Prevent browser default context menu
      document.addEventListener('contextmenu', function(e) { e.preventDefault(); });

      var root = document.getElementById('playerRoot');
      var isVideo = ${isVideo ? 'true' : 'false'};
      var video = document.getElementById('mediaPlayer');
      var overlay = document.getElementById('overlayLayer');
      var scrimTop = document.getElementById('scrimTop');
      var scrimBottom = document.getElementById('scrimBottom');
      var centerBtnWrap = document.getElementById('centerBtnWrap');
      var centerPlayBtn = document.getElementById('centerPlayBtn');
      var centerPlayIcon = document.getElementById('centerPlayIcon');
      var centerReplayIcon = document.getElementById('centerReplayIcon');
      var playPauseBtn = document.getElementById('playPauseBtn');
      var ctrlPlayIcon = document.getElementById('ctrlPlayIcon');
      var ctrlPauseIcon = document.getElementById('ctrlPauseIcon');
      var topMuteBtn = document.getElementById('topMuteBtn');
      var volHighIcon = document.getElementById('volHighIcon');
      var volMuteIcon = document.getElementById('volMuteIcon');
      var gearBtn = document.getElementById('gearBtn');
      var settingsMenu = document.getElementById('settingsMenu');
      var shareBtn = document.getElementById('shareBtn');
      var shareModal = document.getElementById('shareModal');
      var closeShareBtn = document.getElementById('closeShareBtn');
      var cancelShareBtn = document.getElementById('cancelShareBtn');
      var copyShareBtn = document.getElementById('copyShareBtn');
      var shareUrlInput = document.getElementById('shareUrlInput');
      var morePillBtn = document.getElementById('morePillBtn');
      var morePanel = document.getElementById('morePanel');
      var closeMorePanel = document.getElementById('closeMorePanel');
      var panelGrid = document.getElementById('panelGrid');
      var pillThumbImg = document.getElementById('pillThumbImg');
      var scrubber = document.getElementById('scrubber');
      var bufferedBar = document.getElementById('bufferedBar');
      var playheadBar = document.getElementById('playheadBar');
      var timeDisplay = document.getElementById('timeDisplay');
      var fsBtn = document.getElementById('fsBtn');
      var rippleLeft = document.getElementById('rippleLeft');
      var rippleRight = document.getElementById('rippleRight');

      var controlsTimer = null;
      var isEnded = false;
      var isDraggingScrubber = false;

      function showControls() {
        overlay.classList.remove('hidden');
        scrimTop.style.opacity = '1';
        scrimBottom.style.opacity = '1';
        clearTimeout(controlsTimer);
        if (isVideo && video && !video.paused && !isEnded) {
          controlsTimer = setTimeout(function() {
            if (!settingsMenu.classList.contains('active') && !shareModal.classList.contains('active') && !morePanel.classList.contains('active')) {
              overlay.classList.add('hidden');
              scrimTop.style.opacity = '0';
              scrimBottom.style.opacity = '0';
            }
          }, 2500);
        }
      }

      root.addEventListener('mousemove', showControls);

      // Touch & tap behavior (single tap toggles controls; double tap seeks)
      var lastTapTime = 0;
      root.addEventListener('click', function(e) {
        if (e.target.closest('button') || e.target.closest('a') || e.target.closest('.interactive') || e.target.closest('.share-box') || e.target.closest('.settings-menu') || e.target.closest('.more-panel')) {
          return;
        }

        var now = Date.now();
        var diff = now - lastTapTime;
        lastTapTime = now;

        if (isVideo && video && diff < 300) {
          // Double-tap detected
          var rect = root.getBoundingClientRect();
          var tapX = e.clientX - rect.left;
          if (tapX < rect.width * 0.45) {
            // Seek -10s
            video.currentTime = Math.max(0, video.currentTime - 10);
            if (rippleLeft) {
              rippleLeft.style.opacity = '1';
              setTimeout(function(){ rippleLeft.style.opacity = '0'; }, 500);
            }
          } else if (tapX > rect.width * 0.55) {
            // Seek +10s
            video.currentTime = Math.min(video.duration || 0, video.currentTime + 10);
            if (rippleRight) {
              rippleRight.style.opacity = '1';
              setTimeout(function(){ rippleRight.style.opacity = '0'; }, 500);
            }
          }
          return;
        }

        // Single tap: toggle overlay
        if (overlay.classList.contains('hidden')) {
          showControls();
        } else if (isVideo && video && !video.paused) {
          overlay.classList.add('hidden');
          scrimTop.style.opacity = '0';
          scrimBottom.style.opacity = '0';
        }
      });

      // Video Player Logic
      if (isVideo && video) {
        function formatTime(s) {
          if (!s || isNaN(s)) return '0:00';
          var m = Math.floor(s / 60);
          var rem = Math.floor(s % 60);
          return m + ':' + (rem < 10 ? '0' : '') + rem;
        }

        function togglePlay() {
          if (isEnded) {
            isEnded = false;
            video.currentTime = 0;
            video.play().catch(function(){});
            return;
          }
          if (video.paused) {
            video.play().catch(function(){});
          } else {
            video.pause();
          }
        }

        if (centerPlayBtn) centerPlayBtn.addEventListener('click', togglePlay);
        if (playPauseBtn) playPauseBtn.addEventListener('click', togglePlay);

        video.addEventListener('play', function() {
          isEnded = false;
          if (centerBtnWrap) centerBtnWrap.classList.add('hidden');
          if (ctrlPlayIcon) ctrlPlayIcon.style.display = 'none';
          if (ctrlPauseIcon) ctrlPauseIcon.style.display = 'block';
          if (centerPlayIcon) centerPlayIcon.style.display = 'block';
          if (centerReplayIcon) centerReplayIcon.style.display = 'none';
          showControls();
        });

        video.addEventListener('pause', function() {
          if (!isEnded) {
            if (centerBtnWrap) centerBtnWrap.classList.remove('hidden');
            if (centerPlayIcon) centerPlayIcon.style.display = 'block';
            if (centerReplayIcon) centerReplayIcon.style.display = 'none';
          }
          if (ctrlPlayIcon) ctrlPlayIcon.style.display = 'block';
          if (ctrlPauseIcon) ctrlPauseIcon.style.display = 'none';
          showControls();
        });

        video.addEventListener('ended', function() {
          isEnded = true;
          if (centerBtnWrap) centerBtnWrap.classList.remove('hidden');
          if (centerPlayIcon) centerPlayIcon.style.display = 'none';
          if (centerReplayIcon) centerReplayIcon.style.display = 'block';
          if (ctrlPlayIcon) ctrlPlayIcon.style.display = 'block';
          if (ctrlPauseIcon) ctrlPauseIcon.style.display = 'none';
          showControls();
          // Automatically open "More Videos" panel on video end
          if (morePanel) morePanel.classList.add('active');
        });

        video.addEventListener('timeupdate', function() {
          if (!video.duration || isDraggingScrubber) return;
          var pct = (video.currentTime / video.duration) * 100;
          if (playheadBar) playheadBar.style.width = pct + '%';
          if (timeDisplay) timeDisplay.textContent = formatTime(video.currentTime) + ' / ' + formatTime(video.duration);
        });

        video.addEventListener('progress', function() {
          if (video.buffered.length > 0 && video.duration) {
            var bEnd = video.buffered.end(video.buffered.length - 1);
            if (bufferedBar) bufferedBar.style.width = ((bEnd / video.duration) * 100) + '%';
          }
        });

        // Scrubber Seek Dragging
        function handleScrub(e) {
          if (!video.duration || !scrubber) return;
          var rect = scrubber.getBoundingClientRect();
          var clientX = e.touches ? e.touches[0].clientX : e.clientX;
          var pos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
          if (playheadBar) playheadBar.style.width = (pos * 100) + '%';
          video.currentTime = pos * video.duration;
        }

        if (scrubber) {
          scrubber.addEventListener('mousedown', function(e) {
            isDraggingScrubber = true;
            scrubber.classList.add('dragging');
            handleScrub(e);
            function onMouseMove(ev) { if (isDraggingScrubber) handleScrub(ev); }
            function onMouseUp() {
              isDraggingScrubber = false;
              scrubber.classList.remove('dragging');
              window.removeEventListener('mousemove', onMouseMove);
              window.removeEventListener('mouseup', onMouseUp);
            }
            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', onMouseUp);
          });
          scrubber.addEventListener('touchstart', function(e) {
            isDraggingScrubber = true;
            scrubber.classList.add('dragging');
            handleScrub(e);
          }, { passive: true });
          scrubber.addEventListener('touchmove', function(e) {
            if (isDraggingScrubber) handleScrub(e);
          }, { passive: true });
          scrubber.addEventListener('touchend', function() {
            isDraggingScrubber = false;
            scrubber.classList.remove('dragging');
          });
        }

        // Mute Toggle
        function toggleMute() {
          video.muted = !video.muted;
          if (video.muted) {
            volHighIcon.style.display = 'none';
            volMuteIcon.style.display = 'block';
          } else {
            volHighIcon.style.display = 'block';
            volMuteIcon.style.display = 'none';
          }
        }
        if (topMuteBtn) topMuteBtn.addEventListener('click', toggleMute);

        // Fullscreen Toggle
        if (fsBtn) {
          fsBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            if (!document.fullscreenElement) {
              if (root.requestFullscreen) root.requestFullscreen();
              else if (root.webkitRequestFullscreen) root.webkitRequestFullscreen();
            } else {
              if (document.exitFullscreen) document.exitFullscreen();
            }
          });
        }

        // Settings Menu
        if (gearBtn && settingsMenu) {
          gearBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            settingsMenu.classList.toggle('active');
          });
          document.addEventListener('click', function(e) {
            if (!settingsMenu.contains(e.target) && e.target !== gearBtn) {
              settingsMenu.classList.remove('active');
            }
          });
          var speedBtns = settingsMenu.querySelectorAll('[data-speed]');
          speedBtns.forEach(function(btn) {
            btn.addEventListener('click', function() {
              var spd = parseFloat(btn.getAttribute('data-speed'));
              video.playbackRate = spd;
              speedBtns.forEach(function(b){ b.classList.remove('selected'); });
              btn.classList.add('selected');
              settingsMenu.classList.remove('active');
            });
          });
        }

        // Keyboard Controls
        window.addEventListener('keydown', function(e) {
          if (['Space', 'KeyK'].includes(e.code)) {
            e.preventDefault();
            togglePlay();
          } else if (e.code === 'ArrowLeft') {
            e.preventDefault();
            video.currentTime = Math.max(0, video.currentTime - 10);
            showControls();
          } else if (e.code === 'ArrowRight') {
            e.preventDefault();
            video.currentTime = Math.min(video.duration || 0, video.currentTime + 10);
            showControls();
          } else if (e.code === 'ArrowUp') {
            e.preventDefault();
            video.volume = Math.min(1, video.volume + 0.1);
            video.muted = false;
            volHighIcon.style.display = 'block';
            volMuteIcon.style.display = 'none';
            showControls();
          } else if (e.code === 'ArrowDown') {
            e.preventDefault();
            video.volume = Math.max(0, video.volume - 0.1);
            showControls();
          } else if (e.code === 'KeyM') {
            e.preventDefault();
            toggleMute();
          } else if (e.code === 'KeyF') {
            e.preventDefault();
            if (fsBtn) fsBtn.click();
          }
        });
      }

      // Share Modal
      if (shareBtn && shareModal) {
        shareBtn.addEventListener('click', function(e) {
          e.stopPropagation();
          shareModal.classList.add('active');
        });
        if (closeShareBtn) closeShareBtn.addEventListener('click', function() { shareModal.classList.remove('active'); });
        if (cancelShareBtn) cancelShareBtn.addEventListener('click', function() { shareModal.classList.remove('active'); });
        shareModal.addEventListener('click', function(e) {
          if (e.target === shareModal) shareModal.classList.remove('active');
        });
        if (copyShareBtn && shareUrlInput) {
          copyShareBtn.addEventListener('click', function() {
            navigator.clipboard.writeText(shareUrlInput.value).then(function() {
              copyShareBtn.textContent = '✓ Copied!';
              setTimeout(function(){ copyShareBtn.textContent = 'Copy'; }, 2000);
            });
          });
        }
      }

      // More Like This Panel
      if (morePillBtn && morePanel) {
        morePillBtn.addEventListener('click', function(e) {
          e.stopPropagation();
          morePanel.classList.add('active');
        });
        if (closeMorePanel) {
          closeMorePanel.addEventListener('click', function() {
            morePanel.classList.remove('active');
          });
        }
      }

      // Lazy Fetch Suggestions / Related Media
      fetch('${siteOrigin}/api/images?action=suggestions&imageId=' + encodeURIComponent('${post.id}') + '&limit=6')
        .then(function(res) { return res.json(); })
        .then(function(data) {
          if (!data || !data.images || data.images.length === 0) return;

          var valid = data.images.filter(function(img) {
            if (img.isNsfw) return false;
            if (Array.isArray(img.flags) && (img.flags.includes('Flagged') || img.flags.includes('NSFW'))) return false;
            return true;
          }).slice(0, 6);

          if (valid.length === 0) return;

          // Set tiny thumbnail in the "More videos" bottom pill
          var first = valid[0];
          var firstThumb = first.thumbnailUrl || first.imageUrl;
          if (pillThumbImg && firstThumb && !first.isVideo) {
            pillThumbImg.src = firstThumb;
            pillThumbImg.style.display = 'block';
          }

          // Build Panel Cards
          if (panelGrid) {
            panelGrid.innerHTML = '';
            valid.forEach(function(item) {
              var card = document.createElement('a');
              card.className = 'panel-card';
              card.href = '${siteOrigin}/image/' + item.id;
              card.target = '_blank';
              card.rel = 'noopener';

              var thumbWrap = document.createElement('div');
              thumbWrap.className = 'card-thumb-wrap';

              var titleStr = item.title || 'Glass Gallery Artwork';
              var creatorStr = item.uploaderName || 'Creator';
              var isItemVideo = item.isVideo || Boolean(item.imageUrl && item.imageUrl.match(/\\.(mp4|webm|mov|m4v)(\\?.*)?$/i));

              if (isItemVideo) {
                // Video thumbnail: use video tag with preload metadata
                thumbWrap.innerHTML = '<video src="' + item.imageUrl + '#t=0.001" muted playsinline preload="metadata"></video>' +
                                      '<span class="card-video-badge">▶ Video</span>';
              } else {
                // Image thumbnail: image with onerror fallback
                var imgUrl = item.thumbnailUrl || item.imageUrl;
                thumbWrap.innerHTML = '<img src="' + imgUrl + '" loading="lazy" alt="" onerror="this.style.display=\\'none\\';this.nextElementSibling.style.display=\\'flex\\';" />' +
                                      '<div class="card-fallback" style="display:none;"><span>' + escapeHtml(titleStr) + '</span></div>';
              }

              var info = document.createElement('div');
              info.className = 'card-info';
              info.innerHTML = '<div class="card-title">' + escapeHtml(titleStr) + '</div>' +
                               '<div class="card-creator">by ' + escapeHtml(creatorStr) + '</div>';

              card.appendChild(thumbWrap);
              card.appendChild(info);
              panelGrid.appendChild(card);
            });
          }
        })
        .catch(function(err) {
          console.warn("[Embed] Failed to load suggestions:", err);
        });

      showControls();
    })();
  </script>
</body>
</html>`;

    return new Response(html, {
      status: 200,
      headers: baseHeaders
    });

  } catch (err) {
    console.error("[Embed Handler Error]:", err);
    return renderUnavailablePage("Error", "An unexpected error occurred loading this media.", siteOrigin, baseHeaders, 500);
  }
}

function renderUnavailablePage(heading, message, siteOrigin, headers, status = 404) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(heading)} | Glass Gallery</title>
  <meta name="robots" content="noindex, follow">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 100%; height: 100%;
      background: #000; color: #e2e8f0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex; align-items: center; justify-content: center;
      text-align: center; padding: 1.5rem;
    }
    .card {
      max-width: 400px; width: 100%;
      background: rgba(25, 25, 35, 0.85);
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 16px;
      padding: 2.2rem 1.8rem;
      backdrop-filter: blur(14px);
      box-shadow: 0 12px 32px rgba(0,0,0,0.7);
    }
    .icon {
      width: 48px; height: 48px;
      margin: 0 auto 1.2rem;
      border-radius: 50%;
      background: rgba(239, 68, 68, 0.15);
      color: #ef4444;
      display: flex; align-items: center; justify-content: center;
    }
    h2 { font-size: 1.15rem; font-weight: 700; color: #fff; margin-bottom: 0.6rem; }
    p { font-size: 0.88rem; color: #94a3b8; line-height: 1.45; margin-bottom: 1.5rem; }
    .btn {
      display: inline-flex; align-items: center; justify-content: center; gap: 6px;
      background: #f5c3b8; color: #0f0f14;
      font-weight: 700; font-size: 0.85rem;
      padding: 0.65rem 1.4rem; border-radius: 999px;
      text-decoration: none; transition: opacity 0.2s;
    }
    .btn:hover { opacity: 0.9; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>
    </div>
    <h2>${escapeHtml(heading)}</h2>
    <p>${escapeHtml(message)}</p>
    <a href="${siteOrigin}" target="_blank" rel="noopener" class="btn">
      Watch on Glass Gallery
    </a>
  </div>
</body>
</html>`;

  return new Response(html, {
    status,
    headers
  });
}
