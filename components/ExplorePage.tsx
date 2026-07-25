
import React, { useState, useMemo, useEffect, useRef } from 'react';
import type { User } from 'firebase/auth';
import type { ImageMeta, ProfileUser } from '../types';
import ImageGrid from './ImageGrid';
import Button from './Button';
import { recordSearchInterest } from '../services/interestTracker';
import { isVideoUrl } from '../utils/mediaUtils';
import TrendingSidebar from './TrendingSidebar';
import { getAuth } from 'firebase/auth';

interface ExplorePageProps {
  images: ImageMeta[];
  user: User | null;
  onImageClick: (image: ImageMeta) => void;
  onViewProfile: (user: ProfileUser) => void;
  onLikeToggle: (image: ImageMeta) => void;
  initialSearchTerm?: string;
  onNavigateToApi?: () => void;
  onTrendingTopicClick?: (topic: string) => void;
  onEndReached?: () => void;
  isFetchingNextPage?: boolean;
}

const CategoryCard: React.FC<{ flag: string, image: ImageMeta, onClick: () => void }> = ({ flag, image, onClick }) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (imgRef.current && imgRef.current.complete) {
      if (imgRef.current.naturalWidth > 0) {
        setIsLoaded(true);
      } else {
        setHasError(true);
      }
    }
  }, [image.imageUrl]);

  return (
    <div onClick={onClick} className="relative aspect-1 cursor-pointer group bg-surface/50 rounded-xl overflow-hidden shadow-lg transition-transform duration-300 hover:scale-[1.02]">
      {/* Clean static placeholder - no spinning loader loops */}
      {!isLoaded && !hasError && (
        <div className="absolute inset-0 bg-surface/80 animate-pulse" />
      )}

      {/* Fallback for Broken Images */}
      {hasError ? (
        <div className="absolute inset-0 bg-gradient-to-br from-neutral-800 to-neutral-900 flex flex-col items-center justify-center p-4 border border-white/5">
          <svg className="w-8 h-8 text-neutral-600 mb-1" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
          </svg>
        </div>
      ) : (
        <img 
          ref={imgRef}
          src={image.imageUrl} 
          alt={flag} 
          loading="lazy"
          decoding="async"
          className={`w-full h-full object-cover transition-opacity duration-300 group-hover:scale-105 ${isLoaded ? 'opacity-100' : 'opacity-0'}`} 
          onLoad={() => setIsLoaded(true)}
          onError={() => setHasError(true)}
        />
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent flex items-end justify-start p-4">
        <h2 className="text-white text-base md:text-xl font-bold tracking-tight truncate w-full">{flag}</h2>
      </div>
    </div>
  );
};

const ExplorePage: React.FC<ExplorePageProps> = ({ 
  images, 
  user, 
  onImageClick, 
  onViewProfile, 
  onLikeToggle, 
  initialSearchTerm = '', 
  onNavigateToApi, 
  onTrendingTopicClick,
  onEndReached,
  isFetchingNextPage
}) => {
  const [selectedFlag, setSelectedFlag] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState(initialSearchTerm);

  useEffect(() => {
    if (initialSearchTerm) {
        setSearchQuery(initialSearchTerm);
    }
  }, [initialSearchTerm]);

  // Track search intent with debounce (saves to localStorage for personalization)
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (searchQuery.trim().length >= 3) {
      searchDebounceRef.current = setTimeout(() => {
        recordSearchInterest(searchQuery.trim());
      }, 800);
    }
    return () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current); };
  }, [searchQuery]);

  // Aggregate images by tags (flags)
  const imagesByFlag = useMemo(() => {
    return images.reduce((acc, image) => {
      if (Array.isArray(image.flags)) {
        image.flags.forEach(flag => {
          if (!acc[flag]) {
            acc[flag] = [];
          }
          acc[flag].push(image);
        });
      }
      return acc;
    }, {} as Record<string, ImageMeta[]>);
  }, [images]);

  const sortedFlags = useMemo(() => Object.keys(imagesByFlag).sort(), [imagesByFlag]);

  // Pre-calculate deterministic static representative images for category cards to prevent video stream overload & RAM leaks
  const representativeImages = useMemo(() => {
    const map: Record<string, ImageMeta> = {};
    Object.entries(imagesByFlag).forEach(([flag, categoryImages]: [string, ImageMeta[]]) => {
      if (categoryImages.length > 0) {
        const staticImg = categoryImages.find(img => !isVideoUrl(img.imageUrl));
        map[flag] = staticImg || categoryImages[0];
      }
    });
    return map;
  }, [imagesByFlag]);

  // Search Logic
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    
    const lowerQuery = searchQuery.toLowerCase();
    return images.filter(img => {
        const titleMatch = img.title?.toLowerCase().includes(lowerQuery);
        const descMatch = img.description?.toLowerCase().includes(lowerQuery);
        const flagMatch = img.flags?.some(f => f.toLowerCase().includes(lowerQuery));
        const uploaderMatch = img.uploaderName.toLowerCase().includes(lowerQuery);
        const locationMatch = img.location?.toLowerCase().includes(lowerQuery);
        
        return titleMatch || descMatch || flagMatch || uploaderMatch || locationMatch;
    });
  }, [images, searchQuery]);


  // --- RENDER HELPERS ---

  // 1. Search Results View
  if (searchQuery.trim()) {
      return (
        <div className="animate-fade-in">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <h1 className="text-3xl font-bold text-primary">Search Results</h1>
                <div className="relative w-full md:w-96">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <svg className="h-5 w-5 text-secondary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </div>
                    <input 
                        type="text"
                        placeholder="Search tags, users, locations..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        autoFocus
                        className="block w-full pl-10 pr-16 py-2 border border-border rounded-full leading-5 bg-surface text-primary placeholder-secondary focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent sm:text-sm transition-all shadow-sm"
                    />
                     {searchQuery && (
                        <button onClick={() => setSearchQuery('')} className="absolute inset-y-0 right-12 pr-2 flex items-center text-secondary hover:text-primary">
                           &times;
                        </button>
                    )}
                    <div className="absolute inset-y-0 right-0 pr-2 flex items-center pointer-events-none">
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-accent text-surface tracking-wider">
                            BETA
                        </span>
                    </div>
                </div>
            </div>
            
            {searchResults.length > 0 ? (
                <ImageGrid 
                  images={searchResults} 
                  user={user} 
                  onImageClick={onImageClick} 
                  onViewProfile={onViewProfile} 
                  onLikeToggle={onLikeToggle} 
                  onEndReached={onEndReached}
                  isFetchingMore={isFetchingNextPage}
                />
            ) : (
                <div className="text-center py-16 bg-surface/30 rounded-2xl border border-border border-dashed">
                    <svg className="mx-auto h-12 w-12 text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <h3 className="mt-2 text-sm font-medium text-primary">No matches found</h3>
                    <p className="mt-1 text-sm text-secondary">Try searching for something else like "Tokyo" or "Abstract".</p>
                    <Button onClick={() => setSearchQuery('')} variant="secondary" size="sm" className="mt-4">Clear Search</Button>
                </div>
            )}
        </div>
      );
  }

  // 2. Empty State (No images in DB)
  if (sortedFlags.length === 0) {
    return (
      <div className="text-center py-16">
        <h2 className="text-2xl font-semibold text-primary">Nothing to Explore Yet.</h2>
        <p className="text-secondary mt-2">Upload images with tags to start discovering new categories!</p>
        
        <div className="mt-8 flex justify-center gap-4">
            <a 
              href="https://github.com/hello97-gg/glassgallery-modvc"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-surface text-primary rounded-lg border border-border hover:bg-border transition-colors"
            >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
                Check us out on GitHub
            </a>
            {onNavigateToApi && (
                <button 
                  onClick={onNavigateToApi}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-surface text-primary rounded-lg border border-border hover:bg-border transition-colors"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                    </svg>
                    API Docs
                </button>
            )}
        </div>
      </div>
    );
  }

  // 3. Selected Category View
  if (selectedFlag) {
    return (
      <div className="animate-fade-in">
        <div className="mb-8 flex items-center gap-4">
           <Button onClick={() => setSelectedFlag(null)} variant="secondary" size="sm" className="!p-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
            </Button>
            <h1 className="text-3xl font-bold text-primary">{selectedFlag}</h1>
        </div>
        <ImageGrid 
          images={imagesByFlag[selectedFlag]} 
          user={user} 
          onImageClick={onImageClick} 
          onViewProfile={onViewProfile} 
          onLikeToggle={onLikeToggle} 
          onEndReached={onEndReached}
          isFetchingMore={isFetchingNextPage}
        />
      </div>
    );
  }

  // 4. Default Categories List View
  return (
    <div className="animate-fade-in">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <h1 className="text-3xl font-bold text-primary">Explore</h1>
            
            {/* Search Bar */}
            <div className="relative w-full md:w-96 group">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <svg className="h-5 w-5 text-secondary group-focus-within:text-accent transition-colors" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                </div>
                <input 
                    type="text"
                    placeholder="Search images, tags, users, locations..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="block w-full pl-10 pr-16 py-2 border border-border rounded-full leading-5 bg-surface text-primary placeholder-secondary focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent sm:text-sm transition-all shadow-sm"
                />
                <div className="absolute inset-y-0 right-0 pr-2 flex items-center pointer-events-none">
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-accent text-surface tracking-wider">
                        BETA
                    </span>
                </div>
            </div>
        </div>

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-1">
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 gap-2 md:gap-4">
            {sortedFlags.map((flag) => {
              const categoryImages = imagesByFlag[flag];
              if (!categoryImages || categoryImages.length === 0) return null;
              
              const representativeImage = representativeImages[flag];
              if (!representativeImage) return null;

              return (
                <CategoryCard 
                  key={flag} 
                  flag={flag} 
                  image={representativeImage} 
                  onClick={() => setSelectedFlag(flag)} 
                />
              );
            })}
            
            {/* Open Source Promo Card */}
            <a 
              href="https://github.com/hello97-gg/glassgallery-modvc"
              target="_blank"
              rel="noopener noreferrer"
              className="relative aspect-1 cursor-pointer group bg-surface rounded-xl overflow-hidden shadow-lg transition-all duration-300 hover:shadow-accent/20 hover:-translate-y-1 border border-border flex flex-col items-center justify-center p-6 text-center"
            >
                 <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center mb-4 text-background group-hover:scale-110 transition-transform duration-300">
                    <svg viewBox="0 0 24 24" className="h-8 w-8" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
                 </div>
                 <h3 className="text-primary font-bold text-lg mb-2">We are Open Source!</h3>
                 <p className="text-secondary text-sm">Star us on GitHub.</p>
            </a>

            {/* API Docs Promo Card */}
            {onNavigateToApi && (
                <div 
                  onClick={onNavigateToApi}
                  className="relative aspect-1 cursor-pointer group bg-surface rounded-xl overflow-hidden shadow-lg transition-all duration-300 hover:shadow-accent/20 hover:-translate-y-1 border border-border flex flex-col items-center justify-center p-6 text-center"
                >
                     <div className="w-16 h-16 bg-surface border border-border rounded-full flex items-center justify-center mb-4 text-primary group-hover:scale-110 transition-transform duration-300">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                        </svg>
                     </div>
                     <h3 className="text-primary font-bold text-lg mb-2">Developer API</h3>
                     <p className="text-secondary text-sm">Build on top of Glass Gallery.</p>
                </div>
            )}
          </div>
        </div>

        {/* Trending Sidebar */}
        <div className="w-full lg:w-80 flex-shrink-0 lg:sticky lg:top-6 lg:h-[calc(100vh-3rem)] lg:overflow-y-auto hidden-scrollbar">
          <TrendingSidebar onTopicClick={(topic) => {
            if (onTrendingTopicClick) {
              onTrendingTopicClick(topic);
            } else {
              setSelectedFlag(topic);
            }
          }} />
        </div>
      </div>
    </div>
  );
}

export default ExplorePage;
