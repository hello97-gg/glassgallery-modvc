import { auth } from './firebase';

const SESSION_VIEWED_KEY = 'gg_session_viewed_images';

/**
 * Retrieves the current user's UID or generates a stable anonymous device ID.
 * This guarantees guest visitors' impressions are counted accurately without skewing user data.
 */
export const getViewerId = (): string => {
  if (auth.currentUser?.uid) {
    return auth.currentUser.uid;
  }
  try {
    let anon = localStorage.getItem('gg_anon_viewer_uid');
    if (!anon) {
      anon = 'anon_' + Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
      localStorage.setItem('gg_anon_viewer_uid', anon);
    }
    return anon;
  } catch {
    return 'anon_guest';
  }
};

/**
 * Gets the set of image IDs already viewed in this browser session.
 */
const getSessionViewedSet = (): Set<string> => {
  try {
    const raw = sessionStorage.getItem(SESSION_VIEWED_KEY);
    if (raw) return new Set(JSON.parse(raw));
  } catch {}
  return new Set();
};

/**
 * Marks an image ID as viewed in the current session.
 */
const markSessionViewed = (baseId: string): void => {
  try {
    const set = getSessionViewedSet();
    set.add(baseId);
    sessionStorage.setItem(SESSION_VIEWED_KEY, JSON.stringify(Array.from(set)));
  } catch {}
};

// Internal batching buffer
let pendingQueue: string[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Flushes all queued impressions in a single batch request to the server.
 */
export const flushImpressionQueue = async (): Promise<void> => {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (pendingQueue.length === 0) return;

  const toSend = Array.from(new Set(pendingQueue));
  pendingQueue = [];

  const userUid = getViewerId();

  try {
    const payload = JSON.stringify({
      imageIds: toSend,
      userUid
    });

    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const blob = new Blob([payload], { type: 'application/json' });
      const ok = navigator.sendBeacon('/api/images?action=batch_views', blob);
      if (!ok) {
        await fetch('/api/images?action=batch_views', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          keepalive: true
        });
      }
    } else {
      await fetch('/api/images?action=batch_views', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload
      });
    }
  } catch (err) {
    // Silent fail for non-critical impression metrics
  }
};

// Automatically flush queue when user changes tabs, locks screen, or leaves the site
if (typeof window !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flushImpressionQueue();
    }
  });
  window.addEventListener('beforeunload', () => {
    flushImpressionQueue();
  });
}

/**
 * Queues a view impression for an image/video displayed on the feed screen.
 * Follows the Media Rating Council (MRC) viewability standard (at least 50% in view for >= 1s).
 * Deduplicates per session so repeated scrolling doesn't spam views.
 *
 * @param imageId The ID of the image or video post
 * @returns boolean - true if this was a new, recorded impression; false if already viewed in this session
 */
export const recordFeedImpression = (imageId: string): boolean => {
  if (!imageId) return false;
  const baseId = imageId.split('_loop_')[0];
  const viewed = getSessionViewedSet();
  if (viewed.has(baseId)) {
    return false;
  }

  markSessionViewed(baseId);
  pendingQueue.push(baseId);

  // Debounce batch sending every 3.5 seconds
  if (!flushTimer) {
    flushTimer = setTimeout(flushImpressionQueue, 3500);
  }

  return true;
};
