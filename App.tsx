
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { flushSync } from 'react-dom';
// Fix: Use Firebase v8 compatibility User type.
import type { User } from 'firebase/auth';
import { auth } from './services/firebase';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { subscribeToImages, deleteImageFromFirestore, getNotificationsForUser, toggleImageLike, PAGE_SIZE, subscribeToImage, getImagesByUploader, getImagesFromFirestore, getPersonalizedFeed, recordImageView, getUserProfile, updateUserProfile, getFollowingList } from './services/firestoreService';
import { getInterestBoost, recordClickInterest, shouldFetchPersonalizedFeed, markPersonalizedFeedFetched } from './services/interestTracker';
import { isVideoUrl } from './utils/mediaUtils';
import type { ImageMeta, ProfileUser, Notification } from './types';
import { getCachedData, setCachedData } from './utils/idbCache';

import Sidebar from './components/Header';
import BottomNav from './components/BottomNav';
import LoginModal from './components/LoginScreen';
import ImageGrid from './components/ImageGrid';
import UploadModal from './components/UploadModal';
import ImageDetailModal from './components/ImageDetailModal';
import ExplorePage from './components/ExplorePage';
import ProfilePage from './components/ProfilePage';
import ApiDocsPage from './components/ApiDocsPage';
import InfiniteFeed from './components/InfiniteFeed';
import PostDetailView from './components/PostDetailView';
import LegalPage from './components/LegalPage';
import { NotificationsList } from './components/Notifications';
import FullScreenDropzone from './components/FullScreenDropzone';
import SEOHead, { DEFAULT_FAVICON } from './components/SEOHead';
import OnboardingModal, { generateSvgAvatar, generateUniqueName } from './components/OnboardingModal';
import MobileAppPromo from './components/MobileAppPromo';
import TrendingSidebar from './components/TrendingSidebar';

// Global Fetch Interceptor for Capacitor Native Platform to reroute relative paths to the production API
if (Capacitor.isNativePlatform()) {
  const originalFetch = window.fetch;
  window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
    let url = '';
    if (typeof input === 'string') {
      url = input;
    } else if (input instanceof URL) {
      url = input.toString();
    } else if (input && typeof input === 'object' && 'url' in input) {
      url = (input as any).url;
    }

    if (url.startsWith('/')) {
      const newUrl = `https://gg.modvc.org${url}`;
      if (typeof input === 'string') {
        input = newUrl;
      } else if (input instanceof URL) {
        input = new URL(newUrl);
      } else if (input && typeof input === 'object') {
        input = new Request(newUrl, input as any);
      }
    }
    return originalFetch(input, init);
  };
}

// --- Favicon SVG Data URIs ---
// Compass Icon for Explore
const EXPLORE_FAVICON = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23f5c3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='12' r='10'/%3E%3Cpolygon points='16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76'/%3E%3C/svg%3E`;

// Code/Terminal Icon for API
const API_FAVICON = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23f5c3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4'/%3E%3C/svg%3E`;


// --- Skeleton Components for Initial Load ---
const SKELETON_HEIGHTS = ['min-h-[200px]', 'min-h-[280px]', 'min-h-[360px]', 'min-h-[240px]'];

const SkeletonFeedPost: React.FC = () => {
  const SKELETON_HEIGHTS = ['h-[300px]', 'h-[400px]', 'h-[250px]', 'h-[450px]'];
  const heightClass = SKELETON_HEIGHTS[Math.floor(Math.random() * SKELETON_HEIGHTS.length)];
  
  return (
    <div className="flex gap-3 p-4 border-b border-border w-full">
      {/* Avatar Skeleton */}
      <div className="shrink-0">
        <div className="w-10 h-10 rounded-full bg-surface" />
      </div>

      {/* Content Skeleton */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Header Skeleton */}
        <div className="flex items-baseline justify-between mb-1">
          <div className="flex items-baseline gap-1.5">
            <div className="h-4 w-24 bg-surface rounded" />
            <div className="h-4 w-16 bg-surface rounded" />
            <div className="h-4 w-12 bg-surface rounded" />
          </div>
          <div className="h-5 w-5 bg-surface rounded-full" />
        </div>
        
        {/* Text Skeleton */}
        <div className="h-4 w-3/4 bg-surface rounded mb-1 mt-1" />
        <div className="h-4 w-1/2 bg-surface rounded mb-3" />

        {/* Media Block Skeleton */}
        <div className={`w-full rounded-2xl bg-surface border border-border mt-1 ${heightClass}`} />

        {/* Actions Skeleton */}
        <div className="flex justify-between items-center mt-3 max-w-md">
          <div className="h-5 w-12 bg-surface rounded" />
          <div className="h-5 w-12 bg-surface rounded" />
          <div className="h-5 w-12 bg-surface rounded" />
          <div className="h-5 w-12 bg-surface rounded" />
        </div>
      </div>
    </div>
  );
};

