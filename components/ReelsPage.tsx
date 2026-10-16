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
  toggleCommentLike,
  deleteComment
} from '../services/firestoreService';
import Spinner from './Spinner';
import { downloadMedia } from '../services/mediaDownloader';
import { isVideoUrl } from '../utils/mediaUtils';

// Clean flat dark SVG data poster to eliminate Chromium vendor gray placeholder
const DARK_VIDEO_POSTER = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'%3E%3Crect width='1' height='1' fill='%23121212'/%3E%3C/svg%3E";

interface ReelsPageProps {
  user: User | null;
  onBack: () => void;
  onViewProfile: (profile: ProfileUser) => void;
  onShare?: (reel: ImageMeta) => void;
  onLikeToggle?: (image: ImageMeta) => void;
  onImageUpdate?: (image: ImageMeta) => void;
  initialReelId?: string | null;
  allImages?: ImageMeta[];
  onLoginClick?: () => void;
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

// Extract reels from existing feed for instant zero-waiting playback
const extractReelsFromImages = (images: ImageMeta[], userUid?: string | null, startId?: string | null): ReelItem[] => {
  const videoImages = images.filter(img => {
    const u = img.imageUrl || '';
    return isVideoUrl(u) || !!u.match(/\.(mp4|webm|mov|ogg|avi|mkv|m4v)(\?.*)?$/i);
  });

  let mapped: ReelItem[] = videoImages.map(img => {
    const isPosterVideo = isVideoUrl(img.thumbnailUrl || '');
    const safePoster = !isPosterVideo && img.thumbnailUrl ? img.thumbnailUrl : undefined;

    return {
      id: img.id,
      videoUrl: img.imageUrl,
      poster: safePoster,
      width: img.width || 1080,
      height: img.height || 1920,
      duration: 15,
      title: img.title || 'Reels',
      description: img.description || '',
      uploaderUid: img.uploaderUid,
      uploaderName: img.uploaderName || 'Creator',
      uploaderPhotoURL: img.uploaderPhotoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${img.uploaderName || 'Creator'}`,
      tags: img.flags || [],
      concepts: img.aiConcepts || [],
      likeCount: typeof img.likeCount === 'number' ? img.likeCount : (img.likedBy?.length || 0),
      commentCount: img.commentCount || 0,
      shareCount: 0,
      hasLiked: !!(userUid && img.likedBy?.includes(userUid)),
      hasSaved: false,
      isFollowing: false,
      uploadedAt: img.uploadedAt
    };
  });

  if (startId) {
    const target = mapped.find(v => v.id.split('_loop_')[0] === startId.split('_loop_')[0]);
    if (target) {
      mapped = [target, ...mapped.filter(v => v.id !== target.id)];
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
  onImageUpdate,
  initialReelId,
  allImages = [],
  onLoginClick
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // Instant hydration from memory or cached feed
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

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(() => reels.length === 0);
  const [nextCursor, setNextCursor] = useState<number | null>(0);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Volume & Mute control (persisted in localStorage)
  const [isMuted, setIsMuted] = useState<boolean>(() => {
    try {
      const item = localStorage.getItem('gg_video_muted');
      return item === null ? true : item === 'true';
    } catch {
      return true;
    }
  });

  const [volume, setVolume] = useState<number>(() => {
    try {
      const v = localStorage.getItem('gg_video_volume');
      return v !== null ? parseFloat(v) : 0.8;
    } catch {
      return 0.8;
    }
  });

  const [isPlaying, setIsPlaying] = useState(true);
  const [speed, setSpeed] = useState<number>(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);

  // Floating hearts animation
  const [hearts, setHearts] = useState<FloatingHeart[]>([]);
  const [centerIcon, setCenterIcon] = useState<'play' | 'pause' | null>(null);
  const centerIconTimerRef = useRef<any>(null);

  // Comments drawer
  const [isCommentsOpen, setIsCommentsOpen] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [isPostingComment, setIsPostingComment] = useState(false);
  const [replyToComment, setReplyToComment] = useState<{ id: string; userName: string } | null>(null);

  // Toast message
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimerRef = useRef<any>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastMessage(null), 2500);
  }, []);

  // Followed creators set
  const [followedCreatorsSet, setFollowedCreatorsSet] = useState<Set<string>>(new Set());

  // Video references
  const videoRefs = useRef<Map<number, HTMLVideoElement>>(new Map());
  const detectedAspectMap = useRef<Map<string, boolean>>(new Map());
  const [, setAspectVersion] = useState(0);

  // Watch metrics tracking
  const watchStartTimeRef = useRef<number>(Date.now());
  const loopCountRef = useRef<number>(0);
  const prevActiveIndexRef = useRef(-1);

  // Wheel cooldown guard for buttery desktop wheel scrolling
  const wheelLockRef = useRef(false);
  const wheelTimerRef = useRef<any>(null);
  const isProgrammaticScrollRef = useRef(false);
  const programmaticScrollTimerRef = useRef<any>(null);
  const scrollTimeoutRef = useRef<any>(null);

  // Touch tracking for mobile swipe
  const touchStartY = useRef<number>(0);
  const touchDeltaY = useRef<number>(0);

  // Sync follow list
  useEffect(() => {
    if (user?.uid) {
      getFollowingList(user.uid).then(list => {
        if (Array.isArray(list)) {
          setFollowedCreatorsSet(new Set(list.map(u => u.uploaderUid)));
        }
      }).catch(() => {});
    }
  }, [user?.uid]);

  // Update user in tracker
  useEffect(() => {
    reelsTracker.setUserUid(user?.uid || null);
  }, [user]);

  // Aspect ratio detection
  const handleVideoMetadata = useCallback((reelId: string, video: HTMLVideoElement) => {
    if (video.videoWidth > 0 && video.videoHeight > 0) {
      const isVertical = (video.videoHeight / video.videoWidth) >= 1.35;
      detectedAspectMap.current.set(reelId, isVertical);
      setAspectVersion(v => v + 1);
    }
  }, []);

  const isReelVertical = useCallback((reel: ReelItem): boolean => {
    const detected = detectedAspectMap.current.get(reel.id);
    if (detected !== undefined) return detected;
    const tags = (reel.tags || []).map(t => t.toLowerCase());
    if (tags.some(t => t.includes('16:9') || t.includes('landscape') || t.includes('horizontal'))) return false;
    if (tags.some(t => t.includes('9:16') || t.includes('vertical') || t.includes('reel') || t.includes('shorts'))) return true;
    if (reel.width && reel.height) {
      return (reel.height / reel.width >= 1.35);
    }
    return false;
  }, []);

  // Initial feed background loading (SWR)
  useEffect(() => {
    let active = true;

    const loadInitial = async () => {
      try {
        const res = await fetchReelsFeed({
          userUid: user?.uid,
          cursor: 0,
          limit: 10,
          startId: initialReelId || undefined
        });

        if (!active) return;
        if (res.reels && res.reels.length > 0) {
          setReels(prev => {
            if (prev.length === 0) return res.reels;

            if (initialReelId) {
              const target = res.reels.find(r => r.id.split('_loop_')[0] === initialReelId.split('_loop_')[0]);
              if (target) {
                return [target, ...res.reels.filter(r => r.id !== target.id)];
              }
            }

            // Protect active playing reel so it is NEVER yanked or replaced
            const activeReel = prev[currentIndex] || prev[0];
            const activeBaseId = activeReel.id.split('_loop_')[0].split('_c')[0];

            const remainingIncoming = res.reels.filter(r => {
              const rBase = r.id.split('_loop_')[0].split('_c')[0];
              return rBase !== activeBaseId;
            });

            if (currentIndex === 0) {
              return [activeReel, ...remainingIncoming];
            }

            const beforeCurrent = prev.slice(0, currentIndex);
            return [...beforeCurrent, activeReel, ...remainingIncoming];
          });
          setNextCursor(res.nextCursor);
          setHasMore(res.hasMore);
          try {
            localStorage.setItem('cached_reels_feed', JSON.stringify(res.reels.slice(0, 15)));
          } catch {}
        }
      } catch (err) {
        console.warn("Reels initial feed fetch error:", err);
      } finally {
        if (active) setIsLoading(false);
      }
    };

    loadInitial();
    return () => { active = false; };
  }, [user?.uid, initialReelId]);

  // Load more reels when near bottom (infinite circular feed)
  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore || nextCursor === null) return;
    setIsLoadingMore(true);
    try {
      const res = await fetchReelsFeed({
        userUid: user?.uid,
        cursor: nextCursor,
        limit: 10
      });
      if (res.reels && res.reels.length > 0) {
        setReels(prev => {
          const existingIds = new Set(prev.map(r => r.id));
          const safeIncoming = res.reels.map((r, idx) => {
            if (existingIds.has(r.id)) {
              return {
                ...r,
                id: `${r.id}_c${Date.now()}_${idx}`
              };
            }
            return r;
          });
          const merged = [...prev, ...safeIncoming];
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

  // Transition handler
  const handleReelTransition = useCallback((prevIdx: number, nextIdx: number) => {
    const prevReel = reels[prevIdx];
    if (prevReel) {
      const activeVideo = videoRefs.current.get(prevIdx);
      const watchMs = Date.now() - watchStartTimeRef.current;
      const dur = activeVideo?.duration || prevReel.duration || 15;

      reelsTracker.track({
        videoId: prevReel.id,
        watchMs,
        duration: dur,
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
    setCurrentTime(0);

    if (nextIdx >= reels.length - 4) {
      loadMore();
    }
  }, [reels, isMuted, loadMore]);

  // Change active reel smoothly
  const goToReel = useCallback((nextIdx: number) => {
    if (nextIdx < 0 || nextIdx >= reels.length) return;
    const prevIdx = currentIndex;
    setCurrentIndex(nextIdx);
    handleReelTransition(prevIdx, nextIdx);

    isProgrammaticScrollRef.current = true;
    if (programmaticScrollTimerRef.current) clearTimeout(programmaticScrollTimerRef.current);
    programmaticScrollTimerRef.current = setTimeout(() => {
      isProgrammaticScrollRef.current = false;
    }, 450);

    const container = containerRef.current;
    if (container) {
      const h = container.clientHeight || window.innerHeight;
      container.scrollTo({ top: nextIdx * h, behavior: 'smooth' });
    }
  }, [currentIndex, reels.length, handleReelTransition]);

  // Active Video Playback Synchronization & Autoplay Trigger
  const playActiveVideo = useCallback(() => {
    const video = videoRefs.current.get(currentIndex);
    if (!video) return;

    video.muted = isMuted;
    video.volume = volume;
    video.playbackRate = speed;

    if (isPlaying) {
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          // Autoplay with audio was blocked by browser policy; fallback to muted autoplay
          if (!video.muted) {
            video.muted = true;
            setIsMuted(true);
            video.play().catch(() => {});
          }
        });
      }
    } else {
      video.pause();
    }
  }, [currentIndex, isPlaying, isMuted, volume, speed]);

  useEffect(() => {
    const isNewReel = prevActiveIndexRef.current !== currentIndex;
    prevActiveIndexRef.current = currentIndex;

    videoRefs.current.forEach((video, idx) => {
      if (idx === currentIndex) {
        if (isNewReel) {
          video.currentTime = 0;
        }
        playActiveVideo();
      } else if (Math.abs(idx - currentIndex) === 1) {
        video.pause();
        if (video.preload !== 'auto') video.preload = 'auto';
      } else {
        video.pause();
      }
    });
  }, [currentIndex, isPlaying, isMuted, volume, speed, reels.length, playActiveVideo]);

  // Time update listener on active video
  useEffect(() => {
    const activeVideo = videoRefs.current.get(currentIndex);
    if (!activeVideo) return;

    const onTimeUpdate = () => {
      if (!isScrubbing) {
        setCurrentTime(activeVideo.currentTime);
      }
      setDuration(activeVideo.duration || 0);
    };

    const onWaiting = () => setIsBuffering(true);
    const onPlaying = () => setIsBuffering(false);
    const onEnded = () => {
      loopCountRef.current += 1;
      activeVideo.currentTime = 0;
      activeVideo.play().catch(() => {});
    };

    activeVideo.addEventListener('timeupdate', onTimeUpdate);
    activeVideo.addEventListener('waiting', onWaiting);
    activeVideo.addEventListener('playing', onPlaying);
    activeVideo.addEventListener('ended', onEnded);

    return () => {
      activeVideo.removeEventListener('timeupdate', onTimeUpdate);
      activeVideo.removeEventListener('waiting', onWaiting);
      activeVideo.removeEventListener('playing', onPlaying);
      activeVideo.removeEventListener('ended', onEnded);
    };
  }, [currentIndex, isScrubbing]);

  // Play / Pause toggle
  const togglePlayPause = useCallback(() => {
    setIsPlaying(prev => {
      const next = !prev;
      setCenterIcon(next ? 'play' : 'pause');
      if (centerIconTimerRef.current) clearTimeout(centerIconTimerRef.current);
      centerIconTimerRef.current = setTimeout(() => setCenterIcon(null), 600);
      return next;
    });
  }, []);

  // Mute toggle
  const toggleMute = useCallback(() => {
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

  // Volume slider change
  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    try {
      localStorage.setItem('gg_video_volume', val.toString());
    } catch {}
    const activeVideo = videoRefs.current.get(currentIndex);
    if (activeVideo) {
      activeVideo.volume = val;
      if (val === 0) {
        activeVideo.muted = true;
        setIsMuted(true);
      } else if (isMuted) {
        activeVideo.muted = false;
        setIsMuted(false);
      }
    }
  }, [currentIndex, isMuted]);

  // Fullscreen toggle
  const toggleFullscreen = useCallback(() => {
    const card = cardRef.current;
    if (!card) return;
    if (!document.fullscreenElement) {
      card.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }, []);

  // Scrubber drag / click
  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    const activeVideo = videoRefs.current.get(currentIndex);
    if (!activeVideo || !duration) return;

    const track = e.currentTarget;
    const rect = track.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const pos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const targetTime = pos * duration;

    activeVideo.currentTime = targetTime;
    setCurrentTime(targetTime);
  }, [currentIndex, duration]);

  // Like / Unlike action
  const handleLikeClick = useCallback(async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!user) {
      if (onLoginClick) onLoginClick();
      else showToast("Please sign in to like reels");
      return;
    }

    const currentReel = reels[currentIndex];
    if (!currentReel) return;

    const baseId = currentReel.id.split('_loop_')[0].split('_c')[0];
    const nextLiked = !currentReel.hasLiked;
    const nextCount = Math.max(0, currentReel.likeCount + (nextLiked ? 1 : -1));

    // Optimistic UI update
    setReels(prev => prev.map((r, i) => i === currentIndex ? {
      ...r,
      hasLiked: nextLiked,
      likeCount: nextCount
    } : r));

    const asImageMeta: ImageMeta = {
      id: baseId,
      imageUrl: currentReel.videoUrl,
      title: currentReel.title,
      description: currentReel.description || '',
      uploaderUid: currentReel.uploaderUid,
      uploaderName: currentReel.uploaderName,
      uploaderPhotoURL: currentReel.uploaderPhotoURL || '',
      likedBy: currentReel.hasLiked ? [user.uid] : [], // Pass pre-toggle state so App.tsx correctly inverts it
      likeCount: currentReel.likeCount,
      flags: currentReel.tags,
      license: 'Free',
      uploadedAt: currentReel.uploadedAt || ({} as any)
    };

    if (onLikeToggle) {
      onLikeToggle(asImageMeta);
    } else {
      try {
        await toggleImageLike({ ...asImageMeta, id: baseId }, user);
      } catch (err) {
        console.warn("Reel like error:", err);
      }
    }
  }, [user, reels, currentIndex, onLoginClick, showToast, onLikeToggle]);

  // Double tap to like
  const handleDoubleTap = useCallback((clientX: number, clientY: number) => {
    const newHeart: FloatingHeart = {
      id: Date.now() + Math.random(),
      x: clientX,
      y: clientY,
      rotation: (Math.random() - 0.5) * 35
    };
    setHearts(prev => [...prev, newHeart]);
    setTimeout(() => {
      setHearts(prev => prev.filter(h => h.id !== newHeart.id));
    }, 900);

    const currentReel = reels[currentIndex];
    if (currentReel && !currentReel.hasLiked) {
      handleLikeClick();
    }
  }, [reels, currentIndex, handleLikeClick]);

  // Tap handler (distinguish single vs double click)
  const tapTimeoutRef = useRef<any>(null);
  const handleVideoAreaClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (tapTimeoutRef.current) {
      clearTimeout(tapTimeoutRef.current);
      tapTimeoutRef.current = null;
      handleDoubleTap(x, y);
    } else {
      tapTimeoutRef.current = setTimeout(() => {
        tapTimeoutRef.current = null;
        togglePlayPause();
      }, 250);
    }
  }, [handleDoubleTap, togglePlayPause]);

  // Native container scroll synchronizer (touchpad, scrollbar, or native gestures)
  const handleContainerScroll = useCallback(() => {
    if (isProgrammaticScrollRef.current) return;
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => {
      if (isProgrammaticScrollRef.current) return;
      const container = containerRef.current;
      if (!container) return;
      const h = container.clientHeight;
      if (!h) return;

      const newIndex = Math.round(container.scrollTop / h);
      if (newIndex >= 0 && newIndex < reels.length && newIndex !== currentIndex) {
        const prevIdx = currentIndex;
        setCurrentIndex(newIndex);
        handleReelTransition(prevIdx, newIndex);
      }
    }, 60);
  }, [currentIndex, reels.length, handleReelTransition]);

  // Non-passive wheel listener on card to cleanly prevent jerky browser multi-skips
  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;

    const onCardWheel = (e: WheelEvent) => {
      // Allow normal scroll inside comments drawer if open
      if (isCommentsOpen) return;

      e.preventDefault();
      if (wheelLockRef.current) return;
      if (Math.abs(e.deltaY) < 20) return;

      wheelLockRef.current = true;
      if (wheelTimerRef.current) clearTimeout(wheelTimerRef.current);
      wheelTimerRef.current = setTimeout(() => {
        wheelLockRef.current = false;
      }, 420);

      if (e.deltaY > 0) {
        goToReel(currentIndex + 1);
      } else {
        goToReel(currentIndex - 1);
      }
    };

    card.addEventListener('wheel', onCardWheel, { passive: false });
    return () => {
      card.removeEventListener('wheel', onCardWheel);
    };
  }, [currentIndex, goToReel, isCommentsOpen]);

  // Desktop Mouse Wheel handler for outer backdrop
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (wheelLockRef.current || isCommentsOpen) return;
    if (Math.abs(e.deltaY) < 25) return;

    wheelLockRef.current = true;
    if (wheelTimerRef.current) clearTimeout(wheelTimerRef.current);
    wheelTimerRef.current = setTimeout(() => {
      wheelLockRef.current = false;
    }, 420);

    if (e.deltaY > 0) {
      goToReel(currentIndex + 1);
    } else {
      goToReel(currentIndex - 1);
    }
  }, [currentIndex, goToReel, isCommentsOpen]);

  // Mobile Touch Gestures
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    touchDeltaY.current = 0;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchDeltaY.current = e.touches[0].clientY - touchStartY.current;
  };

  const handleTouchEnd = () => {
    if (Math.abs(touchDeltaY.current) > 50) {
      if (touchDeltaY.current < 0) {
        goToReel(currentIndex + 1);
      } else {
        goToReel(currentIndex - 1);
      }
    }
    touchDeltaY.current = 0;
  };

  // Follow creator toggle
  const handleFollowToggle = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) {
      if (onLoginClick) onLoginClick();
      else showToast("Please sign in to follow creators");
      return;
    }

    const currentReel = reels[currentIndex];
    if (!currentReel || currentReel.uploaderUid === user.uid) return;

    const creatorUid = currentReel.uploaderUid;
    const isNowFollowing = !followedCreatorsSet.has(creatorUid);

    setFollowedCreatorsSet(prev => {
      const next = new Set(prev);
      if (isNowFollowing) next.add(creatorUid);
      else next.delete(creatorUid);
      return next;
    });

    try {
      await toggleFollowUser(
        user.uid,
        creatorUid,
        user.displayName || 'User',
        user.photoURL || ''
      );
      showToast(isNowFollowing ? `Following ${currentReel.uploaderName}` : `Unfollowed ${currentReel.uploaderName}`);
    } catch {
      showToast("Failed to update follow status");
    }
  }, [user, reels, currentIndex, followedCreatorsSet, onLoginClick, showToast]);

  // Share action
  const handleShareClick = useCallback(async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    const currentReel = reels[currentIndex];
    if (!currentReel) return;

    const baseId = currentReel.id.split('_loop_')[0].split('_c')[0];
    const shareUrl = `${window.location.origin}/reels?reel=${baseId}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: currentReel.title || 'Check out this Reel on Glass Gallery',
          text: currentReel.description || 'Watch this video on Glass Gallery',
          url: shareUrl
        });
        showToast("Shared successfully!");
        return;
      } catch {}
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      showToast("Reel link copied to clipboard!");
    } catch {
      showToast("Share URL: " + shareUrl);
    }
  }, [reels, currentIndex, showToast]);

  // Download video
  const handleDownloadClick = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    const currentReel = reels[currentIndex];
    if (!currentReel) return;
    showToast("Starting download...");
    try {
      await downloadMedia(currentReel.videoUrl, currentReel.title || 'reels_video', 'mp4');
      showToast("Download started!");
    } catch {
      showToast("Failed to download video");
    }
  }, [reels, currentIndex, showToast]);

  // Keyboard controls for desktop
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;

      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault();
        goToReel(currentIndex + 1);
      } else if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault();
        goToReel(currentIndex - 1);
      } else if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        togglePlayPause();
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        toggleMute();
      } else if (e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        handleLikeClick();
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        toggleFullscreen();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, goToReel, togglePlayPause, toggleMute, handleLikeClick, toggleFullscreen]);

  // Open comments
  const handleOpenComments = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    const currentReel = reels[currentIndex];
    if (!currentReel) return;

    setIsCommentsOpen(true);
    setIsLoadingComments(true);
    try {
      const baseId = currentReel.id.split('_loop_')[0].split('_c')[0];
      const res = await getCommentsForImage(baseId);
      setComments(res || []);
    } catch {
      setComments([]);
    } finally {
      setIsLoadingComments(false);
    }
  }, [reels, currentIndex]);

  // Post comment
  const handlePostComment = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      if (onLoginClick) onLoginClick();
      return;
    }
    if (!commentText.trim() || isPostingComment) return;

    const currentReel = reels[currentIndex];
    if (!currentReel) return;

    const baseId = currentReel.id.split('_loop_')[0].split('_c')[0];
    setIsPostingComment(true);

    try {
      const newComment = await addCommentToImage(
        baseId,
        user,
        commentText.trim(),
        replyToComment ? replyToComment.id : null
      );

      if (newComment) {
        setComments(prev => [newComment, ...prev]);
        setCommentText('');
        setReplyToComment(null);
        setReels(prev => prev.map((r, i) => i === currentIndex ? {
          ...r,
          commentCount: r.commentCount + 1
        } : r));
        showToast("Comment posted!");
      }
    } catch (err) {
      console.error("Error posting comment:", err);
      showToast("Failed to post comment");
    } finally {
      setIsPostingComment(false);
    }
  }, [user, commentText, isPostingComment, reels, currentIndex, replyToComment, onLoginClick, showToast]);

  // Like comment
  const handleCommentLike = useCallback(async (commentId: string) => {
    if (!user) {
      if (onLoginClick) onLoginClick();
      return;
    }
    try {
      const res = await toggleCommentLike(commentId, user.uid);
      setComments(prev => prev.map(c => {
        if (c.id === commentId) {
          const isLiked = res.isLiked;
          const oldLikedBy = c.likedBy || [];
          const newLikedBy = isLiked
            ? (oldLikedBy.includes(user.uid) ? oldLikedBy : [...oldLikedBy, user.uid])
            : oldLikedBy.filter(uid => uid !== user.uid);
          return {
            ...c,
            likedBy: newLikedBy,
            likeCount: newLikedBy.length
          };
        }
        return c;
      }));
    } catch (err) {
      console.warn("Failed to like comment:", err);
    }
  }, [user, onLoginClick]);

  // Delete comment
  const handleCommentDelete = useCallback(async (commentId: string) => {
    if (!user) return;
    try {
      await deleteComment(commentId, user.uid);
      setComments(prev => prev.filter(c => c.id !== commentId));
      setReels(prev => prev.map((r, i) => i === currentIndex ? {
        ...r,
        commentCount: Math.max(0, r.commentCount - 1)
      } : r));
      showToast("Comment deleted");
    } catch (err) {
      showToast("Failed to delete comment");
    }
  }, [user, currentIndex, showToast]);

  const currentReel = reels[currentIndex];

  if (isLoading && reels.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] w-full text-center p-6">
        <Spinner />
        <p className="mt-4 text-sm text-secondary font-medium">Curating personalized Reels feed...</p>
      </div>
    );
  }

  if (reels.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] w-full text-center p-6">
        <div className="w-16 h-16 rounded-2xl bg-surface flex items-center justify-center text-secondary mb-4 shadow-md">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        </div>
        <h3 className="text-lg font-bold text-primary">No Reels Found</h3>
        <p className="text-sm text-secondary mt-1 max-w-sm">Upload video shorts or explore our high-resolution photo collection.</p>
        <button onClick={onBack} className="mt-6 px-6 py-2.5 rounded-full bg-surface text-primary font-medium hover:bg-surface/80 border border-border shadow-sm transition-all">
          Go Back
        </button>
      </div>
    );
  }

  return (
    <div 
      onWheel={handleWheel}
      className="relative w-full h-[calc(100vh-64px)] md:h-[calc(100vh-24px)] flex items-center justify-center overflow-hidden select-none"
    >
      {/* Toast notification banner */}
      {toastMessage && (
        <div className="fixed top-6 left-1/2 transform -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-surface/90 backdrop-blur-md border border-border/80 shadow-2xl text-xs font-semibold text-primary animate-fade-in pointer-events-none">
          {toastMessage}
        </div>
      )}

      {/* Desktop Left Navigation Floater (Previous Video) */}
      <div className="hidden lg:flex flex-col gap-3 mr-5 z-20">
        <button
          onClick={() => goToReel(currentIndex - 1)}
          disabled={currentIndex === 0}
          title="Previous Video (Arrow Up or Mouse Wheel Up)"
          className={`w-12 h-12 rounded-full flex items-center justify-center border shadow-xl transition-all duration-200 ${
            currentIndex === 0
              ? 'opacity-25 border-border/20 bg-surface/30 cursor-not-allowed text-secondary'
              : 'border-border/60 bg-surface/85 hover:bg-surface text-primary hover:scale-110 active:scale-95 cursor-pointer backdrop-blur-md'
          }`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
          </svg>
        </button>
        <button
          onClick={() => goToReel(currentIndex + 1)}
          title="Next Video (Arrow Down or Mouse Wheel Down)"
          className="w-12 h-12 rounded-full flex items-center justify-center border border-border/60 bg-surface/85 hover:bg-surface text-primary shadow-xl hover:scale-110 active:scale-95 cursor-pointer transition-all duration-200 backdrop-blur-md"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* Main Reels Card Container */}
      <div
        ref={cardRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="relative w-full max-w-[420px] h-full md:max-h-[820px] md:rounded-2xl overflow-hidden bg-black shadow-2xl border border-border/40 flex items-center justify-center"
      >
        {/* Vertical Pager Container */}
        <div
          ref={containerRef}
          onScroll={handleContainerScroll}
          className="w-full h-full overflow-y-scroll snap-y snap-mandatory hidden-scrollbar"
          style={{ scrollSnapType: 'y mandatory', WebkitOverflowScrolling: 'touch' }}
        >
          {reels.map((reel, idx) => {
            const isCurrent = idx === currentIndex;
            const isAdjacent = Math.abs(idx - currentIndex) <= 1;
            const isVertical = isReelVertical(reel);
            const hasValidImagePoster = reel.poster && !isVideoUrl(reel.poster);

            return (
              <div
                key={reel.id}
                className="relative w-full h-full snap-start snap-always shrink-0 flex items-center justify-center overflow-hidden bg-black"
                style={{ height: '100%' }}
              >
                {/* Ambient Blurred Background for landscape/square videos */}
                {!isVertical && (
                  <div
                    className="absolute inset-0 z-0 bg-cover bg-center filter blur-3xl scale-125 opacity-35 pointer-events-none"
                    style={{ backgroundImage: hasValidImagePoster ? `url(${reel.poster})` : 'none' }}
                  />
                )}

                {/* Video Element */}
                {isAdjacent ? (
                  <video
                    ref={el => {
                      if (el) {
                        videoRefs.current.set(idx, el);
                        if (isCurrent && isPlaying && el.paused) {
                          el.play().catch(() => {});
                        }
                      } else {
                        videoRefs.current.delete(idx);
                      }
                    }}
                    src={reel.videoUrl}
                    poster={hasValidImagePoster ? reel.poster : DARK_VIDEO_POSTER}
                    playsInline
                    loop
                    preload={isCurrent ? 'auto' : 'metadata'}
                    muted={isMuted}
                    onLoadedMetadata={e => {
                      handleVideoMetadata(reel.id, e.currentTarget);
                      if (isCurrent && isPlaying) {
                        e.currentTarget.play().catch(() => {});
                      }
                    }}
                    onCanPlay={e => {
                      if (isCurrent && isPlaying && e.currentTarget.paused) {
                        e.currentTarget.play().catch(() => {});
                      }
                    }}
                    className={`relative z-10 w-full h-full ${isVertical ? 'object-cover' : 'object-contain'} cursor-pointer`}
                    onClick={handleVideoAreaClick}
                  />
                ) : (
                  <div className="w-full h-full bg-[#121212] flex items-center justify-center">
                    <img
                      src={hasValidImagePoster ? reel.poster : DARK_VIDEO_POSTER}
                      alt=""
                      className="w-full h-full object-cover opacity-60"
                    />
                  </div>
                )}

                {/* Double Tap Floating Heart Particles */}
                {isCurrent && hearts.map(h => (
                  <div
                    key={h.id}
                    className="absolute z-40 pointer-events-none animate-ping text-red-500"
                    style={{
                      left: h.x,
                      top: h.y,
                      transform: `translate(-50%, -50%) rotate(${h.rotation}deg)`
                    }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-20 w-20 fill-current drop-shadow-2xl" viewBox="0 0 24 24">
                      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                    </svg>
                  </div>
                ))}

                {/* Central Play/Pause Icon Animation */}
                {isCurrent && centerIcon && (
                  <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
                    <div className="w-20 h-20 rounded-full bg-black/60 backdrop-blur-md border border-white/20 flex items-center justify-center text-white shadow-2xl animate-scale-up">
                      {centerIcon === 'play' ? (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 fill-current ml-1" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 fill-current" viewBox="0 0 24 24">
                          <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                        </svg>
                      )}
                    </div>
                  </div>
                )}

                {/* Buffering Indicator */}
                {isCurrent && isBuffering && (
                  <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none bg-black/20">
                    <Spinner />
                  </div>
                )}

                {/* Bottom Shadow Gradient Overlay for contrast */}
                <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-black/85 via-black/40 to-transparent pointer-events-none z-10" />

                {/* Reel Info (Bottom Left) */}
                <div className="absolute bottom-14 left-4 right-16 z-20 pointer-events-auto text-left text-white drop-shadow-md">
                  <div className="flex items-center gap-2.5 mb-2">
                    <div
                      onClick={() => onViewProfile({
                        uploaderUid: reel.uploaderUid,
                        uploaderName: reel.uploaderName,
                        uploaderPhotoURL: reel.uploaderPhotoURL || ''
                      })}
                      className="cursor-pointer flex items-center gap-2 group"
                    >
                      <img
                        src={reel.uploaderPhotoURL}
                        alt={reel.uploaderName}
                        className="w-9 h-9 rounded-full object-cover border-2 border-white/80 group-hover:scale-105 transition-transform"
                      />
                      <span className="font-bold text-sm tracking-wide text-white group-hover:underline">
                        @{reel.uploaderName}
                      </span>
                    </div>

                    {user?.uid !== reel.uploaderUid && (
                      <button
                        onClick={handleFollowToggle}
                        className={`text-xs font-semibold px-3 py-1 rounded-full border transition-all ${
                          followedCreatorsSet.has(reel.uploaderUid)
                            ? 'bg-white/20 border-white/40 text-white'
                            : 'bg-accent text-surface border-transparent hover:opacity-90 font-bold'
                        }`}
                      >
                        {followedCreatorsSet.has(reel.uploaderUid) ? 'Following' : 'Follow'}
                      </button>
                    )}
                  </div>

                  {reel.title && (
                    <h4 className="font-medium text-sm line-clamp-1 mb-1 text-white/95">
                      {reel.title}
                    </h4>
                  )}

                  {reel.description && (
                    <p className="text-xs text-white/80 line-clamp-2 leading-relaxed">
                      {reel.description}
                    </p>
                  )}

                  {/* Tags */}
                  {reel.tags && reel.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {reel.tags.slice(0, 3).map((tag, tIdx) => (
                        <span key={tIdx} className="text-[11px] font-medium text-accent/90">
                          #{tag.replace(/^#/, '')}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Right Action Rail (Vertical Buttons) */}
                <div className="absolute right-3 bottom-14 z-20 flex flex-col items-center gap-4">
                  {/* Like Button */}
                  <div className="flex flex-col items-center">
                    <button
                      onClick={handleLikeClick}
                      className={`w-11 h-11 rounded-full flex items-center justify-center backdrop-blur-md border border-white/10 transition-all hover:scale-110 active:scale-90 ${
                        reel.hasLiked ? 'bg-red-500/25 text-red-500' : 'bg-black/40 text-white hover:bg-black/60'
                      }`}
                      title={reel.hasLiked ? 'Unlike' : 'Like'}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 24 24" fill={reel.hasLiked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={reel.hasLiked ? 0 : 2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                      </svg>
                    </button>
                    <span className="text-[11px] font-bold text-white mt-1 drop-shadow">
                      {reel.likeCount}
                    </span>
                  </div>

                  {/* Comment Button */}
                  <div className="flex flex-col items-center">
                    <button
                      onClick={handleOpenComments}
                      className="w-11 h-11 rounded-full flex items-center justify-center bg-black/40 hover:bg-black/60 backdrop-blur-md border border-white/10 text-white transition-all hover:scale-110 active:scale-90"
                      title="Comments"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                    </button>
                    <span className="text-[11px] font-bold text-white mt-1 drop-shadow">
                      {reel.commentCount}
                    </span>
                  </div>

                  {/* Share Button */}
                  <div className="flex flex-col items-center">
                    <button
                      onClick={handleShareClick}
                      className="w-11 h-11 rounded-full flex items-center justify-center bg-black/40 hover:bg-black/60 backdrop-blur-md border border-white/10 text-white transition-all hover:scale-110 active:scale-90"
                      title="Share"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                      </svg>
                    </button>
                    <span className="text-[11px] font-bold text-white mt-1 drop-shadow">
                      Share
                    </span>
                  </div>

                  {/* Download Video Button */}
                  <div className="flex flex-col items-center">
                    <button
                      onClick={handleDownloadClick}
                      className="w-11 h-11 rounded-full flex items-center justify-center bg-black/40 hover:bg-black/60 backdrop-blur-md border border-white/10 text-white transition-all hover:scale-110 active:scale-90"
                      title="Download Video"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                    </button>
                    <span className="text-[11px] font-bold text-white mt-1 drop-shadow">
                      Save
                    </span>
                  </div>
                </div>

                {/* Complete Bottom Player Controls Bar (Playback Scrubber + Controls) */}
                <div className="absolute inset-x-0 bottom-0 z-30 p-3 bg-gradient-to-t from-black/95 to-transparent flex flex-col gap-1.5">
                  {/* Interactive Scrubber Bar */}
                  <div
                    onClick={handleSeek}
                    className="relative w-full h-3 flex items-center cursor-pointer group"
                  >
                    <div className="w-full h-1 bg-white/20 rounded-full overflow-hidden group-hover:h-1.5 transition-all">
                      <div
                        className="h-full bg-accent rounded-full transition-all"
                        style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
                      />
                    </div>
                    {/* Scrub knob on hover */}
                    <div
                      className="absolute w-3 h-3 bg-accent rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity transform -translate-x-1/2"
                      style={{ left: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
                    />
                  </div>

                  {/* Media Controls Toolbar */}
                  <div className="flex items-center justify-between text-white text-xs">
                    {/* Left: Play/Pause, Volume Slider, Time */}
                    <div className="flex items-center gap-3">
                      <button
                        onClick={togglePlayPause}
                        className="p-1 hover:text-accent transition-colors"
                        title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
                      >
                        {isPlaying ? (
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 fill-current" viewBox="0 0 24 24">
                            <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                          </svg>
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 fill-current" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        )}
                      </button>

                      {/* Sound / Volume Control with Slider */}
                      <div className="flex items-center gap-1.5 group/vol">
                        <button
                          onClick={toggleMute}
                          className="p-1 hover:text-accent transition-colors"
                          title={isMuted ? 'Unmute (M)' : 'Mute (M)'}
                        >
                          {isMuted || volume === 0 ? (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                            </svg>
                          ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                            </svg>
                          )}
                        </button>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          value={isMuted ? 0 : volume}
                          onChange={handleVolumeChange}
                          className="w-16 h-1 accent-accent cursor-pointer opacity-0 group-hover/vol:opacity-100 transition-opacity"
                        />
                      </div>

                      <span className="text-[11px] font-mono text-white/80">
                        {formatTime(currentTime)} / {formatTime(duration)}
                      </span>
                    </div>

                    {/* Right: Speed & Fullscreen */}
                    <div className="flex items-center gap-2 relative">
                      {/* Speed menu button */}
                      <button
                        onClick={() => setShowSpeedMenu(!showSpeedMenu)}
                        className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-[11px] font-semibold text-white transition-colors"
                      >
                        {speed}x
                      </button>

                      {showSpeedMenu && (
                        <div className="absolute bottom-8 right-8 bg-surface/95 backdrop-blur-md border border-border rounded-xl shadow-2xl py-1 z-50 text-xs min-w-[70px]">
                          {[0.5, 1, 1.25, 1.5, 2].map(s => (
                            <button
                              key={s}
                              onClick={() => {
                                setSpeed(s);
                                setShowSpeedMenu(false);
                              }}
                              className={`w-full px-3 py-1.5 text-left font-medium hover:bg-white/10 flex items-center justify-between ${
                                speed === s ? 'text-accent font-bold' : 'text-primary'
                              }`}
                            >
                              <span>{s}x</span>
                              {speed === s && <span>✓</span>}
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Fullscreen Button */}
                      <button
                        onClick={toggleFullscreen}
                        className="p-1 hover:text-accent transition-colors"
                        title="Fullscreen (F)"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Comments Drawer (Modal / Bottom Sheet) */}
        {isCommentsOpen && (
          <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex flex-col justify-end">
            <div className="w-full h-[70%] bg-surface rounded-t-2xl border-t border-border shadow-2xl flex flex-col overflow-hidden animate-slide-up">
              {/* Comments Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border/80">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-sm text-primary">Comments</h3>
                  <span className="text-xs text-secondary font-semibold">({comments.length})</span>
                </div>
                <button
                  onClick={() => setIsCommentsOpen(false)}
                  className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/10 text-secondary hover:text-primary transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>

              {/* Comments List */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {isLoadingComments ? (
                  <div className="flex items-center justify-center h-32">
                    <Spinner />
                  </div>
                ) : comments.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-40 text-center text-secondary">
                    <p className="text-sm font-medium">No comments yet.</p>
                    <p className="text-xs mt-1">Be the first to share your thoughts!</p>
                  </div>
                ) : (
                  comments.map(c => {
                    const isAuthor = user?.uid === (c.userUid || (c as any).authorUid);
                    const authorName = c.userName || (c as any).authorName || 'User';
                    const authorPhoto = c.userPhotoURL || (c as any).authorPhotoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${authorName}`;
                    const commentContent = c.content || (c as any).text || '';
                    const hasLikedComment = !!(user && c.likedBy?.includes(user.uid));

                    return (
                      <div key={c.id} className="flex gap-3 text-left group/comment">
                        <img
                          src={authorPhoto}
                          alt={authorName}
                          className="w-8 h-8 rounded-full object-cover shrink-0 mt-0.5 border border-border/40"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-primary">@{authorName}</span>
                            <span className="text-[10px] text-secondary">
                              {c.createdAt ? new Date(c.createdAt).toLocaleDateString() : 'Just now'}
                            </span>
                          </div>
                          <p className="text-xs text-primary/90 mt-0.5 break-words leading-relaxed">{commentContent}</p>
                          
                          {/* Comment Actions: Reply, Like, Delete */}
                          <div className="flex items-center gap-3 mt-1 text-[11px] text-secondary">
                            <button
                              onClick={() => {
                                setReplyToComment({ id: c.id, userName: authorName });
                              }}
                              className="hover:text-primary font-medium"
                            >
                              Reply
                            </button>
                            {isAuthor && (
                              <button
                                onClick={() => handleCommentDelete(c.id)}
                                className="hover:text-red-400 font-medium opacity-0 group-hover/comment:opacity-100 transition-opacity"
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Comment Like Heart */}
                        <div className="flex flex-col items-center shrink-0">
                          <button
                            onClick={() => handleCommentLike(c.id)}
                            className={`p-1 transition-transform active:scale-125 ${
                              hasLikedComment ? 'text-red-500' : 'text-secondary hover:text-primary'
                            }`}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill={hasLikedComment ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                            </svg>
                          </button>
                          {(c.likeCount || 0) > 0 && (
                            <span className="text-[10px] text-secondary font-mono">{c.likeCount}</span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Reply Indicator if active */}
              {replyToComment && (
                <div className="px-4 py-1.5 bg-background/80 border-t border-border flex items-center justify-between text-xs text-secondary">
                  <span>Replying to <strong className="text-primary">@{replyToComment.userName}</strong></span>
                  <button onClick={() => setReplyToComment(null)} className="hover:text-primary">✕</button>
                </div>
              )}

              {/* Comment Input Footer */}
              <form onSubmit={handlePostComment} className="p-3 border-t border-border bg-surface/95 flex items-center gap-2">
                <input
                  type="text"
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                  placeholder={user ? (replyToComment ? `Reply to @${replyToComment.userName}...` : "Add a comment...") : "Sign in to comment..."}
                  disabled={!user || isPostingComment}
                  className="flex-1 px-3.5 py-2 text-xs bg-background border border-border/80 rounded-full text-primary placeholder-secondary focus:outline-none focus:border-accent"
                />
                <button
                  type="submit"
                  disabled={!user || !commentText.trim() || isPostingComment}
                  className="px-4 py-2 text-xs font-bold bg-accent text-surface rounded-full hover:opacity-90 disabled:opacity-40 transition-opacity"
                >
                  {isPostingComment ? 'Posting...' : 'Post'}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReelsPage;
