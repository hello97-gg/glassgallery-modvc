import React, { useState, useRef, useCallback, useEffect } from 'react';
import { triggerLikeHaptic } from '../utils/haptics';

interface PullToRefreshProps {
  onRefresh: () => Promise<any>;
  children: React.ReactNode;
  disabled?: boolean;
  className?: string;
}

const PULL_THRESHOLD = 64; // Distance in px to trigger refresh
const MAX_PULL = 90;

export const PullToRefresh: React.FC<PullToRefreshProps> = ({
  onRefresh,
  children,
  disabled = false,
  className = ''
}) => {
  const [pullY, setPullY] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasCrossedThreshold, setHasCrossedThreshold] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const startYRef = useRef(0);
  const startXRef = useRef(0);
  const isPullingRef = useRef(false);
  const hasHapticFiredRef = useRef(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (disabled || isRefreshing) return;

    // Check if scrolled to top
    const scrollTop = window.scrollY || document.documentElement.scrollTop || containerRef.current?.scrollTop || 0;
    if (scrollTop > 2) return;

    const touch = e.touches[0];
    startYRef.current = touch.clientY;
    startXRef.current = touch.clientX;
    isPullingRef.current = true;
    hasHapticFiredRef.current = false;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isPullingRef.current || disabled || isRefreshing) return;

    const touch = e.touches[0];
    const dy = touch.clientY - startYRef.current;
    const dx = touch.clientX - startXRef.current;

    // Don't interfere if swiping horizontally (e.g. Android back gesture or side swipes)
    if (Math.abs(dx) > Math.abs(dy)) {
      isPullingRef.current = false;
      setPullY(0);
      return;
    }

    const scrollTop = window.scrollY || document.documentElement.scrollTop || containerRef.current?.scrollTop || 0;
    if (scrollTop > 2) {
      isPullingRef.current = false;
      setPullY(0);
      return;
    }

    if (dy > 0) {
      // Damped pull curve
      const damped = Math.min(MAX_PULL, Math.pow(dy, 0.82));
      setPullY(damped);

      if (damped >= PULL_THRESHOLD && !hasHapticFiredRef.current) {
        hasHapticFiredRef.current = true;
        setHasCrossedThreshold(true);
        triggerLikeHaptic();
      } else if (damped < PULL_THRESHOLD && hasHapticFiredRef.current) {
        hasHapticFiredRef.current = false;
        setHasCrossedThreshold(false);
      }
    } else {
      setPullY(0);
    }
  };

  const handleTouchEnd = async () => {
    if (!isPullingRef.current || disabled) return;
    isPullingRef.current = false;

    if (pullY >= PULL_THRESHOLD && !isRefreshing) {
      setIsRefreshing(true);
      setPullY(48); // Rest at spinner height while refreshing
      try {
        await onRefresh();
      } catch (err) {
        console.warn('[PullToRefresh] onRefresh error:', err);
      } finally {
        setIsRefreshing(false);
        setPullY(0);
        setHasCrossedThreshold(false);
        hasHapticFiredRef.current = false;
      }
    } else {
      setPullY(0);
      setHasCrossedThreshold(false);
      hasHapticFiredRef.current = false;
    }
  };

  const progress = Math.min(1, pullY / PULL_THRESHOLD);

  return (
    <div
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      className={`relative min-h-full ${className}`}
      style={{ touchAction: 'pan-y' }}
    >
      {/* Spinner Header following finger */}
      <div
        className="absolute top-0 left-0 right-0 z-20 flex items-center justify-center pointer-events-none transition-transform duration-200"
        style={{
          transform: `translate3d(0, ${pullY - 44}px, 0)`,
          opacity: pullY > 8 ? 1 : 0
        }}
      >
        <div className="w-10 h-10 rounded-full bg-surface/90 backdrop-blur-md border border-white/10 shadow-lg flex items-center justify-center text-primary">
          {isRefreshing ? (
            <svg
              className="animate-spin h-5 w-5 text-accent"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          ) : (
            <svg
              className={`h-5 w-5 transition-transform duration-150 ${hasCrossedThreshold ? 'text-accent rotate-180' : 'text-secondary'}`}
              style={{ transform: `rotate(${progress * 180}deg)` }}
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div
        className="transition-transform duration-200"
        style={{
          transform: isRefreshing ? 'translate3d(0, 44px, 0)' : (pullY > 0 ? `translate3d(0, ${pullY * 0.4}px, 0)` : 'none')
        }}
      >
        {children}
      </div>
    </div>
  );
};
export default PullToRefresh;

