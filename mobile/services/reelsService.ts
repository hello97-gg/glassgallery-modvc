import type { ImageMeta } from '../types';

export interface ReelItem {
  id: string;
  videoUrl: string;
  poster?: string;
  width?: number;
  height?: number;
  duration?: number;
  title: string;
  description?: string;
  uploaderUid: string;
  uploaderName: string;
  uploaderPhotoURL?: string;
  tags: string[];
  concepts: string[];
  likeCount: number;
  commentCount: number;
  shareCount: number;
  hasLiked: boolean;
  hasSaved: boolean;
  isFollowing: boolean;
  uploadedAt?: any;
  _debugScore?: {
    total: number;
    taste: number;
    creator: number;
    popularity: number;
    freshness: number;
    seenCount: number;
  };
}

export interface ReelTrackingEvent {
  videoId: string;
  watchMs: number;
  duration: number;
  loops: number;
  liked: boolean;
  saved: boolean;
  shared: boolean;
  commented: boolean;
  muted: boolean;
  tags: string[];
  concepts: string[];
  creatorUid: string;
}

const DEVICE_ID_KEY = 'gg_reels_device_id';
const SESSION_TASTE_KEY = 'gg_reels_session_taste';
const FAST_SKIP_TAGS_KEY = 'gg_reels_fast_skip_tags';

