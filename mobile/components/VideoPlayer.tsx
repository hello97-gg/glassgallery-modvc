import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { isVideoUrl } from '../../utils/mediaUtils';

export interface VideoPlayerProps {
  src: string;
  poster?: string;
  width?: number;
  height?: number;
  title?: string;
  autoPlay?: boolean;
  loop?: boolean;
  muted?: boolean;
  className?: string;
  isFeedPreview?: boolean;
  onDoubleTapLike?: () => void;
  onClick?: () => void;
}

// Clean flat dark SVG data poster to completely eliminate Chromium/Android native vendor gray placeholder
export const DARK_VIDEO_POSTER = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'%3E%3Crect width='1' height='1' fill='%23121212'/%3E%3C/svg%3E";

// Format seconds into m:ss
const formatTime = (seconds: number): string => {
  if (isNaN(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
};

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  src,
  poster,
  width,
  height,
  title,
  autoPlay = true,
  loop = true,
  muted: initialMutedProp,
  className = '',
  isFeedPreview = false,
  onDoubleTapLike,
  onClick,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const progressFillRef = useRef<HTMLDivElement>(null);
  const bufferFillRef = useRef<HTMLDivElement>(null);
  const progressTrackRef = useRef<HTMLDivElement>(null);
  const playerIdRef = useRef(`vp_${Math.random().toString(36).substring(2, 9)}`);

  // Verify poster is actually an image, NOT a video URL
  const isPosterVideo = useMemo(() => isVideoUrl(poster), [poster]);
  const validImagePoster = poster && !isPosterVideo ? poster : undefined;

  // Feed preview mode MUST ALWAYS BE MUTED. Only detail player can read localStorage
  const savedMuted = useMemo(() => {
    if (isFeedPreview) return true;
    if (initialMutedProp !== undefined) return initialMutedProp;
    const item = localStorage.getItem('gg_video_muted');
    return item === null ? true : item === 'true';
  }, [initialMutedProp, isFeedPreview]);

  const savedVolume = useMemo(() => {
    if (isFeedPreview) return 0;
    const item = localStorage.getItem('gg_video_volume');
    return item === null ? 1 : parseFloat(item);
  }, [isFeedPreview]);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [showControls, setShowControls] = useState(!isFeedPreview);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubTime, setScrubTime] = useState(0);
  const [currentTimeDisplay, setCurrentTimeDisplay] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(savedMuted);
  const [volume, setVolume] = useState(savedVolume);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isFirstFrameReady, setIsFirstFrameReady] = useState(false);
  const [hasUserInteracted, setHasUserInteracted] = useState(false);
  const [ripple, setRipple] = useState<{ side: 'left' | 'right'; id: number } | null>(null);
  const [is2xHold, setIs2xHold] = useState(false);
  const [showBigPlayAnimation, setShowBigPlayAnimation] = useState(false);

  // Internal refs for animation loops and gesture tracking
  const rafIdRef = useRef<number | null>(null);
  const hideControlsTimerRef = useRef<any>(null);
  const bufferingTimerRef = useRef<any>(null);
  const lastTapRef = useRef<number>(0);
  const holdTimerRef = useRef<any>(null);
  const isScrubbingRef = useRef(false);
  const wasPlayingBeforeScrubRef = useRef(false);
  const scrubTargetTimeRef = useRef(0);

  // Sync mute & volume to localStorage only from detail player, never feed preview
  useEffect(() => {
    if (!isFeedPreview) {
      localStorage.setItem('gg_video_muted', isMuted ? 'true' : 'false');
    }
  }, [isMuted, isFeedPreview]);

  useEffect(() => {
    if (!isFeedPreview) {
      localStorage.setItem('gg_video_volume', volume.toString());
    }
  }, [volume, isFeedPreview]);

  // Global audio arbiter: when one video un-mutes/plays with sound, all other videos MUST mute immediately
  const broadcastAudioActive = useCallback(() => {
    if (!isFeedPreview && !isMuted) {
      window.dispatchEvent(new CustomEvent('gg-video-active-audio', { detail: { id: playerIdRef.current } }));
    }
  }, [isFeedPreview, isMuted]);

  useEffect(() => {
    const handleOtherVideoPlayingAudio = (e: any) => {
      if (e.detail?.id !== playerIdRef.current) {
        if (isFeedPreview) {
          if (videoRef.current) {
            videoRef.current.muted = true;
          }
        } else {
          setIsMuted(true);
          if (videoRef.current) {
            videoRef.current.muted = true;
          }
        }
      }
    };

    window.addEventListener('gg-video-active-audio', handleOtherVideoPlayingAudio);
    return () => {
      window.removeEventListener('gg-video-active-audio', handleOtherVideoPlayingAudio);
    };
  }, [isFeedPreview]);

  // High-performance requestAnimationFrame progress bar loop
  const updateProgress = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (!isScrubbingRef.current && video.duration > 0) {
      const progress = video.currentTime / video.duration;
      if (progressFillRef.current) {
        progressFillRef.current.style.transform = `scaleX(${Math.min(1, Math.max(0, progress))})`;
      }
      setCurrentTimeDisplay(video.currentTime);

      // Render buffered range
      if (bufferFillRef.current && video.buffered.length > 0) {
        try {
          const end = video.buffered.end(video.buffered.length - 1);
          const bufProgress = end / video.duration;
          bufferFillRef.current.style.transform = `scaleX(${Math.min(1, Math.max(0, bufProgress))})`;
        } catch (e) {}
      }
    }

    if (!video.paused && !video.ended) {
      rafIdRef.current = requestAnimationFrame(updateProgress);
    }
  }, []);

  const startProgressLoop = useCallback(() => {
    if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    rafIdRef.current = requestAnimationFrame(updateProgress);
  }, [updateProgress]);

  const stopProgressLoop = useCallback(() => {
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
  }, []);

  // Controls auto-hide manager
  const scheduleHideControls = useCallback(() => {
    if (isFeedPreview) return;
    if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current);
    hideControlsTimerRef.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused && !isScrubbingRef.current && !isBuffering) {
        setShowControls(false);
        setShowSpeedMenu(false);
      }
    }, 2500);
  }, [isFeedPreview, isBuffering]);

  const revealControls = useCallback(() => {
    if (isFeedPreview) return;
    setShowControls(true);
    scheduleHideControls();
  }, [isFeedPreview, scheduleHideControls]);

  // Play / Pause toggle
  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    setHasUserInteracted(true);
    setShowBigPlayAnimation(true);
    setTimeout(() => setShowBigPlayAnimation(false), 500);

    if (video.paused) {
      video.play().then(() => {
        setIsPlaying(true);
        startProgressLoop();
        scheduleHideControls();
        if (!isFeedPreview && !isMuted) {
          broadcastAudioActive();
        }
      }).catch(() => {
        // Autoplay policy fallback: mute and retry
        video.muted = true;
        setIsMuted(true);
        video.play().catch(() => {});
      });
    } else {
      video.pause();
      setIsPlaying(false);
      stopProgressLoop();
      revealControls();
    }
  }, [startProgressLoop, stopProgressLoop, scheduleHideControls, revealControls, isFeedPreview, isMuted, broadcastAudioActive]);

  // Relative Seek (e.g. ±10s)
  const seekRelative = useCallback((delta: number) => {
    const video = videoRef.current;
    if (!video) return;
    const newTime = Math.min(video.duration || 0, Math.max(0, video.currentTime + delta));
    video.currentTime = newTime;
    setCurrentTimeDisplay(newTime);
    if (progressFillRef.current && video.duration > 0) {
      progressFillRef.current.style.transform = `scaleX(${newTime / video.duration})`;
    }
    revealControls();
  }, [revealControls]);

  // Double-tap ripple trigger
  const triggerRipple = useCallback((side: 'left' | 'right') => {
    setRipple({ side, id: Date.now() });
    setTimeout(() => setRipple(null), 650);
  }, []);

  // Video event listeners
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onPlay = () => {
      setIsPlaying(true);
      startProgressLoop();
      scheduleHideControls();
      if (!isFeedPreview && !isMuted) {
        broadcastAudioActive();
      }
    };

    const onPause = () => {
      setIsPlaying(false);
      stopProgressLoop();
      revealControls();
    };

    const onWaiting = () => {
      // Avoid micro-flash: only show spinner if buffering > 300ms
      bufferingTimerRef.current = setTimeout(() => {
        setIsBuffering(true);
      }, 300);
    };

    const onPlaying = () => {
      if (bufferingTimerRef.current) clearTimeout(bufferingTimerRef.current);
      setIsBuffering(false);
    };

    const onLoadedMetadata = () => {
      setDuration(video.duration || 0);
      try {
        if (video.currentTime === 0) {
          video.currentTime = 0.001;
        }
      } catch (e) {}
      setIsFirstFrameReady(true);
    };

    const onSeeked = () => {
      setIsFirstFrameReady(true);
    };

    const onLoadedData = () => {
      setIsFirstFrameReady(true);
      setDuration(video.duration || 0);
    };

    const onDurationChange = () => {
      setDuration(video.duration || 0);
    };

    const onError = () => {
      setHasError(true);
      setIsBuffering(false);
      setIsPlaying(false);
      stopProgressLoop();
    };

    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('canplay', onPlaying);
    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('loadeddata', onLoadedData);
    video.addEventListener('durationchange', onDurationChange);
    video.addEventListener('error', onError);

    if (video.readyState >= 1) {
      setDuration(video.duration || 0);
      setIsFirstFrameReady(true);
    }

    // Initial config: feed previews MUST be 100% muted
    if (isFeedPreview) {
      video.muted = true;
      video.volume = 0;
      video.defaultMuted = true;
    } else {
      video.muted = isMuted;
      video.volume = volume;
    }
    video.playbackRate = playbackRate;

    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('canplay', onPlaying);
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('loadeddata', onLoadedData);
      video.removeEventListener('durationchange', onDurationChange);
      video.removeEventListener('error', onError);
      stopProgressLoop();
      if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current);
      if (bufferingTimerRef.current) clearTimeout(bufferingTimerRef.current);
    };
  }, [isMuted, volume, playbackRate, isFeedPreview, startProgressLoop, stopProgressLoop, scheduleHideControls, revealControls, broadcastAudioActive]);

  // Feed preview: IntersectionObserver so offscreen tiles pause and only viewport tiles play
  useEffect(() => {
    if (!isFeedPreview || !containerRef.current) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const video = videoRef.current;
        if (!video) return;
        if (entry.isIntersecting && !hasError) {
          video.play().catch(() => {});
        } else {
          video.pause();
        }
      });
    }, {
      rootMargin: '120px 0px',
      threshold: 0.1
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [isFeedPreview, hasError]);

  // Page visibility & clean pause on tab change / pin change
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden && videoRef.current && !videoRef.current.paused) {
        videoRef.current.pause();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  // Media Session API Integration for system notification / lock-screen controls
  useEffect(() => {
    if ('mediaSession' in navigator && !isFeedPreview) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: title || 'Glass Gallery Video',
          artist: 'Glass Gallery',
          artwork: poster ? [{ src: poster, sizes: '512x512', type: 'image/jpeg' }] : []
        });

        navigator.mediaSession.setActionHandler('play', () => videoRef.current?.play());
        navigator.mediaSession.setActionHandler('pause', () => videoRef.current?.pause());
        navigator.mediaSession.setActionHandler('seekbackward', () => seekRelative(-10));
        navigator.mediaSession.setActionHandler('seekforward', () => seekRelative(10));
        navigator.mediaSession.setActionHandler('seekto', (details) => {
          if (details.seekTime !== undefined && videoRef.current) {
            videoRef.current.currentTime = details.seekTime;
          }
        });
      } catch (err) {}
    }
  }, [title, poster, isFeedPreview, seekRelative]);

  // Fullscreen Handler
  const toggleFullscreen = useCallback(async () => {
    const container = containerRef.current;
    const video = videoRef.current;
    if (!container || !video) return;

    if (!document.fullscreenElement) {
      if (container.requestFullscreen) {
        await container.requestFullscreen().catch(() => {});
        setIsFullscreen(true);
      } else if ((video as any).webkitEnterFullscreen) {
        // iOS Safari native video fullscreen fallback
        (video as any).webkitEnterFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        await document.exitFullscreen().catch(() => {});
        setIsFullscreen(false);
      }
    }
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const active = !!document.fullscreenElement;
      setIsFullscreen(active);
      (window as any).__glassGalleryVideoFullscreen = active;
      if (active) {
        (window as any).__glassGalleryCloseVideoFullscreen = () => {
          if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
          }
          setIsFullscreen(false);
        };
      } else {
        (window as any).__glassGalleryCloseVideoFullscreen = null;
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      (window as any).__glassGalleryVideoFullscreen = false;
      (window as any).__glassGalleryCloseVideoFullscreen = null;
    };
  }, []);

  // Desktop Keyboard Shortcuts
  useEffect(() => {
    if (isFeedPreview) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in comments/inputs
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (e.code === 'Space' || e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        seekRelative(-5);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        seekRelative(5);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setVolume(v => {
          const nv = Math.min(1, v + 0.1);
          if (videoRef.current) videoRef.current.volume = nv;
          return nv;
        });
        setIsMuted(false);
        if (videoRef.current) videoRef.current.muted = false;
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setVolume(v => {
          const nv = Math.max(0, v - 0.1);
          if (videoRef.current) videoRef.current.volume = nv;
          return nv;
        });
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        setIsMuted(m => {
          const nm = !m;
          if (videoRef.current) videoRef.current.muted = nm;
          return nm;
        });
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        toggleFullscreen();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFeedPreview, togglePlay, seekRelative, toggleFullscreen]);

  // Pointer Scrubbing on Progress Bar (PointerCapture)
  const computeScrubFraction = useCallback((e: React.PointerEvent<HTMLDivElement>, trackEl: HTMLDivElement): number => {
    const rect = trackEl.getBoundingClientRect();
    const x = e.clientX - rect.left;
    return Math.min(1, Math.max(0, x / rect.width));
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const track = progressTrackRef.current;
    if (!track) return;

    track.setPointerCapture(e.pointerId);
    isScrubbingRef.current = true;
    setIsScrubbing(true);

    wasPlayingBeforeScrubRef.current = !videoRef.current?.paused;
    if (videoRef.current && !videoRef.current.paused) {
      videoRef.current.pause();
    }

    const frac = computeScrubFraction(e, track);
    const target = frac * (duration || 0);
    scrubTargetTimeRef.current = target;
    setScrubTime(target);
    setCurrentTimeDisplay(target);
    if (progressFillRef.current) {
      progressFillRef.current.style.transform = `scaleX(${frac})`;
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isScrubbingRef.current || !progressTrackRef.current) return;
    const frac = computeScrubFraction(e, progressTrackRef.current);
    const target = frac * (duration || 0);
    scrubTargetTimeRef.current = target;
    setScrubTime(target);
    setCurrentTimeDisplay(target);
    if (progressFillRef.current) {
      progressFillRef.current.style.transform = `scaleX(${frac})`;
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isScrubbingRef.current) return;
    isScrubbingRef.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (err) {}

    const video = videoRef.current;
    if (video) {
      video.currentTime = scrubTargetTimeRef.current;
      if (wasPlayingBeforeScrubRef.current) {
        video.play().catch(() => {});
      }
    }
    setIsScrubbing(false);
    scheduleHideControls();
  };

  // Video Tap & Double Tap Gesture (10s back/forward) & Press-and-Hold 2x Speed
  const handleContainerTap = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isFeedPreview) {
      if (onClick) onClick();
      return;
    }

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const now = Date.now();

    if (now - lastTapRef.current < 300) {
      // Double tap detected!
      lastTapRef.current = 0;
      if (x < rect.width * 0.35) {
        seekRelative(-10);
        triggerRipple('left');
      } else if (x > rect.width * 0.65) {
        seekRelative(10);
        triggerRipple('right');
      } else {
        if (onDoubleTapLike) onDoubleTapLike();
        else togglePlay();
      }
    } else {
      lastTapRef.current = now;
      // Single tap toggle controls
      setTimeout(() => {
        if (Date.now() - lastTapRef.current >= 300 && lastTapRef.current !== 0) {
          if (showControls) {
            setShowControls(false);
            setShowSpeedMenu(false);
          } else {
            revealControls();
          }
        }
      }, 300);
    }
  };

  // Press-and-hold for 2x playback speed
  const handleTouchStart = () => {
    if (isFeedPreview) return;
    holdTimerRef.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) {
        videoRef.current.playbackRate = 2.0;
        setIs2xHold(true);
        if (navigator.vibrate) navigator.vibrate(15);
      }
    }, 450);
  };

  const handleTouchEnd = () => {
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    if (is2xHold && videoRef.current) {
      videoRef.current.playbackRate = playbackRate;
      setIs2xHold(false);
    }
  };

  // Reserved aspect ratio calculation so layout never jumps
  const containerAspectRatio = useMemo(() => {
    if (width && height && width > 0 && height > 0) {
      return `${width} / ${height}`;
    }
    return undefined;
  }, [width, height]);

  // Feed preview mode: ultra clean muted looping preview
  if (isFeedPreview) {
    return (
      <div 
        ref={containerRef}
        onClick={onClick}
        style={{ aspectRatio: containerAspectRatio }}
        className={`relative overflow-hidden rounded-[16px] bg-[#121212] cursor-pointer group select-none ${className}`}
      >
        {/* Shimmer skeleton while waiting for first frame */}
        {!isFirstFrameReady && !hasError && (
          <div className="absolute inset-0 bg-[#181818] animate-pulse flex items-center justify-center pointer-events-none">
            <div className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-white/40 ml-0.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </div>
        )}

        {/* Valid image poster if available and not a video URL */}
        {validImagePoster && (
          <img
            src={validImagePoster}
            alt=""
            className={`absolute inset-0 w-full h-full object-cover rounded-[16px] transition-opacity duration-300 pointer-events-none ${
              isFirstFrameReady ? 'opacity-0' : 'opacity-100'
            }`}
          />
        )}

        {/* Core video element - strictly opacity-0 until first frame is decoded so Android gray placeholder never shows */}
        {!hasError && (
          <video
            ref={videoRef}
            src={src}
            poster={validImagePoster || DARK_VIDEO_POSTER}
            playsInline
            muted
            loop
            preload="metadata"
            className={`w-full h-full object-cover rounded-[16px] block pointer-events-none transition-opacity duration-300 ${
              validImagePoster && !isFirstFrameReady ? 'opacity-0' : 'opacity-100'
            }`}
          />
        )}

        {/* Fallback card if video cannot be loaded/decoded */}
        {hasError && (
          <div className="w-full min-h-[160px] aspect-[4/3] bg-[#141414] border border-white/5 rounded-[16px] flex flex-col items-center justify-center p-4 text-center pointer-events-none select-none">
            <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-neutral-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9A2.25 2.25 0 0 0 13.5 5.25h-9A2.25 2.25 0 0 0 2.25 7.5v9A2.25 2.25 0 0 0 4.5 18.75Z" />
              </svg>
            </div>
            <span className="text-[11px] text-neutral-400 font-medium truncate max-w-[90%]">{title || 'Video unavailable'}</span>
          </div>
        )}

        {/* Subtle video duration / play badge - only shown if video successfully loaded and duration > 0 */}
        {!hasError && duration > 0 && isFirstFrameReady && (
          <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-sm text-white/90 text-[10px] font-mono flex items-center gap-1 opacity-90 group-hover:opacity-100 pointer-events-none">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 fill-current" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
            <span className="tabular-nums">{formatTime(duration)}</span>
          </div>
        )}
      </div>
    );
  }

  // Full Custom Detail Player
  return (
    <div
      ref={containerRef}
      style={{ aspectRatio: containerAspectRatio }}
      onClick={handleContainerTap}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onContextMenu={(e) => e.preventDefault()}
      className={`relative overflow-hidden select-none bg-black flex items-center justify-center rounded-b-[20px] md:rounded-2xl w-full max-h-[72vh] md:max-h-[80vh] group ${
        isFullscreen ? '!rounded-none !max-h-full !h-full !w-full' : ''
      } ${className}`}
    >
      {/* Poster first-frame cross-fade to eliminate black flash */}
      {validImagePoster && (
        <img
          src={validImagePoster}
          alt=""
          className={`absolute inset-0 w-full h-full object-contain pointer-events-none transition-opacity duration-300 z-10 ${
            isFirstFrameReady ? 'opacity-0' : 'opacity-100'
          }`}
        />
      )}

      {/* Shimmer skeleton before video first frame is ready */}
      {!isFirstFrameReady && !hasError && (
        <div className="absolute inset-0 bg-[#121212] flex items-center justify-center pointer-events-none z-10 animate-pulse">
          <div className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white/40 ml-0.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      )}

      {/* Core HTML5 Video Element with playsInline and controls disabled */}
      {!hasError ? (
        <video
          ref={videoRef}
          src={src}
          poster={validImagePoster || DARK_VIDEO_POSTER}
          playsInline
          webkit-playsinline="true"
          x5-playsinline="true"
          loop={loop}
          autoPlay={autoPlay}
          className={`w-full h-full object-contain pointer-events-none transition-opacity duration-300 ${
            validImagePoster && !isFirstFrameReady ? 'opacity-0' : 'opacity-100'
          }`}
        />
      ) : (
        <div className="w-full min-h-[260px] bg-[#141414] border border-white/5 rounded-2xl flex flex-col items-center justify-center p-6 text-center text-white">
          <div className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-3">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9A2.25 2.25 0 0 0 13.5 5.25h-9A2.25 2.25 0 0 0 2.25 7.5v9A2.25 2.25 0 0 0 4.5 18.75Z" />
            </svg>
          </div>
          <h4 className="text-sm font-semibold mb-1">Video could not be loaded</h4>
          <p className="text-xs text-neutral-400 max-w-xs">The video file format is unsupported or temporarily unavailable.</p>
        </div>
      )}

      {/* 2x Speed Pill Indicator when holding */}
      {is2xHold && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 px-3.5 py-1 rounded-full bg-white/20 backdrop-blur-md border border-white/20 text-white text-xs font-bold tracking-wide flex items-center gap-1.5 shadow-lg animate-fade-in pointer-events-none">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 fill-current" viewBox="0 0 24 24">
            <path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z" />
          </svg>
          <span>2x Speed</span>
        </div>
      )}

      {/* Double Tap Skip Ripples (10s Back / Forward) */}
      {ripple && (
        <div
          className={`absolute top-0 bottom-0 w-1/3 z-30 pointer-events-none flex flex-col items-center justify-center text-white/90 font-bold text-sm bg-white/10 backdrop-blur-xs animate-fade-in ${
            ripple.side === 'left' ? 'left-0 rounded-r-full' : 'right-0 rounded-l-full'
          }`}
        >
          <div className="p-3 rounded-full bg-black/40 mb-1">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 fill-current" viewBox="0 0 24 24">
              {ripple.side === 'left' ? (
                <path d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.2 3.16-1.98 5.12-1.98 3.53 0 6.55 2.29 7.63 5.48l2.37-.78C23.95 11.23 20.08 8 12.5 8z" />
              ) : (
                <path d="M18.4 10.6C16.55 8.99 14.15 8 11.5 8c-7.58 0-11.45 3.23-11.45 7.1l2.37.78c1.08-3.19 4.1-5.48 7.63-5.48 1.96 0 3.73.78 5.12 1.98L11.55 16H20.5V7l-3.6 3.6z" />
              )}
            </svg>
          </div>
          <span>{ripple.side === 'left' ? '-10s' : '+10s'}</span>
        </div>
      )}

      {/* Buffering Spinner (>300ms waiting) */}
      {isBuffering && (
        <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
          <div className="w-12 h-12 rounded-full border-3 border-white/20 border-t-white animate-spin shadow-xl" />
        </div>
      )}

      {/* Big Animated Center Play/Pause button on Tap/State change */}
      {showBigPlayAnimation && (
        <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
          <div className="w-16 h-16 rounded-full bg-black/60 backdrop-blur-md border border-white/20 text-white flex items-center justify-center scale-110 opacity-90 transition-all duration-300">
            {isPlaying ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 fill-current" viewBox="0 0 24 24">
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 fill-current ml-1" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </div>
        </div>
      )}

      {/* Center Paused Indicator when paused and controls visible */}
      {!isPlaying && showControls && !showBigPlayAnimation && !isBuffering && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            togglePlay();
          }}
          className="absolute z-20 w-16 h-16 rounded-full bg-black/60 backdrop-blur-md border border-white/20 text-white flex items-center justify-center cursor-pointer hover:scale-105 active:scale-95 transition-all shadow-xl"
          aria-label="Play Video"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 fill-current ml-1" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        </div>
      )}

      {/* Minimal Monochrome Bottom Controls Overlay */}
      <div
        onClick={(e) => e.stopPropagation()}
        className={`absolute bottom-0 left-0 right-0 z-30 px-3 sm:px-4 pt-10 pb-3 bg-gradient-to-t from-black/80 via-black/40 to-transparent transition-opacity duration-200 pointer-events-auto flex flex-col gap-1.5 ${
          showControls || !isPlaying || isScrubbing ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Scrubbing Tooltip */}
        {isScrubbing && (
          <div className="flex justify-center -mb-2">
            <span className="px-2.5 py-1 rounded-full bg-black/80 backdrop-blur-md border border-white/20 text-white text-xs font-mono font-bold tracking-wider tabular-nums shadow-lg">
              {formatTime(scrubTime)} / {formatTime(duration)}
            </span>
          </div>
        )}

        {/* Smooth Touch Seek Bar with 40px Touch Target and PointerCapture */}
        <div
          ref={progressTrackRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          role="slider"
          aria-label="Video timeline"
          aria-valuemin={0}
          aria-valuemax={duration || 100}
          aria-valuenow={currentTimeDisplay}
          aria-valuetext={`${formatTime(currentTimeDisplay)} of ${formatTime(duration)}`}
          tabIndex={0}
          className="h-10 -my-2 flex items-center cursor-pointer group/bar touch-none relative"
        >
          {/* Base Background Track */}
          <div className="w-full h-[3px] group-hover/bar:h-[5px] bg-white/20 rounded-full overflow-hidden relative transition-all duration-150">
            {/* Buffered Range Fill */}
            <div
              ref={bufferFillRef}
              style={{ transform: 'scaleX(0)', transformOrigin: 'left' }}
              className="absolute inset-0 bg-white/25 rounded-full will-change-transform"
            />

            {/* Current Progress Fill (hardware accelerated scaleX) */}
            <div
              ref={progressFillRef}
              style={{ transform: 'scaleX(0)', transformOrigin: 'left' }}
              className="absolute inset-0 bg-white rounded-full will-change-transform"
            />
          </div>

          {/* Visible Thumb on Touch / Hover */}
          <div
            style={{
              left: `${duration > 0 ? (currentTimeDisplay / duration) * 100 : 0}%`,
              transform: 'translate(-50%, -50%)',
            }}
            className={`absolute top-1/2 w-3.5 h-3.5 rounded-full bg-white shadow-md pointer-events-none transition-transform duration-150 ${
              isScrubbing ? 'scale-125' : 'scale-0 group-hover/bar:scale-100'
            }`}
          />
        </div>

        {/* Action Controls Bar */}
        <div className="flex items-center justify-between gap-3 text-white">
          {/* Left: Play/Pause, Volume, Time */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Play/Pause Button */}
            <button
              onClick={togglePlay}
              className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center active:scale-95 transition-all text-white"
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 fill-current" viewBox="0 0 24 24">
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 fill-current ml-0.5" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>

            {/* Mute Button with desktop volume slider */}
            <div className="flex items-center group/vol">
              <button
                onClick={() => {
                  const nextMuted = !isMuted;
                  setIsMuted(nextMuted);
                  if (videoRef.current) {
                    videoRef.current.muted = nextMuted;
                  }
                  if (!nextMuted) {
                    broadcastAudioActive();
                  }
                }}
                className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center active:scale-95 transition-all text-white cursor-pointer"
                aria-label={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 fill-current" viewBox="0 0 24 24">
                    <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 fill-current" viewBox="0 0 24 24">
                    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
                  </svg>
                )}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={isMuted ? 0 : volume}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setVolume(val);
                  const muted = val === 0;
                  setIsMuted(muted);
                  if (videoRef.current) {
                    videoRef.current.volume = val;
                    videoRef.current.muted = muted;
                  }
                }}
                className="w-0 group-hover/vol:w-14 opacity-0 group-hover/vol:opacity-100 transition-all duration-200 accent-white hidden md:block h-1 bg-white/30 rounded-lg cursor-pointer ml-1"
                aria-label="Volume slider"
              />
            </div>

            {/* Time label in tabular-nums so numbers never jiggle */}
            <span className="text-xs text-neutral-300 font-mono font-medium tracking-wide tabular-nums">
              {formatTime(currentTimeDisplay)} <span className="text-neutral-500">/</span> {formatTime(duration)}
            </span>
          </div>

          {/* Right: Speed, PiP, Fullscreen */}
          <div className="flex items-center gap-1.5 sm:gap-2 relative">
            {/* Playback speed popover toggle */}
            <div className="relative">
              <button
                onClick={() => setShowSpeedMenu(prev => !prev)}
                className="px-2 py-1 rounded-md hover:bg-white/10 text-xs font-mono font-bold text-neutral-300 hover:text-white transition-all active:scale-95"
                title="Playback Speed"
                aria-label={`Playback speed: ${playbackRate}x`}
              >
                {playbackRate}x
              </button>

              {/* Speed Popover Menu */}
              {showSpeedMenu && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="absolute bottom-9 right-0 bg-[#161616] border border-white/15 rounded-xl p-1 shadow-2xl flex flex-col gap-0.5 z-40 min-w-[70px] animate-fade-in"
                >
                  {[0.5, 1, 1.5, 2].map((rate) => (
                    <button
                      key={rate}
                      onClick={() => {
                        setPlaybackRate(rate);
                        if (videoRef.current) videoRef.current.playbackRate = rate;
                        setShowSpeedMenu(false);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-mono text-left transition-colors ${
                        playbackRate === rate
                          ? 'bg-white text-black font-bold'
                          : 'text-neutral-300 hover:bg-white/10'
                      }`}
                    >
                      {rate}x
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Picture-in-Picture Button */}
            {document.pictureInPictureEnabled && (
              <button
                onClick={async () => {
                  if (document.pictureInPictureElement) {
                    await document.exitPictureInPicture().catch(() => {});
                  } else if (videoRef.current) {
                    await videoRef.current.requestPictureInPicture().catch(() => {});
                  }
                }}
                className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center active:scale-95 transition-all text-white"
                title="Picture-in-Picture"
                aria-label="Picture-in-Picture"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4.5 w-4.5 fill-none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 11h-6v6h6v-6zM3 5h18v14H3V5z" />
                </svg>
              </button>
            )}

            {/* Fullscreen Button */}
            <button
              onClick={toggleFullscreen}
              className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center active:scale-95 transition-all text-white"
              title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
              aria-label={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4.5 w-4.5 fill-none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 4.5v4.5H4.5M15 4.5v4.5h4.5M9 19.5v-4.5H4.5M15 19.5v-4.5h4.5" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4.5 w-4.5 fill-none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m12 0v4.5m0-4.5h-4.5m-12 16.5v-4.5m0 4.5h4.5m12 0v-4.5m0 4.5h-4.5" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoPlayer;