const SkeletonGrid: React.FC<{ feedTab: 'discover' | 'following', user: User | null }> = ({ feedTab, user }) => {
  return (
    <div className="w-full flex justify-center bg-background min-h-screen">
      <div className="w-full max-w-2xl border-l border-r border-border min-h-screen pb-20 md:pb-0">
        {/* Top Header Tabs Skeleton */}
        <div className="sticky top-0 z-10 bg-background/90 backdrop-blur-md border-b border-border">
           <div className="flex">
              <div className={`flex-1 pt-4 pb-3 font-bold text-center text-[15px] relative ${feedTab === 'discover' ? 'text-primary' : 'text-secondary font-medium'}`}>
                Discover
                {feedTab === 'discover' && <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-16 h-1 bg-accent rounded-t-full"></div>}
              </div>
              <div className={`flex-1 pt-4 pb-3 font-bold text-center text-[15px] relative ${feedTab === 'following' ? 'text-primary' : 'text-secondary font-medium'}`}>
                Following
                {feedTab === 'following' && <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-16 h-1 bg-accent rounded-t-full"></div>}
              </div>
           </div>
        </div>



        <div className="flex flex-col">
          {/* Mock Create Post Section */}
          <div className="flex gap-4 p-4 border-b border-border">
             <div className="w-10 h-10 rounded-full bg-surface shrink-0" />
             <div className="flex-1 flex flex-col justify-center">
                 <div className="h-6 w-48 bg-surface rounded" />
             </div>
             <div className="shrink-0 w-9 h-9 rounded-full bg-surface mt-0.5" />
          </div>

          {Array.from({ length: 5 }).map((_, index) => (
            <SkeletonFeedPost key={index} />
          ))}
        </div>
      </div>
    </div>
  );
};

// Mutable random seed — refreshed on Home click and page load for fresh content
let sessionSeed = Math.random() + Date.now();
const refreshSessionSeed = () => { sessionSeed = Math.random() + Date.now(); };

const seededRandom = (id: string): number => {
  let hash = 0;
  const str = id + sessionSeed.toString();
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash % 1000) / 1000;
};

// Smart "Addictive" sorting algorithm — Twitter-inspired with content diversity
const smartSortImages = (images: ImageMeta[], profile?: ProfileUser | null): ImageMeta[] => {
  const now = Date.now();

  type ImageWithScore = ImageMeta & { sortScore?: number; isVideo?: boolean };

  const scored = images
    .map((image: ImageMeta): ImageWithScore => {
      const uploadedAt = image.uploadedAt?.toDate ? image.uploadedAt.toDate().getTime() : now;
      const ageInHours = (now - uploadedAt) / (1000 * 60 * 60);

      // 1. Recency Score — Twitter-style time decay (smoother curve)
      let recencyScore = 0;
      if (ageInHours < 1) {
          recencyScore = 1800;
      } else if (ageInHours < 6) {
          recencyScore = 1000;
      } else if (ageInHours < 24) {
          recencyScore = 500;
      } else if (ageInHours < 72) {
          recencyScore = 200;
      } else if (ageInHours < 168) {
          recencyScore = 80;
      } else {
          recencyScore = 40 / (Math.max(1, ageInHours / 168));
      }

      // 2. Engagement velocity — reward content getting interaction relative to age
      const likeCount = image.likeCount || 0;
      const downloadCount = image.downloadCount || 0;
      const ageHoursFloor = Math.max(1, ageInHours);
      const velocityScore = ((likeCount * 10) + (downloadCount * 3)) / Math.sqrt(ageHoursFloor);
      const popularityScore = Math.min(velocityScore, 600);

      // 3. Personalized affinity boost
      let personalizationBoost = 0;
      if (profile && profile.followedTags && profile.followedTags.length > 0) {
          const imgTags = image.flags || [];
          const overlap = imgTags.filter(t => profile.followedTags?.includes(t));
          personalizationBoost += overlap.length * 400;
      }

      // 4. Client-side interest boost
      const interestBoost = Math.min(getInterestBoost(image), 400);

      // 5. Moderate video boost
      const isVideo = isVideoUrl(image.imageUrl);
      const videoBoost = isVideo && ageInHours < 48 ? 200 : (isVideo ? 50 : 0);

      // 6. "In case you missed it" — occasionally boost older popular content (Twitter-like discovery)
      let surpriseBoost = 0;
      if (ageInHours > 24 && likeCount >= 3) {
          // ~20% chance to boost older popular content into the top section
          const surprise = seededRandom(image.id + '_surprise');
          if (surprise < 0.2) {
              surpriseBoost = 800 + (likeCount * 20);
          }
      }

      // 7. Large randomness factor — makes every Home click feel fresh and interesting
      const randomFactor = seededRandom(image.id) * 600;

      const finalScore = recencyScore + popularityScore + personalizationBoost + interestBoost + videoBoost + surpriseBoost + randomFactor;

      return { ...image, sortScore: finalScore, isVideo };
    })
    .sort((a, b) => (b.sortScore ?? 0) - (a.sortScore ?? 0));

  // Content diversity enforcement:
  // 1. Cap videos at ~30% of feed
  // 2. Prevent same creator from appearing back-to-back (creator diversity)
  const maxVideoRatio = 0.3;
  const result: ImageMeta[] = [];
  const deferred: ImageWithScore[] = [];
  let videoCount = 0;

  for (const item of scored) {
    const currentRatio = result.length > 0 ? videoCount / result.length : 0;

    // Video ratio cap
    if (item.isVideo && currentRatio >= maxVideoRatio && result.length > 5) {
      deferred.push(item);
      continue;
    }

    // Creator diversity: don't show 3+ posts from the same user in a row
    if (result.length >= 2) {
      const last1 = result[result.length - 1];
      const last2 = result[result.length - 2];
      if (last1.uploaderUid === item.uploaderUid && last2.uploaderUid === item.uploaderUid) {
        deferred.push(item);
        continue;
      }
    }

    if (item.isVideo) videoCount++;
    const { sortScore, isVideo: _isVideo, ...rest } = item;
    result.push(rest as ImageMeta);
  }

  // Interleave deferred content throughout the feed (not just at the end)
  for (const item of deferred) {
    const { sortScore, isVideo: _isVideo, ...rest } = item;
    // Insert at a position after the first third of the feed
    const insertPos = Math.min(result.length, Math.floor(result.length * 0.3) + Math.floor(seededRandom(item.id + '_pos') * result.length * 0.7));
    result.splice(insertPos, 0, rest as ImageMeta);
  }

  return result;
};


// Throttle utility to limit how often a function can run
const throttle = (func: (...args: any[]) => void, limit: number) => {
  let inThrottle: boolean;
  return function(this: any, ...args: any[]) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
};

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  
  const [allImages, setAllImages] = useState<ImageMeta[]>([]);
  const [displayedImages, setDisplayedImages] = useState<ImageMeta[]>([]);
  const [imagesLoading, setImagesLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    try {
      localStorage.removeItem('cached_all_images');
      localStorage.removeItem('cached_displayed_images');
    } catch (e) {}

    const loadCache = async () => {
      const cachedAll = await getCachedData<ImageMeta[]>('cached_all_images');
      if (cachedAll) setAllImages(cachedAll);
      
      const cachedDisplayed = await getCachedData<ImageMeta[]>('cached_displayed_images');
      if (cachedDisplayed && cachedDisplayed.length > 0) {
        setDisplayedImages(cachedDisplayed);
        setCurrentIndex(cachedDisplayed.length);
        setImagesLoading(false);
      }
    };
    loadCache();
  }, []);

  // Track network status online/offline for instant background auto-refreshes
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Caching Synchronizers — debounced to prevent lag from constant writes
  const cacheTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (allImages.length > 0) {
        if (cacheTimerRef.current) clearTimeout(cacheTimerRef.current);
        cacheTimerRef.current = setTimeout(() => {
            setCachedData('cached_all_images', allImages.slice(0, 100)).catch(() => {});
            setCachedData('cached_displayed_images', displayedImages.slice(0, 100)).catch(() => {});
        }, 5000); // Write cache at most once every 5 seconds
    }
  }, [allImages, displayedImages]);

  // Network Status Monitor
  useEffect(() => {
    const handleOnline = () => {
      console.log("Device is online! Triggering silent background feed refresh...");
      setIsOnline(true);
    };
    const handleOffline = () => {
      console.log("Device is offline. Serving content from robust local cache.");
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);
  
  const [selectedImage, setSelectedImage] = useState<ImageMeta | null>(null);
  const [forceEditMode, setForceEditMode] = useState(false);
  const [selectedFeedPost, setSelectedFeedPost] = useState<ImageMeta | null>(null);
  const [isUploadModalOpen, setUploadModalOpen] = useState(false);
  const [isLoginModalOpen, setLoginModalOpen] = useState(false);
  
  const [legalModalTab, setLegalModalTab] = useState<'terms' | 'privacy' | 'guidelines'>('terms');

  const [activeView, setActiveView] = useState<'home' | 'discover' | 'explore' | 'profile' | 'notifications' | 'api' | 'legal' | 'post'>('home');
  const [profileUser, setProfileUser] = useState<ProfileUser | null>(null);
  const [lastView, setLastView] = useState<'home' | 'discover' | 'explore' | 'api' | 'legal'>('home');
  
  const [exploreSearchTerm, setExploreSearchTerm] = useState('');
  const [homeTopicFilter, setHomeTopicFilter] = useState('');

  const [savedImages, setSavedImages] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const saved = localStorage.getItem('savedImages');
      if (saved) setSavedImages(new Set(JSON.parse(saved)));
    } catch(e) {}
  }, []);

  const handleSaveToggle = async (image: ImageMeta) => {
    if (!user) {
      setLoginModalOpen(true);
      return;
    }
    const baseId = image.id.split('_loop_')[0];
    const isCurrentlySaved = savedImages.has(baseId);
    const isCurrentlyLiked = (image.likedBy || []).includes(user.uid);

    // Toggle save locally
    setSavedImages(prev => {
      const newSet = new Set(prev);
      if (isCurrentlySaved) newSet.delete(baseId);
      else newSet.add(baseId);
      localStorage.setItem('savedImages', JSON.stringify(Array.from(newSet)));
      return newSet;
    });

    // Sync with Like: if saving but not liked -> like it. if unsaving and liked -> unlike it.
    if (!isCurrentlySaved && !isCurrentlyLiked) {
       await handleLikeToggle(image);
    } else if (isCurrentlySaved && isCurrentlyLiked) {
       await handleLikeToggle(image);
    }
  };

  const [feedTab, setFeedTab] = useState<'discover' | 'following'>('discover');
  const [followingUids, setFollowingUids] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (user) {
      getFollowingList(user.uid).then(users => {
        setFollowingUids(new Set(users.map(u => u.uploaderUid)));
      }).catch(err => console.error("Failed to load following list", err));
    } else {
      setFollowingUids(new Set());
      if (feedTab === 'following') setFeedTab('discover');
    }
  }, [user]);

  const activeAllImages = useMemo(() => {
    let result = allImages;
    if (feedTab === 'following') {
       result = result.filter(img => followingUids.has(img.uploaderUid));
    }
    if (homeTopicFilter) {
       const lowerTopic = homeTopicFilter.toLowerCase();
       result = result.filter(img => 
         img.flags?.some(f => f.toLowerCase() === lowerTopic) ||
         img.title?.toLowerCase().includes(lowerTopic) ||
         img.description?.toLowerCase().includes(lowerTopic) ||
         img.aiConcepts?.some(c => c.toLowerCase() === lowerTopic)
       );
    }
    return result;
  }, [allImages, feedTab, followingUids, homeTopicFilter]);

  const lastFilterState = useRef({ feedTab, homeTopicFilter, loaded: false });

  useEffect(() => {
    if (activeView === 'home') {
      const filterChanged = 
        lastFilterState.current.feedTab !== feedTab || 
        lastFilterState.current.homeTopicFilter !== homeTopicFilter;
        
      const isInitialLoad = !lastFilterState.current.loaded && activeAllImages.length > 0;
      
      if (filterChanged || isInitialLoad) {
        lastFilterState.current = { feedTab, homeTopicFilter, loaded: activeAllImages.length > 0 };
        setDisplayedImages(activeAllImages.slice(0, PAGE_SIZE));
        setCurrentIndex(PAGE_SIZE);
      }
    }
  }, [activeAllImages, activeView, feedTab, homeTopicFilter]);

  const [notifications, setNotifications] = useState<Notification[]>([]);
  
  const markLocalAsRead = (ids: string[]) => {
      setNotifications(prev => prev.map(n => ids.includes(n.id) ? { ...n, read: true } : n));
  };
  
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [droppedFile, setDroppedFile] = useState<File | null>(null);
  const dragCounter = useRef(0);
  const deepLinkUnsubscribeRef = useRef<(() => void) | null>(null);
  const isLoadingMore = useRef(false);
  const scrollPositions = useRef<Record<string, number>>({});

  const [currentUserProfile, setCurrentUserProfile] = useState<ProfileUser | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);

  // derivation of tags with at least 5 images along with up to 3 previews each
  const popularTags = useMemo(() => {
    const counts: Record<string, number> = {};
    const tagImages: Record<string, string[]> = {};

    allImages.forEach(img => {
      if (Array.isArray(img.flags)) {
        img.flags.forEach(tag => {
          if (tag && tag.toLowerCase() !== 'flagged') {
            counts[tag] = (counts[tag] || 0) + 1;
            if (!tagImages[tag]) {
              tagImages[tag] = [];
            }
            if (img.imageUrl && tagImages[tag].length < 3) {
              tagImages[tag].push(img.imageUrl);
            }
          }
        });
      }
    });

    return Object.keys(counts)
      .filter(tag => counts[tag] >= 5)
      .sort((a, b) => counts[b] - counts[a])
      .map(tag => ({
        name: tag,
        previews: tagImages[tag] || []
      }));
  }, [allImages]);

  // derivation of active popular creators
  const popularCreators = useMemo(() => {
    if (!user) return [];
    const map = new Map<string, { uploaderUid: string, uploaderName: string, uploaderPhotoURL: string, count: number }>();
    allImages.forEach(img => {
      if (img.uploaderUid && img.uploaderUid !== user.uid) {
        const existing = map.get(img.uploaderUid);
        if (existing) {
          existing.count += 1;
        } else {
          map.set(img.uploaderUid, {
            uploaderUid: img.uploaderUid,
            uploaderName: img.uploaderName,
            uploaderPhotoURL: img.uploaderPhotoURL || '',
            count: 1
          });
        }
      }
    });
    return Array.from(map.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [allImages, user]);

  const handleOnboardingComplete = async (selectedTags: string[], followedCreators: string[], customName: string, customPhoto: string) => {
    if (!user) return;
    try {
      const updatedProfile = {
        ...currentUserProfile,
        uploaderName: customName,
        uploaderPhotoURL: customPhoto,
        onboarded: true,
        followedTags: selectedTags
      };
      await updateUserProfile(user.uid, updatedProfile);
      setCurrentUserProfile(updatedProfile as ProfileUser);
      setShowOnboarding(false);
    } catch (err) {
      console.error("Failed to complete onboarding:", err);
    }
  };

  const handleOnboardingSkip = async () => {
    if (!user) return;
    try {
      const updatedProfile = {
        ...currentUserProfile,
        onboarded: true
      };
      await updateUserProfile(user.uid, updatedProfile);
      setCurrentUserProfile(updatedProfile as ProfileUser);
      setShowOnboarding(false);
    } catch (err) {
      console.error("Failed to skip onboarding:", err);
    }
  };

  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged((currentUser) => {
      if (currentUser) {
        const isPasswordProvider = currentUser.providerData.some(p => p.providerId === 'password');
        if (isPasswordProvider && !currentUser.emailVerified) {
          auth.signOut();
          setUser(null);
          setAuthLoading(false);
          return;
        }
      }
      setUser(currentUser);
      setAuthLoading(false);
      if (currentUser) {
        setLoginModalOpen(false);
        // Load user profile & onboarding state in background
        getUserProfile(currentUser.uid).then(async (profile) => {
          if (!profile) {
            // New signup profile initialization in DB with instant SVG avatar & unique generated name
            const defaultName = currentUser.displayName || generateUniqueName();
            const defaultPhoto = currentUser.photoURL || generateSvgAvatar(currentUser.uid);
            const newProfile: ProfileUser = {
              uploaderUid: currentUser.uid,
              uploaderName: defaultName,
              uploaderPhotoURL: defaultPhoto,
              email: currentUser.email || '',
              onboarded: false,
              followedTags: []
            };
            await updateUserProfile(currentUser.uid, newProfile);
            setCurrentUserProfile(newProfile);
            setShowOnboarding(true);
          } else {
            setCurrentUserProfile(profile);
            if (!profile.onboarded) {
              setShowOnboarding(true);
            }
          }
        }).catch(err => {
          console.error("Failed to fetch logged in user profile:", err);
        });
      } else {
        setCurrentUserProfile(null);
        setShowOnboarding(false);
      }
    });

    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (user) {
        const unsubscribeNotifications = getNotificationsForUser(user.uid, setNotifications);
        return () => unsubscribeNotifications();
    } else {
        setNotifications([]);
    }
  }, [user]);

  // Keep allImagesRef synced for instant navigation retrieval
  const allImagesRef = useRef<ImageMeta[]>(allImages);
  useEffect(() => {
    allImagesRef.current = allImages;
  }, [allImages]);

  // --- DEEP LINKING & ROUTING HANDLER ---
  useEffect(() => {
    const handleRouting = () => {
      const params = new URLSearchParams(window.location.search);
      const pathMatch = window.location.pathname.match(/^\/image\/([a-zA-Z0-9_-]+)/);
      const imageId = params.get('image') || (pathMatch ? pathMatch[1] : null);
      const userId = params.get('user');
      const searchTerm = params.get('search');
      const viewParam = params.get('view');
      const isLegal = window.location.pathname.startsWith('/legal') || viewParam === 'legal';

      if (imageId) {
        if (deepLinkUnsubscribeRef.current) {
          deepLinkUnsubscribeRef.current();
          deepLinkUnsubscribeRef.current = null;
        }
        
        // Instant update from ref if available before network subscribe finishes
        const baseId = imageId.split('_loop_')[0];
        const existing = allImagesRef.current.find(i => i.id.split('_loop_')[0] === baseId);
        if (existing) {
          const isHome = !userId && !searchTerm && viewParam !== 'api' && !isLegal;
          if (isHome) {
            setSelectedFeedPost(existing);
            setActiveView('post');
          } else {
            setSelectedImage(existing);
          }
        }

        const unsubscribe = subscribeToImage(baseId, (img) => {
          if (img) {
            const isHome = !userId && !searchTerm && viewParam !== 'api' && !isLegal;
            if (isHome) {
              setSelectedFeedPost(img);
              setActiveView('post');
            } else {
              setSelectedImage(img);
            }
          }
        });
        deepLinkUnsubscribeRef.current = unsubscribe;
      } else {
        setSelectedImage(null);
        setSelectedFeedPost(null);
        if (deepLinkUnsubscribeRef.current) {
          deepLinkUnsubscribeRef.current();
          deepLinkUnsubscribeRef.current = null;
        }
      }
      
      if (userId) {
         const profile: ProfileUser = {
             uploaderUid: userId,
             uploaderName: 'Loading...',
             uploaderPhotoURL: ''
         };
         setProfileUser(profile);
         setActiveView('profile');
      } else if (isLegal) {
          const tab = params.get('tab') || 'terms';
          setLegalModalTab(tab as 'terms' | 'privacy' | 'guidelines');
          setActiveView('legal');
          setProfileUser(null);
      } else if (viewParam === 'api') {
          setActiveView('api');
          setProfileUser(null);
      } else if (searchTerm) {
          setExploreSearchTerm(searchTerm);
          setActiveView('explore');
          setProfileUser(null);
      } else {
          setActiveView('home');
          setProfileUser(null);
      }
    };

    handleRouting();
    window.addEventListener('popstate', handleRouting);
    return () => {
      window.removeEventListener('popstate', handleRouting);
      if (deepLinkUnsubscribeRef.current) {
        deepLinkUnsubscribeRef.current();
        deepLinkUnsubscribeRef.current = null;
      }
    };
  }, []);

  // Native Push Notifications Hook
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const registerPush = async () => {
      let permStatus = await PushNotifications.checkPermissions();
      
      if (permStatus.receive === 'prompt') {
        permStatus = await PushNotifications.requestPermissions();
      }
      
      if (permStatus.receive !== 'granted') {
        console.warn('User denied push notifications permissions.');
        return;
      }
      
      // Create high-importance default notification channel (Required for Android 8+ headers)
      try {
        await PushNotifications.createChannel({
          id: 'default',
          name: 'General Notifications',
          description: 'General updates and notifications',
          importance: 5, // Urgent (Forces heads-up banners on screen)
          visibility: 1, // Public visibility
          sound: 'default',
          vibration: true
        });
        console.log('FCM default notification channel registered.');
      } catch (channelErr) {
        console.error('Failed to register native channel:', channelErr);
      }
      
      await PushNotifications.register();
      
      PushNotifications.addListener('registration', (token) => {
        console.log('Push registration success, token:', token.value);
      });
      
      PushNotifications.addListener('registrationError', (err) => {
        console.error('Push registration error:', err);
      });
      
      PushNotifications.addListener('pushNotificationReceived', (notification) => {
        console.log('Push notification received:', notification);
      });
    };

    registerPush();
  }, []);

  const updateURL = (params: { image?: string; user?: string; search?: string; view?: string; tab?: string } | null) => {
    const url = new URL(window.location.href);
    url.search = ''; 
    
    if (params?.image) {
      url.pathname = `/image/${params.image}`;
    } else if (params?.view === 'legal') {
      url.pathname = '/legal';
      if (params?.tab) url.searchParams.set('tab', params.tab);
    } else {
      url.pathname = '/';
    }
    
    if (params?.user) url.searchParams.set('user', params.user);
    if (params?.search) url.searchParams.set('search', params.search);
    if (params?.view && params.view !== 'legal') url.searchParams.set('view', params.view);
    
    window.history.pushState({}, '', url.toString());
  };

  // --- Image Data Fetching Strategy ---
  // We use a hybrid approach:
  // 1. Fetch once with .get() to ensure crawlers/bots get data immediately without waiting for websocket.
  // 2. Set up .onSnapshot() for real-time updates for connected users.
  // Use a ref for profile so the subscription callback always reads the latest value
  // without causing re-subscription (which would re-sort and reshuffle the feed).
  const profileRef = useRef(currentUserProfile);
  profileRef.current = currentUserProfile;

  useEffect(() => {
    let unsubscribe: () => void;

    if (activeView === 'home' || activeView === 'explore') {
        if (allImages.length === 0) {
            setImagesLoading(true);
        }
        
        // For logged-in users: fetch personalized feed first (with 5-min cache to save DB costs)
        if (user && allImages.length === 0 && shouldFetchPersonalizedFeed()) {
          getPersonalizedFeed(user.uid).then(({ images: personalizedImages }) => {
            if (personalizedImages.length > 0) {
              markPersonalizedFeedFetched();
              setAllImages(personalizedImages);
              setDisplayedImages(personalizedImages.slice(0, PAGE_SIZE));
              setCurrentIndex(PAGE_SIZE);
              setImagesLoading(false);
            }
          }).catch(() => {
            // Silent fail — polling will handle it
          });
        }

        // Real-time listener (keeps data fresh, handles new uploads)
        unsubscribe = subscribeToImages((fetchedImages) => {
            setAllImages((prevImages) => {
                 // If this is the very first load, sort once and display
                  if (prevImages.length === 0) {
                      const sorted = smartSortImages(fetchedImages, profileRef.current);
                      setDisplayedImages(sorted.slice(0, PAGE_SIZE));
                      setCurrentIndex(PAGE_SIZE);
                      setImagesLoading(false);
                      return sorted;
                  }
                 
                 // On subsequent polls: ONLY merge metadata (likes, downloads, etc.)
                 // Do NOT re-sort — this prevents the feed from randomly reshuffling
                 const newMap = new Map(fetchedImages.map(i => [i.id, i]));
                 const currentBaseIds = new Set(prevImages.map(i => i.id.split('_loop_')[0]));
                 const newUploads = fetchedImages.filter(i => !currentBaseIds.has(i.id));

                 let updatedList = prevImages
                    .filter(img => newMap.has(img.id.split('_loop_')[0]))
                    .map(img => {
                        const baseId = img.id.split('_loop_')[0];
                        const freshData = newMap.get(baseId);
                        if (freshData) {
                            // Only update engagement data, preserve position
                            return { 
                                ...img, 
                                likeCount: freshData.likeCount, 
                                downloadCount: freshData.downloadCount,
                                likedBy: freshData.likedBy
                            };
                        }
                        return img;
                    });
                 
                 if (newUploads.length > 0) {
                     const sortedNew = newUploads.sort((a, b) => {
                         const timeA = a.uploadedAt?.toDate ? a.uploadedAt.toDate().getTime() : 0;
                         const timeB = b.uploadedAt?.toDate ? b.uploadedAt.toDate().getTime() : 0;
                         return timeB - timeA;
                     });
                     updatedList = [...sortedNew, ...updatedList];
                 }
                 
                 // Bulletproof unique filtering by base ID
                 const uniqueMapAll = new Map();
                 updatedList.forEach(img => uniqueMapAll.set(img.id, img));
                 updatedList = Array.from(uniqueMapAll.values());

                 // Update display list quietly - only update engagement data, preserve order
                 setDisplayedImages(prevDisplayed => {
                    let updatedDisplayed = prevDisplayed
                        .filter(d => newMap.has(d.id.split('_loop_')[0]))
                        .map(d => {
                            const baseId = d.id.split('_loop_')[0];
                            const freshData = newMap.get(baseId);
                            if (freshData) {
                                return { 
                                    ...d, 
                                    likeCount: freshData.likeCount, 
                                    downloadCount: freshData.downloadCount,
                                    likedBy: freshData.likedBy
                                };
                            }
                            return d;
                        });
                    
                    if (newUploads.length > 0) {
                         const sortedNew = newUploads.sort((a, b) => {
                             const timeA = a.uploadedAt?.toDate ? a.uploadedAt.toDate().getTime() : 0;
                             const timeB = b.uploadedAt?.toDate ? b.uploadedAt.toDate().getTime() : 0;
                             return timeB - timeA;
                         });
                         updatedDisplayed = [...sortedNew, ...updatedDisplayed];
                    }

                    const uniqueMapDisplayed = new Map();
                    updatedDisplayed.forEach(img => uniqueMapDisplayed.set(img.id, img));
                    return Array.from(uniqueMapDisplayed.values());
                 });
                 
                 return updatedList;
            });
        });
    }
    
    return () => {
        if (unsubscribe) unsubscribe();
    };
  }, [activeView, isOnline]);

  // Sync selectedImage and selectedFeedPost
  useEffect(() => {
    if (selectedImage && allImages.length > 0) {
        const baseId = selectedImage.id.split('_loop_')[0];
        const updated = allImages.find(img => img.id.split('_loop_')[0] === baseId);
        if (updated && updated !== selectedImage) {
            setSelectedImage(updated);
        }
    }
    if (selectedFeedPost && allImages.length > 0) {
        const baseId = selectedFeedPost.id.split('_loop_')[0];
        const updated = allImages.find(img => img.id.split('_loop_')[0] === baseId);
        if (updated && updated !== selectedFeedPost) {
            setSelectedFeedPost(updated);
        }
    }
  }, [allImages, selectedImage, selectedFeedPost]);

  const loadMoreImages = useCallback(() => {
    if (imagesLoading || activeAllImages.length === 0 || isLoadingMore.current) return;

    if (currentIndex >= activeAllImages.length) {
      isLoadingMore.current = false;
      return;
    }

    isLoadingMore.current = true;

    const nextIndex = currentIndex + PAGE_SIZE;
    const newImages = activeAllImages.slice(currentIndex, nextIndex);
    setCurrentIndex(nextIndex);

    if (newImages.length > 0) {
        const uniqueTime = Date.now();
        const processed = newImages.map((img, idx) => ({
            ...img,
            id: `${img.id}_loop_${uniqueTime}_${idx}`
        }));
        setDisplayedImages(prev => [...prev, ...processed]);
    }

    requestAnimationFrame(() => { isLoadingMore.current = false; });
  }, [currentIndex, activeAllImages, imagesLoading]);

  useEffect(() => {
    let ticking = false;
    const handleScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        if (['home', 'discover', 'explore', 'post'].includes(activeView) && !isLoadingMore.current) {
            const scrollThreshold = 500;
            const hasUserScrolled = window.scrollY > 50;
            const isNearBottom = hasUserScrolled && (window.innerHeight + window.scrollY >= document.documentElement.offsetHeight - scrollThreshold);
            
            if (isNearBottom) {
              loadMoreImages();
            }
        }
        ticking = false;
      });
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [loadMoreImages, activeView]);

  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (user && !isUploadModalOpen && !isLoginModalOpen && !selectedImage) {
        // Checking for Files in types is more reliable across browsers than checking items array
        const hasFiles = e.dataTransfer?.types?.includes('Files') || 
            (e.dataTransfer?.items && Array.from(e.dataTransfer.items).some(item => item.kind === 'file'));
        
        if (hasFiles) {
            setIsDraggingOver(true);
        }
    }
  }, [user, isUploadModalOpen, isLoginModalOpen, selectedImage]);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
        setIsDraggingOver(false);
    }
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (user && !isUploadModalOpen && !isLoginModalOpen && !selectedImage) {
        e.dataTransfer!.dropEffect = 'copy';
    } else {
        e.dataTransfer!.dropEffect = 'none';
    }
  }, [user, isUploadModalOpen, isLoginModalOpen, selectedImage]);

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    dragCounter.current = 0;

    if (user && !isUploadModalOpen && !isLoginModalOpen && !selectedImage) {
        if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
            const file = e.dataTransfer.files[0];
            
            // Fallback to extension if MIME type is empty (common for some video formats like MKV)
            const isImage = file?.type.startsWith('image/') || file?.name.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i);
            const isVideo = file?.type.startsWith('video/') || file?.name.match(/\.(mp4|webm|ogg|mkv|mov|avi)$/i);

            if (file && (isImage || isVideo)) {
                setDroppedFile(file);
                setUploadModalOpen(true);
            }
            e.dataTransfer.clearData();
        }
    }
  }, [user, isUploadModalOpen, isLoginModalOpen, selectedImage]);

  useEffect(() => {
    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);
    return () => {
        window.removeEventListener('dragenter', handleDragEnter);
        window.removeEventListener('dragleave', handleDragLeave);
        window.removeEventListener('dragover', handleDragOver);
        window.removeEventListener('drop', handleDrop);
    };
  }, [handleDragEnter, handleDragLeave, handleDragOver, handleDrop]);

  const handleImageClick = (image: ImageMeta) => {
    const doClick = () => {
      const baseId = image.id.split('_loop_')[0];
      const original = allImages.find(img => img.id.split('_loop_')[0] === baseId) || image;
      
      const viewIncremented = { ...original, viewCount: (original.viewCount || 0) + 1 };
      
      setSelectedImage(viewIncremented);
      setAllImages(prev => prev.map(img => img.id.split('_loop_')[0] === baseId ? { ...img, viewCount: viewIncremented.viewCount } : img));
      setDisplayedImages(prev => prev.map(img => img.id.split('_loop_')[0] === baseId ? { ...img, viewCount: viewIncremented.viewCount } : img));
      
      updateURL({ image: baseId });
      if (user) {
        recordImageView(baseId, user.uid);
      }
      recordClickInterest(viewIncremented);
    };

    if (document.startViewTransition) {
      document.startViewTransition(() => {
        flushSync(() => {
          doClick();
        });
      });
    } else {
      doClick();
    }
  };

  const handleFeedImageClick = (image: ImageMeta) => {
    const doClick = () => {
      const baseId = image.id.split('_loop_')[0];
      const original = allImages.find(img => img.id.split('_loop_')[0] === baseId) || image;
      
      const viewIncremented = { ...original, viewCount: (original.viewCount || 0) + 1 };
      
      setSelectedFeedPost(viewIncremented);
      saveScrollPosition();
      setActiveView('post');
      window.scrollTo({ top: 0, behavior: 'instant' });
      updateURL({ image: baseId });
      if (user) {
        recordImageView(baseId, user.uid);
      }
      recordClickInterest(viewIncremented);
      
      // Update counts asynchronously without locking the UI thread
      setTimeout(() => {
        setAllImages(prev => prev.map(img => img.id.split('_loop_')[0] === baseId ? { ...img, viewCount: viewIncremented.viewCount } : img));
        setDisplayedImages(prev => prev.map(img => img.id.split('_loop_')[0] === baseId ? { ...img, viewCount: viewIncremented.viewCount } : img));
      }, 50);
    };

    if (document.startViewTransition) {
      document.startViewTransition(() => {
        doClick();
      });
    } else {
      doClick();
    }
  };
  
  const handleImageClickFromNotification = (partialImage: Partial<ImageMeta>) => {
    const fullImage = allImages.find(i => i.id === partialImage.id) || partialImage as ImageMeta;
    if (fullImage.id) {
       handleFeedImageClick(fullImage);
    }
  };
  
  const handleLocationClick = (location: string) => {
      setExploreSearchTerm(location);
      setActiveView('explore');
      window.scrollTo({ top: 0, behavior: 'instant' });
      updateURL({ search: location });
      setSelectedImage(null);
  }

  const refetchImages = () => {
    setImagesLoading(true);
    const fetchFn = user 
      ? getPersonalizedFeed(user.uid).then(({ images }) => images)
      : getImagesFromFirestore().then(({ images }) => images);
    
    fetchFn.then((images) => {
         // For personalized feed, images are already sorted by the server
         const sorted = user ? images : smartSortImages(images, currentUserProfile);
         setAllImages(sorted);
         setDisplayedImages(sorted.slice(0, PAGE_SIZE));
         setCurrentIndex(PAGE_SIZE);
         setImagesLoading(false);
    }).catch(err => {
        console.error("Refetch failed", err);
        // Fallback to generic fetch
        getImagesFromFirestore().then(({ images }) => {
          const sorted = smartSortImages(images, currentUserProfile);
          setAllImages(sorted);
          setDisplayedImages(sorted.slice(0, PAGE_SIZE));
          setCurrentIndex(PAGE_SIZE);
          setImagesLoading(false);
        }).catch(() => setImagesLoading(false));
    });
  };

  const handleUploadSuccess = () => {
    setUploadModalOpen(false);
    setDroppedFile(null);
    refetchImages(); // Refetch instantly so the new upload shows up instantly!
    if (activeView !== 'profile') {
        setActiveView('home');
        updateURL(null);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleCreateClick = () => {
    if (user) {
      setUploadModalOpen(true);
    } else {
      setLoginModalOpen(true);
    }
  };

  const saveScrollPosition = () => {
      scrollPositions.current[activeView] = window.scrollY;
  };

  // Restore scroll position whenever the view changes
  useEffect(() => {
      const savedPosition = scrollPositions.current[activeView] || 0;
      // Use setTimeout to ensure DOM is updated before restoring scroll
      setTimeout(() => {
          window.scrollTo({ top: savedPosition, behavior: 'instant' });
      }, 10);
  }, [activeView]);

  const handleViewProfile = (userToView: ProfileUser) => {
    const doViewProfile = () => {
      saveScrollPosition();
      if (activeView !== 'profile') {
          setLastView(activeView as 'home' | 'explore' | 'api');
      }
      setProfileUser(userToView);
      setActiveView('profile');
      window.scrollTo({ top: 0, behavior: 'instant' });
      setSelectedImage(null);
      updateURL({ user: userToView.uploaderUid });
    };

    if (document.startViewTransition) {
      document.startViewTransition(() => {
        flushSync(() => {
          doViewProfile();
        });
      });
    } else {
      doViewProfile();
    }
  };

  const handleBack = () => {
    saveScrollPosition();
    setActiveView(lastView);
    window.scrollTo({ top: scrollPositions.current[lastView] || 0, behavior: 'instant' });
    setProfileUser(null);
    updateURL(null);
  }
  
  const handleSetView = (view: 'home' | 'explore' | 'discover' | 'notifications' | 'api') => {
    if (view === activeView && (view === 'home' || view === 'explore' || view === 'discover')) {
        window.scrollTo({ top: 0, behavior: 'instant' });
        if (view === 'explore') {
            setExploreSearchTerm('');
            updateURL(null);
        } else if (view === 'home') {
            setHomeTopicFilter('');
            // Refresh feed with new sort order (like Twitter pull-to-refresh)
            refreshSessionSeed();
            const freshSorted = smartSortImages(allImages, profileRef.current);
            setAllImages(freshSorted);
            setDisplayedImages(freshSorted.slice(0, PAGE_SIZE));
            setCurrentIndex(PAGE_SIZE);
        }
    } else {
        saveScrollPosition();
        setActiveView(view);
        window.scrollTo({ top: 0, behavior: 'instant' });
        setProfileUser(null);
        setExploreSearchTerm('');
        if (view === 'home') {
            setHomeTopicFilter('');
            // Refresh feed with new sort order when navigating to Home
            refreshSessionSeed();
            const freshSorted = smartSortImages(allImages, profileRef.current);
            setAllImages(freshSorted);
            setDisplayedImages(freshSorted.slice(0, PAGE_SIZE));
            setCurrentIndex(PAGE_SIZE);
        }
        
        if (view === 'api') {
          updateURL({ view: 'api' });
        } else {
          updateURL(null);
        }
    }
  };

  const handleOpenLegal = (tab: 'terms' | 'privacy' | 'guidelines' = 'terms') => {
      saveScrollPosition();
      setLegalModalTab(tab);
      setActiveView('legal');
      setProfileUser(null);
      updateURL({ view: 'legal', tab });
  };

  const handleImageUpdate = (updatedImage: ImageMeta) => {
    const baseId = updatedImage.id.split('_loop_')[0];
    const updater = (prevImages: ImageMeta[]) => prevImages.map(img => {
      const imgBaseId = img.id.split('_loop_')[0];
      if (imgBaseId === baseId) {
        // Retain the specific loop suffix ID key while updating all other properties
        return { ...updatedImage, id: img.id };
      }
      return img;
    });
    setDisplayedImages(updater);
    setAllImages(updater);

    if (selectedImage) {
      const selectedBaseId = selectedImage.id.split('_loop_')[0];
      if (selectedBaseId === baseId) {
         setSelectedImage({ ...updatedImage, id: selectedImage.id });
      }
    }
    if (selectedFeedPost) {
      const selectedBaseId = selectedFeedPost.id.split('_loop_')[0];
      if (selectedBaseId === baseId) {
         setSelectedFeedPost({ ...updatedImage, id: selectedFeedPost.id });
      }
    }
  };

  const handleLikeToggle = async (image: ImageMeta) => {
    if (!user) {
        setLoginModalOpen(true);
        return;
    }
    
    // Resolve original base image and ID
    const baseId = image.id.split('_loop_')[0];
    const originalImage = allImages.find(img => img.id.split('_loop_')[0] === baseId) || image;
    
    const oldLikedBy = originalImage.likedBy || [];
    const hasLiked = oldLikedBy.includes(user.uid);
    const newLikedBy = hasLiked
        ? oldLikedBy.filter(id => id !== user.uid)
        : [...oldLikedBy, user.uid];

    // Sync save state automatically when liking/unliking
    setSavedImages(prev => {
      const newSet = new Set(prev);
      if (!hasLiked) newSet.add(baseId); // If we are liking, add to saves
      else newSet.delete(baseId); // If we are unliking, remove from saves
      localStorage.setItem('savedImages', JSON.stringify(Array.from(newSet)));
      return newSet;
    });

    const updatedImage = { ...originalImage, likedBy: newLikedBy, likeCount: newLikedBy.length };
    handleImageUpdate(updatedImage); 

    try {
        await toggleImageLike({ ...originalImage, id: baseId }, user);
    } catch (error) {
        console.error("Failed to toggle like:", error);
        handleImageUpdate(originalImage);
    }
  };

  const handleImageDelete = async (imageId: string) => {
    try {
        await deleteImageFromFirestore(imageId);
        setSelectedImage(null);
        updateURL(null);
    } catch (error) {
        console.error("Failed to delete image:", error);
    }
  };

  const renderContent = () => {
    if (activeView === 'api') {
        return (
            <>
                <SEOHead 
                    title="Developer API"
                    description="Integrate Glass Gallery into your applications with our public API."
                    url={window.location.href}
                    favicon={API_FAVICON}
                />
                <ApiDocsPage />
            </>
        );
    }

    if (activeView === 'legal') {
        return (
            <LegalPage 
                initialTab={legalModalTab} 
                onBackToFeed={handleBack} 
            />
        );
    }

    // Fix for SEO: Do NOT block on authLoading. Only block if images are strictly loading and empty.
    // If auth is loading, we just render as if 'guest'.
    if (imagesLoading && displayedImages.length === 0 && (activeView === 'home' || activeView === 'explore' || activeView === 'discover')) {
       return <SkeletonGrid feedTab={feedTab} user={user} />;
    }
    
    if (activeView === 'notifications') {
        return (
            <>
                <SEOHead 
                    title="Notifications"
                    description="View your latest notifications on Glass Gallery."
                    url={window.location.href}
                />
                <div className="pt-4 md:pt-8 max-w-2xl mx-auto w-full px-4">
                    <h2 className="text-2xl font-bold mb-6 text-primary">Notifications</h2>
                    <NotificationsList 
                        notifications={notifications} 
                        onClose={() => {}} 
                        onImageClick={handleImageClickFromNotification} 
                        onViewProfile={handleViewProfile} 
                        onMarkAsRead={markLocalAsRead} 
                        isPage={true} 
                    />
                </div>
            </>
        );
    }
    
    if (activeView === 'profile' && profileUser) {
        return (
            <>
                <SEOHead 
                    title={`${profileUser.uploaderName}'s Profile`}
                    description={`Check out photos and images uploaded by ${profileUser.uploaderName} on Glass Gallery.`}
                    imageUrl={profileUser.uploaderPhotoURL}
                    type="profile"
                    url={window.location.href}
                    favicon={profileUser.uploaderPhotoURL}
                />
                <ProfilePage 
                    key={profileUser.uploaderUid}
                    user={profileUser} 
                    loggedInUser={user} 
                    onBack={handleBack} 
                    onImageClick={handleImageClick} 
                    onViewProfile={handleViewProfile} 
                    onLikeToggle={handleLikeToggle}
                    onLocationClick={handleLocationClick}
                />
            </>
        );
    }
    
    if (activeView === 'explore') {
        return (
            <>
                <SEOHead 
                    title="Explore Images"
                    description="Discover trending categories and tags on Glass Gallery."
                    url={window.location.href}
                    favicon={EXPLORE_FAVICON}
                />
                <ExplorePage 
                    images={allImages} 
                    user={user} 
                    onImageClick={handleImageClick} 
                    onViewProfile={handleViewProfile} 
                    onLikeToggle={handleLikeToggle}
                    initialSearchTerm={exploreSearchTerm}
                    onNavigateToApi={() => handleSetView('api')}
                    onTrendingTopicClick={(topic) => {
                        setHomeTopicFilter(topic);
                        handleSetView('home');
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                />
            </>
        );
    }

    // DISCOVER (Old Home Grid)
    if (activeView === 'discover') {
        return (
            <>
                <SEOHead 
                    title="Discover"
                    description="A modern image sharing platform. Discover and share beautiful images."
                    url={window.location.href}
                    favicon={DEFAULT_FAVICON}
                />
                <ImageGrid images={displayedImages} user={user} onImageClick={handleImageClick} onViewProfile={handleViewProfile} onLikeToggle={handleLikeToggle} />
            </>
        );
    }

    if (activeView === 'post' && selectedFeedPost) {
        return (
            <>
                <SEOHead 
                    title={`${selectedFeedPost.title || 'Post'} by ${selectedFeedPost.uploaderName}`}
                    description={selectedFeedPost.description || 'View this post on Glass Gallery'}
                    url={window.location.href}
                    imageUrl={selectedFeedPost.imageUrl}
                    favicon={selectedFeedPost.uploaderPhotoURL || DEFAULT_FAVICON}
                    type="article"
                    tags={selectedFeedPost.tags}
                    location={selectedFeedPost.location}
                    license={selectedFeedPost.license}
                    authorName={selectedFeedPost.uploaderName}
                    author={selectedFeedPost.uploaderUid}
                />
                <PostDetailView
                  image={selectedFeedPost}
                  user={user}
                  suggestedImages={allImages.length > 0 ? allImages : displayedImages}
                  onClose={() => {
                      const doClose = () => {
                          if (window.history.length > 1 && window.location.pathname.startsWith('/image/')) {
                              window.history.back();
                          } else {
                              setSelectedFeedPost(null);
                              if (deepLinkUnsubscribeRef.current) {
                                  deepLinkUnsubscribeRef.current();
                                  deepLinkUnsubscribeRef.current = null;
                              }
                              updateURL(null);
                              handleBack();
                          }
                      };
                      if (document.startViewTransition) {
                          document.startViewTransition(() => {
                              flushSync(() => {
                                  doClose();
                              });
                          });
                      } else {
                          doClose();
                      }
                  }}
                  onViewProfile={handleViewProfile}
                  onLikeToggle={handleLikeToggle}
                  onLoginClick={() => setLoginModalOpen(true)}
                  onImageClick={handleFeedImageClick}
                  savedImages={savedImages}
                  onSaveToggle={handleSaveToggle}
                  onImageUpdate={handleImageUpdate}
                />
            </>
        );
    }

    // HOME (New Infinite Feed)
    return (
        <>
            <SEOHead 
                title="Home - Infinite Feed"
                description="Experience the latest images in a high-fidelity scrollable feed."
                url={window.location.href}
                favicon={DEFAULT_FAVICON}
            />
            <InfiniteFeed 
                images={displayedImages} 
                user={user} 
                onImageClick={handleFeedImageClick} 
                onViewProfile={handleViewProfile} 
                onLikeToggle={handleLikeToggle}
                onLoginClick={() => setLoginModalOpen(true)}
                feedTab={feedTab}
                setFeedTab={setFeedTab}
                onCreateClick={handleCreateClick}
                savedImages={savedImages}
                onSaveToggle={handleSaveToggle}
                onImageDelete={handleImageDelete}
                onImageEdit={(img) => {
                    setSelectedImage(img);
                    setForceEditMode(true);
                }}
                topicFilter={homeTopicFilter}
                onClearTopicFilter={() => setHomeTopicFilter('')}
            />
        </>
    );
  }

  return (
    <div className="flex min-h-screen w-full bg-background text-primary font-sans">
      <div className="hidden md:flex md:w-20 md:flex-shrink-0">
         <Sidebar 
            user={user} 
            onCreateClick={handleCreateClick} 
            onLoginClick={() => setLoginModalOpen(true)}
            activeView={activeView}
            setView={handleSetView}
            onViewProfile={handleViewProfile}
            notifications={notifications}
            onImageClick={handleImageClickFromNotification}
            onOpenLegal={handleOpenLegal}
          />
      </div>

      {/* Added min-w-0 to fix flex child overflow issues on mobile */}
      <main className={`flex-1 min-w-0 ${activeView === 'home' ? 'p-0 pb-16 md:pb-0' : 'p-4 md:p-8 pb-20 md:pb-8'}`}>
        {renderContent()}
      </main>

      {/* Right Sidebar for Trending topics - Twitter/Bluesky style */}
      {['home', 'discover', 'post'].includes(activeView) && (
        <aside className="hidden xl:block w-80 pr-6 pt-6 flex-shrink-0 sticky top-0 h-screen overflow-y-auto hidden-scrollbar self-start">
          <div className="pb-6">
            <TrendingSidebar 
              onTopicClick={(topic) => {
                setHomeTopicFilter(topic);
                setActiveView('home');
                window.scrollTo({ top: 0, behavior: 'smooth' });
                updateURL(null);
              }} 
            />
          </div>
        </aside>
      )}

      <BottomNav
        user={user}
        onCreateClick={handleCreateClick}
        onLoginClick={() => setLoginModalOpen(true)}
        activeView={activeView}
        setView={handleSetView}
        onViewProfile={handleViewProfile}
        notifications={notifications}
        onNotificationsClick={() => handleSetView('notifications')}
      />
      
      {isDraggingOver && <FullScreenDropzone />}

      {isUploadModalOpen && user && (
        <UploadModal
          user={user}
          onClose={() => {
              setUploadModalOpen(false);
              setDroppedFile(null);
          }}
          onUploadSuccess={handleUploadSuccess}
          initialFile={droppedFile}
          allImages={allImages}
        />
      )}

      {isLoginModalOpen && (
        <LoginModal 
            onClose={() => setLoginModalOpen(false)} 
            onOpenLegal={handleOpenLegal}
        />
      )}

      {selectedImage && (
        <>
          <SEOHead 
              title={`${selectedImage.title || 'Post'} by ${selectedImage.uploaderName}`}
              description={selectedImage.description || 'View this post on Glass Gallery'}
              url={window.location.href}
              imageUrl={selectedImage.imageUrl}
              favicon={selectedImage.uploaderPhotoURL || DEFAULT_FAVICON}
              type="article"
              tags={selectedImage.flags}
              location={selectedImage.location}
              license={selectedImage.license}
              authorName={selectedImage.uploaderName}
              author={selectedImage.uploaderUid}
          />
          <ImageDetailModal
            image={selectedImage}
            user={user}
            allImages={allImages}
            onLoginClick={() => setLoginModalOpen(true)}
            initialEditMode={forceEditMode}
            onClose={() => {
              const doClose = () => {
                setSelectedImage(null);
                setForceEditMode(false);
                if (deepLinkUnsubscribeRef.current) {
                    deepLinkUnsubscribeRef.current();
                    deepLinkUnsubscribeRef.current = null;
                }
                if (activeView === 'profile' && profileUser) {
                    updateURL({ user: profileUser.uploaderUid });
                } else if (activeView === 'explore' && exploreSearchTerm) {
                    updateURL({ search: exploreSearchTerm });
                } else if (activeView === 'api') {
                    updateURL({ view: 'api' });
                } else {
                    updateURL(null);
                }
              };
              if (document.startViewTransition) {
                  document.startViewTransition(() => {
                      flushSync(() => {
                          doClose();
                      });
                  });
              } else {
                  doClose();
              }
            }}
            onViewProfile={handleViewProfile}
            onImageUpdate={handleImageUpdate}
            onImageDelete={handleImageDelete}
            onLikeToggle={handleLikeToggle}
            onLocationClick={handleLocationClick}
            onSelectImage={handleImageClick}
          />
        </>
      )}



      {showOnboarding && user && (
        <OnboardingModal
          currentUserUid={user.uid}
          initialName={currentUserProfile?.uploaderName || ''}
          initialPhotoURL={currentUserProfile?.uploaderPhotoURL || ''}
          popularTags={popularTags}
          popularCreators={popularCreators}
          onComplete={handleOnboardingComplete}
          onSkip={handleOnboardingSkip}
        />
      )}

      {/* <MobileAppPromo /> */}
    </div>
  );
};

export default App;