export const getOrCreateDeviceId = (): string => {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = `dev_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return 'dev_ephemeral';
  }
};

// -------------------------------------------------------------------
// In-Session Short-Term Adaptation Engine
// Updates immediately on every swipe to re-rank the next 5 queued reels
// -------------------------------------------------------------------

interface SessionTaste {
  [key: string]: number;
}

export const getSessionTaste = (): SessionTaste => {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_TASTE_KEY) || '{}');
  } catch {
    return {};
  }
};

export const updateSessionTaste = (key: string, delta: number): void => {
  try {
    const taste = getSessionTaste();
    const k = key.toLowerCase().trim();
    taste[k] = (taste[k] || 0) + delta;
    sessionStorage.setItem(SESSION_TASTE_KEY, JSON.stringify(taste));
  } catch {}
};

// Track consecutive fast-skips (< 1.5s) per topic.
// If user fast-skips 3 reels from same topic in a row, reduce topic weight for session.
export const recordTopicSkip = (tags: string[]): void => {
  try {
    const skipCounts: Record<string, number> = JSON.parse(sessionStorage.getItem(FAST_SKIP_TAGS_KEY) || '{}');
    tags.forEach(t => {
      const k = t.toLowerCase().trim();
      skipCounts[k] = (skipCounts[k] || 0) + 1;
      if (skipCounts[k] >= 3) {
        // Fast skip 3 in a row: reduce weight heavily for current session
        updateSessionTaste(k, -3.5);
        if (isReelsDebugEnabled()) {
          console.log(`[Reels Algo] Fast-skipped 3x on "${k}" -> Reduced topic weight for session.`);
        }
      }
    });
    sessionStorage.setItem(FAST_SKIP_TAGS_KEY, JSON.stringify(skipCounts));
  } catch {}
};

export const resetTopicSkip = (tags: string[]): void => {
  try {
    const skipCounts: Record<string, number> = JSON.parse(sessionStorage.getItem(FAST_SKIP_TAGS_KEY) || '{}');
    tags.forEach(t => {
      const k = t.toLowerCase().trim();
      delete skipCounts[k];
    });
    sessionStorage.setItem(FAST_SKIP_TAGS_KEY, JSON.stringify(skipCounts));
  } catch {}
};

// In-session re-ranking of the next 5 queued reels based on instant local signals
export const rerankNextReels = (reels: ReelItem[], startIndex: number): ReelItem[] => {
  if (reels.length <= startIndex + 1) return reels;
  const sessionTaste = getSessionTaste();
  if (Object.keys(sessionTaste).length === 0) return reels;

  const head = reels.slice(0, startIndex);
  const tail = reels.slice(startIndex, startIndex + 6);
  const remaining = reels.slice(startIndex + 6);

  tail.sort((a, b) => {
    let scoreA = 0;
    let scoreB = 0;
    (a.tags || []).forEach(t => { scoreA += (sessionTaste[t.toLowerCase()] || 0); });
    (b.tags || []).forEach(t => { scoreB += (sessionTaste[t.toLowerCase()] || 0); });
    return scoreB - scoreA;
  });

  return [...head, ...tail, ...remaining];
};

// -------------------------------------------------------------------
// Batched Event Tracking Queue
// Flushes every 10s and on page hide via sendBeacon
// -------------------------------------------------------------------

class ReelsTracker {
  private queue: ReelTrackingEvent[] = [];
  private timer: any = null;
  private userUid: string | null = null;
  private deviceId: string = getOrCreateDeviceId();

  constructor() {
    this.startAutoFlush();
    if (typeof window !== 'undefined') {
      window.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
          this.flushBeacon();
        }
      });
      window.addEventListener('pagehide', () => this.flushBeacon());
    }
  }

  public setUserUid(uid: string | null) {
    this.userUid = uid;
  }

  public track(event: ReelTrackingEvent) {
    this.queue.push(event);

    // Instant local adaptation
    const ratio = event.watchMs / (Math.max(event.duration, 0.1) * 1000);
    const isFastSkip = event.watchMs < 1500 && ratio < 0.2 && !event.liked && !event.saved;

    if (isFastSkip) {
      recordTopicSkip(event.tags);
    } else {
      resetTopicSkip(event.tags);
      const delta = (ratio >= 0.5 ? 2.0 : 0.8) + (event.liked ? 3.0 : 0) + (event.saved ? 3.0 : 0);
      event.tags.forEach(t => updateSessionTaste(t, delta));
      if (event.creatorUid) updateSessionTaste(`creator:${event.creatorUid}`, delta * 1.2);
    }

    if (isReelsDebugEnabled()) {
      console.log(`[Reels Tracker] Queued event for "${event.videoId}" (watch: ${event.watchMs}ms, ratio: ${ratio.toFixed(2)}, liked: ${event.liked})`);
    }

    if (this.queue.length >= 10) {
      this.flush();
    }
  }

  private startAutoFlush() {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      if (this.queue.length > 0) {
        this.flush();
      }
    }, 10000); // 10 seconds batch flush
  }

  public async flush(): Promise<void> {
    if (this.queue.length === 0) return;
    const eventsToSend = [...this.queue];
    this.queue = [];

    try {
      const payload = {
        userUid: this.userUid,
        deviceId: this.deviceId,
        events: eventsToSend
      };

      const res = await fetch('/api/reels?action=events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        console.warn("[Reels Tracker] Flush failed status:", res.status);
      }
    } catch (err) {
      console.warn("[Reels Tracker] Flush network error:", err);
    }
  }

  private flushBeacon() {
    if (this.queue.length === 0) return;
    const eventsToSend = [...this.queue];
    this.queue = [];

    const payload = JSON.stringify({
      userUid: this.userUid,
      deviceId: this.deviceId,
      events: eventsToSend
    });

    if (navigator.sendBeacon) {
      const blob = new Blob([payload], { type: 'application/json' });
      navigator.sendBeacon('/api/reels?action=events', blob);
    } else {
      fetch('/api/reels?action=events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true
      }).catch(() => {});
    }
  }
}

export const reelsTracker = new ReelsTracker();

// -------------------------------------------------------------------
// Reels Feed API Client
// -------------------------------------------------------------------

export interface FetchReelsOptions {
  cursor?: number;
  limit?: number;
  userUid?: string | null;
  startId?: string | null;
}

export const fetchReelsFeed = async (options: FetchReelsOptions = {}): Promise<{
  reels: ReelItem[];
  nextCursor: number | null;
  hasMore: boolean;
}> => {
  const deviceId = getOrCreateDeviceId();
  const params = new URLSearchParams();
  params.set('action', 'feed');
  params.set('deviceId', deviceId);
  if (options.userUid) params.set('userUid', options.userUid);
  if (options.cursor !== undefined && options.cursor !== null) params.set('cursor', options.cursor.toString());
  if (options.limit) params.set('limit', options.limit.toString());
  if (options.startId) params.set('startId', options.startId);

  const res = await fetch(`/api/reels?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch reels (status ${res.status})`);
  }
  const data = await res.json();
  if (!data.success) {
    throw new Error(data.error || "Failed to load reels");
  }

  if (isReelsDebugEnabled()) {
    console.log(`[Reels Feed] Fetched ${data.reels?.length || 0} reels:`, data.reels?.map((r: any) => ({
      id: r.id,
      title: r.title,
      creator: r.uploaderName,
      score: r._debugScore
    })));
  }

  return {
    reels: data.reels || [],
    nextCursor: data.nextCursor ?? null,
    hasMore: data.hasMore ?? false
  };
};

// -------------------------------------------------------------------
// Debug Mode
// -------------------------------------------------------------------

export const isReelsDebugEnabled = (): boolean => {
  try {
    return localStorage.getItem('gg_reels_debug') === 'true';
  } catch {
    return false;
  }
};

export const setReelsDebug = (enabled: boolean): void => {
  try {
    localStorage.setItem('gg_reels_debug', enabled ? 'true' : 'false');
  } catch {}
};
