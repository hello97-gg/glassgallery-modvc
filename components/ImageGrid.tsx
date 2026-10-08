import React, { useEffect, useRef } from 'react';
import type { User } from 'firebase/auth';
import type { ImageMeta, ProfileUser } from '../types';
import ImageCard from './ImageCard';
import Spinner from './Spinner';

interface ImageGridProps {
  images: ImageMeta[];
  user: User | null;
  onImageClick: (image: ImageMeta) => void;
  onViewProfile: (user: ProfileUser) => void;
  onLikeToggle: (image: ImageMeta) => void;
  onEndReached?: () => void;
  isFetchingMore?: boolean;
  isLoading?: boolean;
}

const ImageGrid: React.FC<ImageGridProps> = ({ images, user, onImageClick, onViewProfile, onLikeToggle, onEndReached, isFetchingMore, isLoading }) => {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const onEndReachedRef = useRef(onEndReached);
  const isTriggeringRef = useRef(false);

  useEffect(() => {
    onEndReachedRef.current = onEndReached;
  }, [onEndReached]);

  // 1. IntersectionObserver for sentinel at bottom
  useEffect(() => {
    const el = sentinelRef.current;
    if (!onEndReachedRef.current || !el) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isFetchingMore && !isTriggeringRef.current) {
          isTriggeringRef.current = true;
          onEndReachedRef.current?.();
          setTimeout(() => {
            isTriggeringRef.current = false;
          }, 300);
        }
      },
      { rootMargin: '1000px' }
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, [isFetchingMore, images.length]);

  // 2. Window scroll listener as rock-solid backup
  useEffect(() => {
    const handleScroll = () => {
      if (isFetchingMore || isTriggeringRef.current || !onEndReachedRef.current) return;
      const scrollY = window.scrollY || window.pageYOffset;
      const windowHeight = window.innerHeight;
      const documentHeight = document.documentElement.scrollHeight;

      if (scrollY + windowHeight >= documentHeight - 800) {
        isTriggeringRef.current = true;
        onEndReachedRef.current();
        setTimeout(() => {
          isTriggeringRef.current = false;
        }, 300);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [isFetchingMore, images.length]);

  // 3. Auto-fill check: if content doesn't even fill the screen height, auto-request next batch
  useEffect(() => {
    const checkFill = () => {
      if (isFetchingMore || isTriggeringRef.current || !onEndReachedRef.current) return;
      const scrollHeight = document.documentElement.scrollHeight;
      const clientHeight = window.innerHeight;
      if (images.length > 0 && scrollHeight <= clientHeight + 300) {
        isTriggeringRef.current = true;
        onEndReachedRef.current();
        setTimeout(() => {
          isTriggeringRef.current = false;
        }, 300);
      }
    };

    const timer = setTimeout(checkFill, 200);
    return () => clearTimeout(timer);
  }, [images.length, isFetchingMore]);

  if (images.length === 0) {
    if (isLoading) {
      return (
        <div className="flex flex-col w-full">
          <div className="columns-2 sm:columns-2 md:columns-3 lg:columns-4 xl:columns-5 gap-4 md:gap-6 animate-pulse">
            {[240, 320, 180, 280, 220, 360, 200, 300, 250, 190].map((h, idx) => (
              <div 
                key={idx} 
                className="w-full bg-surface/70 rounded-xl mb-4 md:mb-6 border border-border/40"
                style={{ height: `${h}px` }}
              />
            ))}
          </div>
          <div className="h-16 w-full flex items-center justify-center py-4 mt-4">
            <Spinner />
          </div>
        </div>
      );
    }
    return (
      <div className="text-center py-16">
        <div className="inline-block bg-surface text-secondary p-4 rounded-full mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
        </div>
        <h2 className="text-2xl font-semibold text-primary">No images yet.</h2>
        <p className="text-secondary mt-2">Be the first to create something beautiful!</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full">
      <div className="columns-2 sm:columns-2 md:columns-3 lg:columns-4 xl:columns-5 gap-4 md:gap-6">
        {images.map((image) => (
          <ImageCard 
              key={image.id} 
              image={image}
              user={user}
              onClick={() => onImageClick(image)} 
              onViewProfile={onViewProfile}
              onLikeToggle={onLikeToggle}
          />
        ))}
      </div>
      <div ref={sentinelRef} className="h-16 w-full flex items-center justify-center py-4 mt-4">
        {isFetchingMore && <Spinner />}
      </div>
    </div>
  );
};

export default ImageGrid;
