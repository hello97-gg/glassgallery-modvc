import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { User } from 'firebase/auth';
import type { ProfileUser, ImageMeta, Comment } from '../types';
import { 
  fetchReelsFeed, 
  reelsTracker, 
  rerankNextReels, 
  type ReelItem 
} from '../services/reelsService';
import { 
  toggleImageLike, 
  toggleFollowUser, 
  getFollowingList,
  getCommentsForImage, 
  addCommentToImage, 
  toggleCommentLike 
} from '../services/firestoreService';
import { DARK_VIDEO_POSTER } from './VideoPlayer';
import Spinner from './Spinner';

interface ReelsPageProps {
  user: User | null;
  onBack: () => void;
  onViewProfile: (profile: ProfileUser) => void;
  onShare: (reel: ImageMeta) => void;
  onLikeToggle?: (image: ImageMeta) => void;
  initialReelId?: string | null;
  allImages?: ImageMeta[];
}

interface FloatingHeart {
  id: number;
  x: number;
  y: number;
  rotation: number;
}

const formatTime = (seconds: number): string => {
  if (isNaN(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
};

// Synchronous video extractor from preloaded allImages / localStorage cache
const extractReelsFromImages = (images: ImageMeta[], userUid?: string | null, startId?: string | null): ReelItem[] => {
  const videoImages = images.filter(img => {
    const u = img.imageUrl || '';
    return u.match(/\.(mp4|webm|mov|ogg|avi|mkv|m4v)(\?.*)?$/i) || u.toLowerCase().includes('.mp4');
  });

  let mapped: ReelItem[] = videoImages.map(img => {
    const tags = img.flags || [];
    const isTagLandscape = tags.some(t => {
      const lower = t.toLowerCase();
      return lower.includes('16:9') || lower.includes('landscape') || lower.includes('horizontal');
    });
    const isTagVertical = tags.some(t => {
      const lower = t.toLowerCase();
      return lower.includes('9:16') || lower.includes('vertical');
    });

    const initialWidth = (img as any).width || (isTagLandscape ? 1920 : 1080);
    const initialHeight = (img as any).height || (isTagLandscape ? 1080 : 1920);

    return {
      id: img.id,
      videoUrl: img.imageUrl,
      poster: img.imageUrl,
      width: initialWidth,
      height: initialHeight,
      duration: 15,
      title: img.title || 'Reels',
      description: img.description || '',
      uploaderUid: img.uploaderUid,
      uploaderName: img.uploaderName || 'Creator',
      uploaderPhotoURL: img.uploaderPhotoURL,
      tags: tags,
      concepts: (img as any).aiConcepts || [],
      likeCount: img.likeCount || 0,
      commentCount: img.commentCount || 0,
      shareCount: 0,
      hasLiked: userUid ? (img.likedBy?.includes(userUid) || false) : false,
      hasSaved: userUid ? (img.likedBy?.includes(userUid) || false) : false,
      isFollowing: false,
      uploadedAt: img.uploadedAt
    };
  });

  if (startId) {
    const target = mapped.find(v => v.id === startId);
    if (target) {
      mapped = [target, ...mapped.filter(v => v.id !== startId)];
    }
  }

  return mapped;
};

export const ReelsPage: React.FC<ReelsPageProps> = ({
  user,
  onBack,
  onViewProfile,
  onShare,
  onLikeToggle,
  initialReelId,
  allImages = []
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Instant hydration: populate reels immediately from allImages or localStorage cache so there is NO waiting spinner!
  const [reels, setReels] = useState<ReelItem[]>(() => {
    const initialFromAll = extractReelsFromImages(allImages, user?.uid, initialReelId);
    if (initialFromAll.length > 0) return initialFromAll;
    try {
      const cached = localStorage.getItem('cached_reels_feed');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return [];
  });

  const [currentIndex, setCurrentIndex] = useState(() => {
    if (initialReelId) return 0;
    try {
      const saved = sessionStorage.getItem('gg_reels_last_index');
      return saved ? parseInt(saved, 10) || 0 : 0;
    } catch {
      return 0;
    }
  });

  // If reels were already hydrated, don't block the screen with a spinner!
  const [isLoading, setIsLoading] = useState(() => reels.length === 0);
  const [nextCursor, setNextCursor] = useState<number | null>(0);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Real-time aspect ratio map detected from video elements (id -> isVertical)
  const detectedAspectMap = useRef<Map<string, boolean>>(new Map());
  const [aspectVersion, setAspectVersion] = useState(0);

  // Global sound setting from localStorage
  const [isMuted, setIsMuted] = useState<boolean>(() => {
    try {
      const item = localStorage.getItem('gg_video_muted');
      return item === null ? true : item === 'true';
    } catch {
      return true;
    }
  });

  // Synced Set of followed creator UIDs
  const [followedCreatorsSet, setFollowedCreatorsSet] = useState<Set<string>>(new Set());

  // Floating hearts for double-tap
  const [hearts, setHearts] = useState<FloatingHeart[]>([]);
  const tapTimeoutRef = useRef<any>(null);
  const touchStartTimeRef = useRef<number>(0);
  const touchStartPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const lastTapRef = useRef<{ time: number; x: number; y: number }>({ time: 0, x: 0, y: 0 });

  // Center play/pause indicator animation
  const [centerIconState, setCenterIconState] = useState<'play' | 'pause' | null>(null);
  const centerIconTimerRef = useRef<any>(null);

  // 2x Playback Speed Hold
  const [is2xHold, setIs2xHold] = useState(false);
  const holdTimerRef = useRef<any>(null);

  // Playback Speed menu
  const [speed, setSpeed] = useState<number>(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);

  // Comments Bottom Sheet
  const [isCommentsOpen, setIsCommentsOpen] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [isPostingComment, setIsPostingComment] = useState(false);

  // Description expansion state
  const [expandedDescIndex, setExpandedDescIndex] = useState<number | null>(null);

  // Options / Credit modal state
  const [optionsReel, setOptionsReel] = useState<ReelItem | null>(null);

  // Video element references & tracking state per item
  const videoRefs = useRef<Map<number, HTMLVideoElement>>(new Map());
  const firstFrameMap = useRef<Map<number, boolean>>(new Map());
  const [firstFrameVersion, setFirstFrameVersion] = useState(0);

  // Watch metrics tracking per reel
  const watchStartTimeRef = useRef<number>(Date.now());
  const loopCountRef = useRef<number>(0);

  // Progress Bar References
  const progressFillRef = useRef<HTMLDivElement>(null);
  const bufferFillRef = useRef<HTMLDivElement>(null);
  const progressTrackRef = useRef<HTMLDivElement>(null);
  const rafIdRef = useRef<number | null>(null);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubTime, setScrubTime] = useState(0);

  // Buffering & Toast Notifications
  const [isBuffering, setIsBuffering] = useState(false);
  const bufferingTimerRef = useRef<any>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimerRef = useRef<any>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastMessage(null), 2500);
  }, []);

  // Sync follow list for logged-in user
  useEffect(() => {
    if (user?.uid) {
      getFollowingList(user.uid).then(list => {
        if (Array.isArray(list)) {
          setFollowedCreatorsSet(new Set(list.map(u => u.uploaderUid)));
        }
      }).catch(() => {});
    }
  }, [user?.uid]);

  // Handle hardware back button closing the comments drawer
  useEffect(() => {
    if (isCommentsOpen) {
      (window as any).__glassGalleryCloseReelsComments = () => setIsCommentsOpen(false);
    } else {
      (window as any).__glassGalleryCloseReelsComments = null;
    }
    return () => {
      (window as any).__glassGalleryCloseReelsComments = null;
    };
  }, [isCommentsOpen]);

  // Video buffering event handlers
  const handleVideoWaiting = useCallback((idx: number) => {
    if (idx !== currentIndex) return;
    if (bufferingTimerRef.current) clearTimeout(bufferingTimerRef.current);
    bufferingTimerRef.current = setTimeout(() => {
      setIsBuffering(true);
    }, 300);
  }, [currentIndex]);

  const handleVideoPlaying = useCallback((idx: number) => {
    if (idx !== currentIndex) return;
    if (bufferingTimerRef.current) {
      clearTimeout(bufferingTimerRef.current);
      bufferingTimerRef.current = null;
    }
    setIsBuffering(false);
  }, [currentIndex]);

  const handleVideoError = useCallback((idx: number) => {
    if (idx !== currentIndex) return;
    const failedReel = reels[idx];
    console.warn("Video failed to play:", failedReel?.videoUrl);
    
    if (failedReel) {
      fetch('/reels/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          events: [{
            videoId: failedReel.id,
            error: true,
            watchMs: 0,
            timestamp: Date.now()
          }]
        })
      }).catch(() => {});
    }

    showToast("Video unavailable, skipping to next...");
    
    if (currentIndex < reels.length - 1) {
      const nextIdx = currentIndex + 1;
      const container = containerRef.current;
      if (container) {
        const h = container.clientHeight || window.innerHeight;
        container.scrollTo({ top: nextIdx * h, behavior: 'smooth' });
      }
    }
  }, [currentIndex, reels, showToast]);

  // Video intrinsic dimension detector (Prevents stretching or cropping)
  const handleVideoMetadata = useCallback((reelId: string, video: HTMLVideoElement) => {
    if (video.videoWidth > 0 && video.videoHeight > 0) {
      // If height/width >= 1.35 it's vertical 9:16. If < 1.35 it's landscape/square/4:3!
      const isVertical = (video.videoHeight / video.videoWidth) >= 1.35;
      detectedAspectMap.current.set(reelId, isVertical);
      setAspectVersion(v => v + 1);
    }
  }, []);

  // Determine aspect ratio for any reel safely
  const isReelVertical = useCallback((reel: ReelItem): boolean => {
    const detected = detectedAspectMap.current.get(reel.id);
    if (detected !== undefined) return detected;

    const tags = (reel.tags || []).map(t => t.toLowerCase());
    const isTagLandscape = tags.some(t => 
      t.includes('16:9') || t.includes('landscape') || t.includes('horizontal') || t.includes('wide')
    );
    if (isTagLandscape) return false;

    const isTagVertical = tags.some(t => 
      t.includes('9:16') || t.includes('vertical') || t.includes('reel') || t.includes('shorts')
    );
    if (isTagVertical) return true;

    if (reel.width && reel.height) {
      if (reel.width > reel.height) return false;
      return (reel.height / reel.width >= 1.35);
    }

    // Default to safe contain over blurred ambient background so no landscape video is EVER stretched!
    return false;
  }, []);

  // Update tracker with userUid
  useEffect(() => {
    reelsTracker.setUserUid(user?.uid || null);
  }, [user]);

  // Persist mute state across swipes
  const toggleMute = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    setIsMuted(prev => {
      const next = !prev;
      try {
        localStorage.setItem('gg_video_muted', next ? 'true' : 'false');
      } catch {}
      const activeVideo = videoRefs.current.get(currentIndex);
      if (activeVideo) activeVideo.muted = next;
      return next;
    });
  }, [currentIndex]);

  // Asynchronous background feed fetch (SWR)
  useEffect(() => {
    let active = true;
    if (initialReelId) {
      setCurrentIndex(0);
      try {
        sessionStorage.setItem('gg_reels_last_index', '0');
      } catch {}
    }

    const loadInitial = async () => {
      setError(null);
      try {
        const res = await fetchReelsFeed({
          userUid: user?.uid,
          cursor: 0,
          limit: 10,
          startId: initialReelId || undefined
        });

        if (!active) return;
        if (res.reels.length > 0) {
          setReels(prev => {
            if (prev.length === 0) return res.reels;
            const currentItem = prev[currentIndex];
            const incoming = res.reels;
            const uniqueMap = new Map<string, ReelItem>();
            if (currentItem) uniqueMap.set(currentItem.id, currentItem);
            incoming.forEach(r => {
              if (!uniqueMap.has(r.id)) uniqueMap.set(r.id, r);
            });
            prev.forEach(r => {
              if (!uniqueMap.has(r.id)) uniqueMap.set(r.id, r);
            });
            const merged = Array.from(uniqueMap.values());
            try {
              localStorage.setItem('cached_reels_feed', JSON.stringify(merged.slice(0, 15)));
            } catch {}
            return merged;
          });
          setNextCursor(res.nextCursor);
          setHasMore(res.hasMore);
        }
      } catch (err: any) {
        if (!active) return;
        console.warn("Reels network feed fetch warning:", err);
      } finally {
        if (active) setIsLoading(false);
      }
    };

    loadInitial();
    return () => { active = false; };
  }, [user?.uid, initialReelId]);

  // Load more reels when near the bottom
  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore || nextCursor === null) return;
    setIsLoadingMore(true);
    try {
      const res = await fetchReelsFeed({
        userUid: user?.uid,
        cursor: nextCursor,
        limit: 10
      });
      if (res.reels.length > 0) {
        setReels(prev => {
          const existingIds = new Set(prev.map(r => r.id));
          const fresh = res.reels.filter(r => !existingIds.has(r.id));
          const merged = [...prev, ...fresh];
          return rerankNextReels(merged, currentIndex);
        });
        setNextCursor(res.nextCursor);
        setHasMore(res.hasMore);
      } else {
        setHasMore(false);
      }
    } catch (err) {
      console.warn("Failed to paginate reels:", err);
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, hasMore, nextCursor, user?.uid, currentIndex]);

  // Flush metrics for leaving reel and start tracking entering reel
  const handleReelTransition = useCallback((prevIdx: number, nextIdx: number) => {
    if (bufferingTimerRef.current) {
      clearTimeout(bufferingTimerRef.current);
      bufferingTimerRef.current = null;
    }
    setIsBuffering(false);

    const prevReel = reels[prevIdx];
    if (prevReel) {
      const activeVideo = videoRefs.current.get(prevIdx);
      const watchMs = Date.now() - watchStartTimeRef.current;
      const duration = activeVideo?.duration || prevReel.duration || 15;

      reelsTracker.track({
        videoId: prevReel.id,
        watchMs,
        duration,
        loops: loopCountRef.current,
        liked: prevReel.hasLiked,
        saved: prevReel.hasSaved,
        shared: false,
        commented: false,
        muted: isMuted,
        tags: prevReel.tags || [],
        concepts: prevReel.concepts || [],
        creatorUid: prevReel.uploaderUid
      });
    }

    watchStartTimeRef.current = Date.now();
    loopCountRef.current = 0;
    try {
      sessionStorage.setItem('gg_reels_last_index', nextIdx.toString());
    } catch {}

    if (nextIdx >= reels.length - 3) {
      loadMore();
    }
  }, [reels, isMuted, loadMore]);

  // Scroll listener on vertical pager to detect active reel
  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const height = container.clientHeight || window.innerHeight;
    const scrollY = container.scrollTop;
    const newIndex = Math.round(scrollY / height);

    if (newIndex !== currentIndex && newIndex >= 0 && newIndex < reels.length) {
      handleReelTransition(currentIndex, newIndex);
      setCurrentIndex(newIndex);
    }
  }, [currentIndex, reels.length, handleReelTransition]);

  // Restore scroll position on initial index or container mount
  useEffect(() => {
    const container = containerRef.current;
    if (container && currentIndex > 0 && reels.length > currentIndex) {
      const timer = setTimeout(() => {
        const height = container.clientHeight || window.innerHeight;
        container.scrollTo({ top: currentIndex * height, behavior: 'instant' });
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [reels.length, currentIndex]);

  // Active Video Playback Synchronization
  useEffect(() => {
    videoRefs.current.forEach((video, idx) => {
      if (idx === currentIndex) {
        video.muted = isMuted;
        video.playbackRate = is2xHold ? 2.0 : speed;
        video.play().catch(() => {});
      } else {
        video.pause();
        if (Math.abs(idx - currentIndex) > 1) {
          video.currentTime = 0;
        }
      }
    });
  }, [currentIndex, isMuted, is2xHold, speed]);

  // Stop everything on unmount / visibility change
  useEffect(() => {
    const handleVisChange = () => {
      if (document.visibilityState === 'hidden') {
        videoRefs.current.forEach(v => v.pause());
      } else {
        const active = videoRefs.current.get(currentIndex);
        if (active) active.play().catch(() => {});
      }
    };

    document.addEventListener('visibilitychange', handleVisChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisChange);
      videoRefs.current.forEach(v => v.pause());
    };
  }, [currentIndex]);

  // High-performance requestAnimationFrame Progress Bar loop
  useEffect(() => {
    const updateProgress = () => {
      const activeVideo = videoRefs.current.get(currentIndex);
      if (activeVideo && !isScrubbing && activeVideo.duration > 0) {
        const progress = activeVideo.currentTime / activeVideo.duration;
        if (progressFillRef.current) {
          progressFillRef.current.style.transform = `scaleX(${Math.min(1, Math.max(0, progress))})`;
        }
        if (bufferFillRef.current && activeVideo.buffered.length > 0) {
          const bufferedEnd = activeVideo.buffered.end(activeVideo.buffered.length - 1);
          const bufRatio = bufferedEnd / activeVideo.duration;
          bufferFillRef.current.style.transform = `scaleX(${Math.min(1, Math.max(0, bufRatio))})`;
        }
      }
      rafIdRef.current = requestAnimationFrame(updateProgress);
    };

    rafIdRef.current = requestAnimationFrame(updateProgress);
    return () => {
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    };
  }, [currentIndex, isScrubbing]);

  const showCenterAnimation = (type: 'play' | 'pause') => {
    setCenterIconState(type);
    if (centerIconTimerRef.current) clearTimeout(centerIconTimerRef.current);
    centerIconTimerRef.current = setTimeout(() => {
      setCenterIconState(null);
    }, 450);
  };

  // Like Reel (Optimistic with Rollback)
  const handleLikeReel = useCallback(async (reel: ReelItem) => {
    if (!user) {
      alert("Please log in to like this reel!");
      return;
    }

    const wasLiked = reel.hasLiked;
    const deltaCount = wasLiked ? -1 : 1;

    setReels(prev => prev.map(r => r.id === reel.id ? {
      ...r,
      hasLiked: !wasLiked,
      likeCount: Math.max(0, r.likeCount + deltaCount)
    } : r));

    if (onLikeToggle) {
      onLikeToggle({
        id: reel.id,
        imageUrl: reel.videoUrl,
        uploaderUid: reel.uploaderUid,
        uploaderName: reel.uploaderName,
        uploaderPhotoURL: reel.uploaderPhotoURL || '',
        license: 'CC0',
        flags: reel.tags,
        uploadedAt: reel.uploadedAt
      } as ImageMeta);
    }

    try {
      await toggleImageLike(reel.id, user.uid);
    } catch (err) {
      setReels(prev => prev.map(r => r.id === reel.id ? {
        ...r,
        hasLiked: wasLiked,
        likeCount: Math.max(0, r.likeCount - deltaCount)
      } : r));
    }
  }, [user, onLikeToggle]);

  // Robust Tap & Double-Tap Gesture Handler (works across touch and mouse)
  const triggerDoubleTapHeart = useCallback((clientX: number, clientY: number) => {
    const now = Date.now();
    const rotation = (Math.random() - 0.5) * 32;

    setHearts(prev => [...prev.slice(-4), { id: now, x: clientX, y: clientY, rotation }]);
    setTimeout(() => {
      setHearts(prev => prev.filter(h => h.id !== now));
    }, 750);

    if (navigator.vibrate) navigator.vibrate(12);

    const currentReel = reels[currentIndex];
    if (currentReel && !currentReel.hasLiked) {
      handleLikeReel(currentReel);
    }
  }, [currentIndex, reels, handleLikeReel]);

  const handleTap = useCallback((clientX: number, clientY: number) => {
    const now = Date.now();
    const DOUBLE_TAP_MAX_GAP = 360;
    const DOUBLE_TAP_MAX_DISTANCE = 65;

    const last = lastTapRef.current;
    const timeDiff = now - last.time;
    const dist = Math.hypot(clientX - last.x, clientY - last.y);

    if (timeDiff > 40 && timeDiff < DOUBLE_TAP_MAX_GAP && dist < DOUBLE_TAP_MAX_DISTANCE) {
      if (tapTimeoutRef.current) {
        clearTimeout(tapTimeoutRef.current);
        tapTimeoutRef.current = null;
      }
      lastTapRef.current = { time: 0, x: 0, y: 0 };
      triggerDoubleTapHeart(clientX, clientY);
      return;
    }

    lastTapRef.current = { time: now, x: clientX, y: clientY };

    tapTimeoutRef.current = setTimeout(() => {
      const activeVideo = videoRefs.current.get(currentIndex);
      if (!activeVideo) return;

      if (activeVideo.paused) {
        activeVideo.play().catch(() => {});
        showCenterAnimation('play');
      } else {
        activeVideo.pause();
        showCenterAnimation('pause');
      }
      tapTimeoutRef.current = null;
    }, DOUBLE_TAP_MAX_GAP);
  }, [currentIndex, triggerDoubleTapHeart]);

  // Touch handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (touch) {
      touchStartTimeRef.current = Date.now();
      touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };
    }

    holdTimerRef.current = setTimeout(() => {
      const activeVideo = videoRefs.current.get(currentIndex);
      if (activeVideo && !activeVideo.paused) {
        setIs2xHold(true);
        if (navigator.vibrate) navigator.vibrate(15);
      }
    }, 420);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    if (is2xHold) {
      setIs2xHold(false);
      return;
    }

    const touch = e.changedTouches[0];
    if (!touch) return;

    const moveDist = Math.hypot(
      touch.clientX - touchStartPosRef.current.x,
      touch.clientY - touchStartPosRef.current.y
    );
    if (moveDist > 16) {
      return; // Finger was swiping/scrolling between reels
    }

    handleTap(touch.clientX, touch.clientY);
  };

  const handleContainerClick = (e: React.MouseEvent) => {
    if ('ontouchstart' in window && e.detail === 0) return;
    handleTap(e.clientX, e.clientY);
  };

  // Follow Creator (Optimistic with sync to followedCreatorsSet)
  const handleFollowCreator = async (reel: ReelItem) => {
    if (!user) {
      alert("Please log in to follow creators!");
      return;
    }

    const isCurrentlyFollowing = followedCreatorsSet.has(reel.uploaderUid);

    setFollowedCreatorsSet(prev => {
      const next = new Set(prev);
      if (isCurrentlyFollowing) next.delete(reel.uploaderUid);
      else next.add(reel.uploaderUid);
      return next;
    });

    try {
      const res = await toggleFollowUser(
        user.uid,
        reel.uploaderUid,
        user.displayName || 'User',
        user.photoURL || ''
      );
      setFollowedCreatorsSet(prev => {
        const next = new Set(prev);
        if (res.isFollowing) next.add(reel.uploaderUid);
        else next.delete(reel.uploaderUid);
        return next;
      });
    } catch (err) {
      setFollowedCreatorsSet(prev => {
        const next = new Set(prev);
        if (isCurrentlyFollowing) next.add(reel.uploaderUid);
        else next.delete(reel.uploaderUid);
        return next;
      });
    }
  };

  // Scrubber Pointer Scrubbing
  const handleScrubberPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    const track = progressTrackRef.current;
    const activeVideo = videoRefs.current.get(currentIndex);
    if (!track || !activeVideo || activeVideo.duration <= 0) return;

    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setIsScrubbing(true);

    const rect = track.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetTime = ratio * activeVideo.duration;
    setScrubTime(targetTime);

    if (progressFillRef.current) {
      progressFillRef.current.style.transform = `scaleX(${ratio})`;
    }
  };

  const handleScrubberPointerMove = (e: React.PointerEvent) => {
    if (!isScrubbing) return;
    const track = progressTrackRef.current;
    const activeVideo = videoRefs.current.get(currentIndex);
    if (!track || !activeVideo || activeVideo.duration <= 0) return;

    const rect = track.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetTime = ratio * activeVideo.duration;
    setScrubTime(targetTime);

    if (progressFillRef.current) {
      progressFillRef.current.style.transform = `scaleX(${ratio})`;
    }
  };

  const handleScrubberPointerUp = (e: React.PointerEvent) => {
    if (!isScrubbing) return;
    const activeVideo = videoRefs.current.get(currentIndex);
    if (activeVideo && activeVideo.duration > 0) {
      activeVideo.currentTime = scrubTime;
    }
    setIsScrubbing(false);
  };

  // Comments Bottom Sheet Loader
  const handleOpenComments = async (reel: ReelItem) => {
    setIsCommentsOpen(true);
    setIsLoadingComments(true);
    try {
      const data = await getCommentsForImage(reel.id);
      setComments(data);
    } catch (err) {
      console.error("Failed to load comments for reel:", err);
    } finally {
      setIsLoadingComments(false);
    }
  };

  const handlePostComment = async () => {
    const currentReel = reels[currentIndex];
    if (!user || !commentText.trim() || !currentReel || isPostingComment) return;
    setIsPostingComment(true);
    try {
      const newComment = await addCommentToImage(currentReel.id, user, commentText.trim());
      setComments(prev => [newComment, ...prev]);
      setCommentText('');
      setReels(prev => prev.map(r => r.id === currentReel.id ? { ...r, commentCount: r.commentCount + 1 } : r));
    } catch (err) {
      console.error("Failed to post comment:", err);
    } finally {
      setIsPostingComment(false);
    }
  };

  const handleCommentLikeToggle = async (commentId: string) => {
    if (!user) {
      alert("Please log in to like comments!");
      return;
    }
    setComments(prev => prev.map(c => {
      if (c.id === commentId) {
        const isLiked = c.likedBy?.includes(user.uid);
        return {
          ...c,
          likeCount: isLiked ? Math.max(0, (c.likeCount || 0) - 1) : (c.likeCount || 0) + 1,
          likedBy: isLiked ? (c.likedBy || []).filter(uid => uid !== user.uid) : [...(c.likedBy || []), user.uid]
        };
      }
      return c;
    }));
    try {
      await toggleCommentLike(commentId, user.uid);
      if (navigator.vibrate) navigator.vibrate(10);
    } catch (err) {
      console.error("Failed to toggle comment like:", err);
    }
  };

  if (isLoading && reels.length === 0) {
    return (
      <div className="fixed inset-0 z-40 bg-black flex flex-col items-center justify-center text-white select-none">
        <div className="w-10 h-10 rounded-full border-2 border-white/20 border-t-white animate-spin mb-4" />
        <span className="text-xs font-semibold text-neutral-400 tracking-wider uppercase">Loading Reels...</span>
      </div>
    );
  }

  if (reels.length === 0) {
    return (
      <div className="fixed inset-0 z-40 bg-black flex flex-col items-center justify-center text-white px-6 text-center select-none">
        <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center mb-4 border border-white/10">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-neutral-400" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
        </div>
        <h3 className="text-base font-bold text-white mb-1">No Video Reels Available</h3>
        <p className="text-xs text-neutral-400 max-w-xs mb-6">Explore the photo feed or check back once creators upload new video pins!</p>
        <button
          onClick={onBack}
          className="px-6 py-2.5 rounded-full bg-white text-black text-xs font-bold active:scale-95 transition-transform"
        >
          Back to Feed
        </button>
      </div>
    );
  }

  const currentReel = reels[currentIndex] || reels[0];
  const activeVideoEl = videoRefs.current.get(currentIndex);
  const activeDuration = activeVideoEl?.duration || currentReel?.duration || 15;

  return (
    <div className="fixed inset-0 z-40 bg-black flex flex-col overflow-hidden text-white select-none touch-manipulation">
      {/* Top Floating Transparent Header */}
      <div 
        className="absolute top-0 left-0 right-0 z-30 pointer-events-none flex items-center justify-between px-4 pb-6 bg-gradient-to-b from-black/80 via-black/35 to-transparent"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 16px) + 8px)' }}
      >
        <div className="flex items-center gap-3 pointer-events-auto">
          {/* Back Button */}
          <button
            onClick={onBack}
            className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-md border border-white/15 flex items-center justify-center text-white active:scale-95 transition-transform shadow-lg"
            title="Go Back"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="font-bold text-base tracking-wide drop-shadow-md">Reels</span>
        </div>

        {/* Top Right Actions: Mute / Speed */}
        <div className="flex items-center gap-2 pointer-events-auto">
          {/* Speed Selector */}
          <div className="relative">
            <button
              onClick={() => setShowSpeedMenu(prev => !prev)}
              className="px-2.5 py-1.5 rounded-full bg-black/40 backdrop-blur-md border border-white/15 text-xs font-bold text-white active:scale-95 transition-transform"
            >
              {speed}x
            </button>
            {showSpeedMenu && (
              <div className="absolute right-0 top-10 bg-[#161616] border border-white/15 rounded-2xl py-1.5 shadow-2xl flex flex-col min-w-[70px] z-50 animate-fade-in">
                {[0.5, 1, 1.5, 2].map(s => (
                  <button
                    key={s}
                    onClick={() => { setSpeed(s); setShowSpeedMenu(false); }}
                    className={`px-3 py-1.5 text-xs text-left font-semibold ${speed === s ? 'text-white bg-white/10' : 'text-neutral-400 hover:text-white'}`}
                  >
                    {s}x
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Mute Button */}
          <button
            onClick={toggleMute}
            className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-md border border-white/15 flex items-center justify-center text-white active:scale-95 transition-transform shadow-lg"
            title={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* 2x Playback Speed Pill Top Center */}
      {is2xHold && (
        <div 
          className="absolute top-20 left-1/2 -translate-x-1/2 z-30 px-3.5 py-1 rounded-full bg-white/20 backdrop-blur-md border border-white/20 text-white text-xs font-bold tracking-wide flex items-center gap-1.5 shadow-lg animate-fade-in pointer-events-none"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 fill-current" viewBox="0 0 24 24">
            <path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z" />
          </svg>
          <span>2x Speed</span>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-black/80 backdrop-blur-md border border-white/15 text-white text-xs font-semibold shadow-2xl animate-fade-in pointer-events-none">
          {toastMessage}
        </div>
      )}

      {/* Center Play/Pause Indicator Animation */}
      {centerIconState && (
        <div className="absolute inset-0 z-30 pointer-events-none flex items-center justify-center animate-fade-in">
          <div className="w-16 h-16 rounded-full bg-black/60 backdrop-blur-md border border-white/20 flex items-center justify-center text-white scale-100 transition-transform">
            {centerIconState === 'play' ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 fill-current ml-1" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 fill-current" viewBox="0 0 24 24">
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
              </svg>
            )}
          </div>
        </div>
      )}

      {/* Double-Tap Floating Hearts Animation */}
      {hearts.map(heart => (
        <div
          key={heart.id}
          className="absolute pointer-events-none z-30 animate-like-bounce"
          style={{
            left: `${heart.x}px`,
            top: `${heart.y}px`,
            transform: `translate(-50%, -50%) rotate(${heart.rotation}deg)`
          }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-24 w-24 text-white drop-shadow-2xl fill-current" viewBox="0 0 24 24">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
          </svg>
        </div>
      ))}

      {/* Vertical Pager with Native Snap Physics */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        onClick={handleContainerClick}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="w-full h-[100dvh] overflow-y-scroll snap-y snap-mandatory select-none no-scrollbar touch-manipulation"
        style={{ scrollSnapType: 'y mandatory', WebkitOverflowScrolling: 'touch' }}
      >
        {reels.map((reel, index) => {
          const isMounted = Math.abs(index - currentIndex) <= 1;
          const isActive = index === currentIndex;
          const isVertical = isReelVertical(reel);
          const isFirstFrameReady = firstFrameMap.current.get(index) || false;

          return (
            <div
              key={reel.id}
              className="w-full h-[100dvh] snap-start snap-always relative overflow-hidden bg-black flex items-center justify-center flex-shrink-0 touch-manipulation"
            >
              {isMounted ? (
                <>
                  {/* Ambient Blurred Background for non-9:16 videos (square, landscape 16:9, etc.) */}
                  {!isVertical && (
                    <div
                      className="absolute inset-0 bg-cover bg-center filter blur-3xl brightness-40 scale-125 pointer-events-none transition-all duration-700"
                      style={{ backgroundImage: `url(${reel.poster || reel.videoUrl})` }}
                    />
                  )}

                  {/* Poster First-Frame Crossfade */}
                  <img
                    src={reel.poster || reel.videoUrl}
                    alt=""
                    className={`absolute inset-0 w-full h-full pointer-events-none transition-opacity duration-300 z-10 ${
                      isVertical ? 'object-cover' : 'object-contain'
                    } ${isFirstFrameReady ? 'opacity-0' : 'opacity-100'}`}
                  />

                  {/* HTML5 Video Element: perfectly contained centered for landscape, covered for vertical */}
                  <video
                    ref={(el) => {
                      if (el) videoRefs.current.set(index, el);
                      else videoRefs.current.delete(index);
                    }}
                    src={reel.videoUrl}
                    poster={reel.poster || DARK_VIDEO_POSTER}
                    playsInline
                    webkit-playsinline="true"
                    x5-playsinline="true"
                    loop
                    preload={isActive ? "auto" : "metadata"}
                    muted={isMuted}
                    onLoadedMetadata={(e) => handleVideoMetadata(reel.id, e.currentTarget)}
                    onLoadedData={() => {
                      firstFrameMap.current.set(index, true);
                      setFirstFrameVersion(v => v + 1);
                    }}
                    onWaiting={() => handleVideoWaiting(index)}
                    onPlaying={() => handleVideoPlaying(index)}
                    onError={() => handleVideoError(index)}
                    onEnded={() => {
                      loopCountRef.current++;
                    }}
                    className={`w-full h-full pointer-events-none transition-opacity duration-300 z-10 ${
                      isVertical ? 'object-cover' : 'object-contain'
                    } ${isFirstFrameReady ? 'opacity-100' : 'opacity-0'}`}
                  />

                  {/* Buffering Spinner (appears only if buffering lasts > 300ms) */}
                  {isActive && isBuffering && (
                    <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
                      <div className="w-10 h-10 rounded-full border-2 border-white/20 border-t-white animate-spin" />
                    </div>
                  )}
                </>
              ) : (
                <div className="w-full h-full bg-[#0a0a0a]" />
              )}
            </div>
          );
        })}
      </div>

      {/* Current Reel Overlay: Right Action Stack + Bottom-Left Info */}
      <div 
        className="absolute inset-0 pointer-events-none z-20 flex flex-col justify-end"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 16px) + 12px)' }}
      >
        {/* Soft Bottom Gradient behind text and action stack */}
        <div className="absolute inset-x-0 bottom-0 h-72 bg-gradient-to-t from-black/90 via-black/40 to-transparent pointer-events-none" />

        <div className="relative z-10 px-4 pb-2 flex items-end justify-between gap-3">
          {/* Bottom Left: Creator Info, Title, Expandable Description, Tags */}
          <div className="flex-1 min-w-0 pointer-events-auto pr-2">
            {/* Creator Row */}
            <div className="flex items-center gap-2.5 mb-2.5">
              <img
                onClick={() => onViewProfile({
                  uploaderUid: currentReel.uploaderUid,
                  uploaderName: currentReel.uploaderName,
                  uploaderPhotoURL: currentReel.uploaderPhotoURL || ''
                })}
                src={currentReel.uploaderPhotoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${currentReel.uploaderName}`}
                alt={currentReel.uploaderName}
                className="w-9 h-9 rounded-full object-cover border border-white/20 shadow-md cursor-pointer active:scale-95 transition-transform"
              />
              <span 
                onClick={() => onViewProfile({
                  uploaderUid: currentReel.uploaderUid,
                  uploaderName: currentReel.uploaderName,
                  uploaderPhotoURL: currentReel.uploaderPhotoURL || ''
                })}
                className="font-bold text-sm text-white drop-shadow hover:underline truncate cursor-pointer"
              >
                @{currentReel.uploaderName.toLowerCase().replace(/\s+/g, '')}
              </span>

              {user?.uid !== currentReel.uploaderUid && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleFollowCreator(currentReel);
                  }}
                  className={`px-3 py-1 rounded-full text-xs font-bold transition-all active:scale-95 border ${
                    followedCreatorsSet.has(currentReel.uploaderUid)
                      ? 'bg-white/10 text-neutral-300 border-white/20'
                      : 'bg-white text-black border-white hover:bg-neutral-200'
                  }`}
                >
                  {followedCreatorsSet.has(currentReel.uploaderUid) ? 'Following' : 'Follow'}
                </button>
              )}
            </div>

            {/* Title & Description: Clicking either title or description toggles expanded state */}
            <div
              onClick={(e) => {
                e.stopPropagation();
                if (currentReel.description) {
                  setExpandedDescIndex(prev => prev === currentIndex ? null : currentIndex);
                }
              }}
              className="cursor-pointer mb-1.5"
            >
              {currentReel.title && (
                <h3 className="font-bold text-sm text-white drop-shadow mb-1 leading-snug">
                  {currentReel.title}
                </h3>
              )}

              {currentReel.description && (
                <p
                  className={`text-xs text-neutral-300 drop-shadow transition-all ${
                    expandedDescIndex === currentIndex ? 'whitespace-pre-wrap' : 'line-clamp-2'
                  }`}
                >
                  {currentReel.description}
                </p>
              )}
            </div>

            {/* Tags */}
            {currentReel.tags && currentReel.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {currentReel.tags.slice(0, 4).map((tag, tIdx) => (
                  <span
                    key={tIdx}
                    className="px-2 py-0.5 rounded-full bg-white/10 backdrop-blur-md text-[10px] text-neutral-300 font-medium border border-white/5"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Right Action Stack: Like, Comment, Share, Save, Menu */}
          <div className="flex flex-col items-center gap-4 flex-shrink-0 pointer-events-auto pb-1">
            {/* Like Button */}
            <button
              onClick={() => handleLikeReel(currentReel)}
              className="flex flex-col items-center gap-1 group active:scale-75 transition-transform"
              title="Like"
            >
              <div className={`p-2.5 rounded-full transition-colors ${currentReel.hasLiked ? 'text-red-500' : 'text-white'}`}>
                {currentReel.hasLiked ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 drop-shadow fill-current animate-like-bounce" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 drop-shadow" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                )}
              </div>
              <span className="text-[11px] font-bold text-white drop-shadow -mt-1.5">
                {currentReel.likeCount}
              </span>
            </button>

            {/* Comment Button */}
            <button
              onClick={() => handleOpenComments(currentReel)}
              className="flex flex-col items-center gap-1 active:scale-75 transition-transform"
              title="Comments"
            >
              <div className="p-2.5 text-white">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 drop-shadow" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <span className="text-[11px] font-bold text-white drop-shadow -mt-1.5">
                {currentReel.commentCount}
              </span>
            </button>

            {/* Share Button (Reuses existing share modal) */}
            <button
              onClick={() => {
                onShare({
                  id: currentReel.id,
                  imageUrl: currentReel.videoUrl,
                  title: currentReel.title,
                  uploaderName: currentReel.uploaderName
                } as ImageMeta);
              }}
              className="flex flex-col items-center gap-1 active:scale-75 transition-transform"
              title="Share"
            >
              <div className="p-2.5 text-white">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 drop-shadow" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
              </div>
              <span className="text-[11px] font-bold text-white drop-shadow -mt-1.5">Share</span>
            </button>

            {/* Save Button */}
            <button
              onClick={() => handleLikeReel(currentReel)}
              className="p-2.5 text-white active:scale-75 transition-transform"
              title="Save"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 drop-shadow" fill={currentReel.hasLiked ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
            </button>

            {/* More / Credit Options Button */}
            <button
              onClick={() => setOptionsReel(currentReel)}
              className="p-2.5 text-white active:scale-80 transition-transform"
              title="More options"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 drop-shadow" fill="currentColor" viewBox="0 0 24 24">
                <circle cx="5" cy="12" r="2" />
                <circle cx="12" cy="12" r="2" />
                <circle cx="19" cy="12" r="2" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Interactive Bottom Scrubber Progress Bar */}
      <div
        ref={progressTrackRef}
        onPointerDown={handleScrubberPointerDown}
        onPointerMove={handleScrubberPointerMove}
        onPointerUp={handleScrubberPointerUp}
        onPointerCancel={handleScrubberPointerUp}
        className="absolute bottom-0 inset-x-0 h-10 z-30 flex items-end cursor-pointer touch-none pointer-events-auto"
      >
        {/* Floating Time Bubble while Scrubbing */}
        {isScrubbing && (
          <div 
            className="absolute bottom-6 px-3 py-1 rounded-full bg-black/80 backdrop-blur-md border border-white/20 text-white font-mono text-xs font-bold pointer-events-none shadow-2xl -translate-x-1/2 animate-fade-in"
            style={{
              left: `${Math.max(40, Math.min(window.innerWidth - 40, (scrubTime / Math.max(activeDuration, 1)) * window.innerWidth))}px`
            }}
          >
            {formatTime(scrubTime)} / {formatTime(activeDuration)}
          </div>
        )}

        {/* Track Line */}
        <div className={`w-full bg-white/20 relative transition-all duration-150 ${isScrubbing ? 'h-1.5' : 'h-[2.5px]'}`}>
          <div
            ref={bufferFillRef}
            className="absolute inset-0 bg-white/30 origin-left pointer-events-none transform scale-x-0"
          />
          <div
            ref={progressFillRef}
            className="absolute inset-0 bg-white origin-left pointer-events-none transform scale-x-0"
          />
        </div>
      </div>

      {/* Comments Bottom Sheet Drawer (~65% screen height with Back & Close Button) */}
      {isCommentsOpen && (
        <div 
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end justify-center animate-fade-in"
          onClick={() => setIsCommentsOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-[#141414] rounded-t-[32px] border-t border-white/10 shadow-2xl flex flex-col h-[65vh] animate-slide-up select-none overflow-hidden"
          >
            {/* Drawer Drag Indicator */}
            <div className="w-full flex items-center justify-center pt-2.5 pb-1 cursor-pointer" onClick={() => setIsCommentsOpen(false)}>
              <div className="w-12 h-1.5 bg-neutral-600 rounded-full" />
            </div>

            {/* Header with Circular Back Button and Close Button */}
            <div className="px-4 py-2.5 flex items-center justify-between border-b border-white/10">
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setIsCommentsOpen(false)} 
                  className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white active:scale-95 transition-all"
                  title="Back"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <h3 className="font-bold text-sm text-white">Comments ({comments.length})</h3>
              </div>
              <button 
                onClick={() => setIsCommentsOpen(false)} 
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-neutral-300 hover:text-white active:scale-95 transition-all"
                title="Close"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Comments Stream */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
              {isLoadingComments ? (
                <div className="space-y-4 animate-pulse">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="flex gap-3 items-start">
                      <div className="w-8 h-8 rounded-full bg-neutral-800 flex-shrink-0" />
                      <div className="flex-1 space-y-1.5">
                        <div className="w-24 h-3 bg-neutral-800 rounded" />
                        <div className="w-3/4 h-3 bg-neutral-850 rounded" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : comments.length === 0 ? (
                <div className="text-center py-14 text-neutral-400 text-xs">
                  <p className="font-medium text-white mb-1">No comments yet</p>
                  <p className="text-[11px] text-neutral-500">Be the first to share your thoughts!</p>
                </div>
              ) : (
                comments.map(c => {
                  const isCommentLiked = user ? (c.likedBy?.includes(user.uid) || false) : false;
                  return (
                    <div key={c.id} className="flex gap-3 items-start border-b border-white/5 pb-3 last:border-0 last:pb-0">
                      <img 
                        src={c.userPhotoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${c.userName}`} 
                        alt={c.userName} 
                        className="w-8 h-8 rounded-full object-cover flex-shrink-0 border border-white/10"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-white leading-tight">{c.userName}</span>
                          <span className="text-[10px] text-neutral-500">
                            {new Date(c.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                          </span>
                        </div>
                        <p className="text-xs text-neutral-200 mt-1 leading-relaxed break-words whitespace-pre-wrap">{c.content}</p>
                      </div>

                      {/* Comment Like Button */}
                      <button
                        onClick={() => handleCommentLikeToggle(c.id)}
                        className={`flex flex-col items-center gap-0.5 pt-1 flex-shrink-0 active:scale-95 transition-transform ${
                          isCommentLiked ? 'text-red-500' : 'text-neutral-500 hover:text-white'
                        }`}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill={isCommentLiked ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                        </svg>
                        {(c.likeCount || 0) > 0 && (
                          <span className="text-[9px] font-bold">{c.likeCount}</span>
                        )}
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            {/* Comment Composer */}
            <div className="p-3.5 border-t border-white/10 flex items-center gap-2 bg-[#121212]">
              <input
                type="text"
                placeholder={user ? "Add a comment..." : "Log in to comment"}
                disabled={!user || isPostingComment}
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handlePostComment(); }}
                className="flex-1 bg-white/5 border border-white/10 rounded-full px-4 py-2.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-white/30"
              />
              <button
                onClick={handlePostComment}
                disabled={!user || !commentText.trim() || isPostingComment}
                className="px-4 py-2.5 rounded-full bg-white text-black font-bold text-xs disabled:opacity-40 active:scale-95 transition-all shadow-sm"
              >
                {isPostingComment ? <Spinner /> : 'Post'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* More Options / Attribution Modal */}
      {optionsReel && (
        <div 
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end justify-center animate-fade-in"
          onClick={() => setOptionsReel(null)}
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm bg-[#161616] rounded-t-[32px] p-6 border-t border-white/10 shadow-2xl flex flex-col gap-3 animate-slide-up"
          >
            <div className="w-12 h-1.5 bg-neutral-600 rounded-full mx-auto mb-2" />
            <h4 className="font-bold text-sm text-white mb-1">Reel Options</h4>

            <button
              onClick={() => {
                window.open(optionsReel.videoUrl, '_blank');
                setOptionsReel(null);
              }}
              className="w-full py-3 px-4 rounded-2xl bg-neutral-900 hover:bg-neutral-800 text-white font-semibold text-xs text-left flex items-center justify-between"
            >
              <span>Download / Open Video</span>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </button>

            <button
              onClick={() => {
                onViewProfile({
                  uploaderUid: optionsReel.uploaderUid,
                  uploaderName: optionsReel.uploaderName,
                  uploaderPhotoURL: optionsReel.uploaderPhotoURL || ''
                });
                setOptionsReel(null);
              }}
              className="w-full py-3 px-4 rounded-2xl bg-neutral-900 hover:bg-neutral-800 text-white font-semibold text-xs text-left flex items-center justify-between"
            >
              <span>View Creator Profile</span>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>

            <button
              onClick={() => setOptionsReel(null)}
              className="w-full py-3 px-4 rounded-2xl bg-white/10 text-neutral-300 font-semibold text-xs text-center mt-1"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReelsPage;
