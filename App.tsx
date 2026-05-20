
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
// Fix: Use Firebase v8 compatibility User type.
import type { User } from 'firebase/auth';
import { auth } from './services/firebase';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { subscribeToImages, deleteImageFromFirestore, getNotificationsForUser, toggleImageLike, PAGE_SIZE, subscribeToImage, getImagesByUploader, getImagesFromFirestore, getUserProfile, updateUserProfile } from './services/firestoreService';
import type { ImageMeta, ProfileUser, Notification } from './types';

import Sidebar from './components/Header';
import BottomNav from './components/BottomNav';
import LoginModal from './components/LoginScreen';
import ImageGrid from './components/ImageGrid';
import UploadModal from './components/UploadModal';
import ImageDetailModal from './components/ImageDetailModal';
import ExplorePage from './components/ExplorePage';
import ProfilePage from './components/ProfilePage';
import ApiDocsPage from './components/ApiDocsPage';
import LegalModal from './components/LegalModal';
import { MobileNotificationsModal } from './components/Notifications';
import FullScreenDropzone from './components/FullScreenDropzone';
import SEOHead, { DEFAULT_FAVICON } from './components/SEOHead';
import OnboardingModal, { generateSvgAvatar, generateUniqueName } from './components/OnboardingModal';
import MobileAppPromo from './components/MobileAppPromo';

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

const SkeletonCard: React.FC = () => {
  const heightClass = SKELETON_HEIGHTS[Math.floor(Math.random() * SKELETON_HEIGHTS.length)];
  
  return (
    <div 
      className={`
        bg-surface rounded-xl overflow-hidden mb-4 md:mb-6 break-inside-avoid
        ${heightClass}
        relative
      `}
    >
      <div className="absolute inset-0 bg-gradient-to-r from-surface via-border to-surface bg-[length:200%_100%] animate-shimmer" />
    </div>
  );
};

const SkeletonGrid: React.FC = () => {
  return (
    <div className="columns-2 sm:columns-2 md:columns-3 lg:columns-4 xl:columns-5 gap-2 md:gap-4 animate-fade-in">
      {Array.from({ length: 15 }).map((_, index) => (
        <SkeletonCard key={index} />
      ))}
    </div>
  );
};

// Smart "Addictive" sorting algorithm
const smartSortImages = (images: ImageMeta[], profile?: ProfileUser | null): ImageMeta[] => {
  const now = Date.now();

  // Extend ImageMeta with a temporary sortScore for sorting
  type ImageWithScore = ImageMeta & { sortScore?: number };

  return images
    .map((image: ImageMeta): ImageWithScore => {
      const uploadedAt = image.uploadedAt?.toDate ? image.uploadedAt.toDate().getTime() : now;
      const ageInHours = (now - uploadedAt) / (1000 * 60 * 60);

      // 1. Recency Score (Aggressive Exponential Decay)
      let recencyScore = 0;
      if (ageInHours < 0.5) {
          recencyScore = 3000; 
      } else if (ageInHours < 4) {
          recencyScore = 1500; 
      } else if (ageInHours < 24) {
          recencyScore = 800;  
      } else if (ageInHours < 72) {
          recencyScore = 300;  
      } else {
          recencyScore = 100 / (Math.max(1, ageInHours / 24)); 
      }

      // 2. Popularity/Dopamine Score
      const likeCount = image.likeCount || 0;
      const downloadCount = image.downloadCount || 0;
      const popularityScore = (likeCount * 15) + (downloadCount * 5); 

      // 3. Personalized Smart AI & Taste Profile Affinity Boost
      let personalizationBoost = 0;
      if (profile && profile.followedTags && profile.followedTags.length > 0) {
          const imgTags = image.flags || [];
          const overlap = imgTags.filter(t => profile.followedTags?.includes(t));
          personalizationBoost += overlap.length * 1200; // Boost score by +1,200 per matching interest tag!
      }

      // 4. Variable Reward (Randomness)
      const randomFactor = Math.random() * 250;

      const finalScore = recencyScore + popularityScore + personalizationBoost + randomFactor;

      return { ...image, sortScore: finalScore };
    })
    .sort((a, b) => (b.sortScore ?? 0) - (a.sortScore ?? 0)) 
    .map(({ sortScore, ...rest }) => rest); 
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
  
  // Offline LocalStorage Cache Initialization (like Instagram)
  const [allImages, setAllImages] = useState<ImageMeta[]>(() => {
    try {
      const cached = localStorage.getItem('cached_all_images');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });
  const [displayedImages, setDisplayedImages] = useState<ImageMeta[]>(() => {
    try {
      const cached = localStorage.getItem('cached_displayed_images');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });
  const [imagesLoading, setImagesLoading] = useState(() => {
    try {
      const cached = localStorage.getItem('cached_displayed_images');
      return cached ? false : true;
    } catch {
      return true;
    }
  });
  const [currentIndex, setCurrentIndex] = useState(() => {
    try {
      const cached = localStorage.getItem('cached_displayed_images');
      return cached ? JSON.parse(cached).length : 0;
    } catch {
      return 0;
    }
  });

  // Track network status online/offline for instant background auto-refreshes
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Caching Synchronizers to update LocalStorage dynamically when states modify
  useEffect(() => {
    if (allImages.length > 0) {
      try {
        localStorage.setItem('cached_all_images', JSON.stringify(allImages));
      } catch (err) {
        console.error("Failed to write to offline all-images cache:", err);
      }
    }
  }, [allImages]);

  useEffect(() => {
    if (displayedImages.length > 0) {
      try {
        localStorage.setItem('cached_displayed_images', JSON.stringify(displayedImages));
      } catch (err) {
        console.error("Failed to write to offline displayed-images cache:", err);
      }
    }
  }, [displayedImages]);

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
  const [isUploadModalOpen, setUploadModalOpen] = useState(false);
  const [isLoginModalOpen, setLoginModalOpen] = useState(false);
  const [isNotificationsPanelOpen, setNotificationsPanelOpen] = useState(false);
  
  // Legal Modal State
  const [isLegalModalOpen, setLegalModalOpen] = useState(false);
  const [legalModalTab, setLegalModalTab] = useState<'terms' | 'privacy' | 'guidelines'>('terms');

  const [activeView, setActiveView] = useState<'home' | 'explore' | 'profile' | 'notifications' | 'api'>('home');
  const [profileUser, setProfileUser] = useState<ProfileUser | null>(null);
  const [lastView, setLastView] = useState<'home' | 'explore' | 'api'>('home');
  
  // New state for Explore search
  const [exploreSearchTerm, setExploreSearchTerm] = useState('');

  const [notifications, setNotifications] = useState<Notification[]>([]);
  
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

  // --- DEEP LINKING & ROUTING HANDLER ---
  useEffect(() => {
    const handleRouting = () => {
      const params = new URLSearchParams(window.location.search);
      const pathMatch = window.location.pathname.match(/^\/image\/([a-zA-Z0-9_-]+)/);
      const imageId = params.get('image') || (pathMatch ? pathMatch[1] : null);
      const userId = params.get('user');
      const searchTerm = params.get('search');
      const viewParam = params.get('view');

      if (imageId) {
        if (deepLinkUnsubscribeRef.current) {
          deepLinkUnsubscribeRef.current();
          deepLinkUnsubscribeRef.current = null;
        }
        const unsubscribe = subscribeToImage(imageId, (img) => {
          if (img) {
            setSelectedImage(img);
          }
        });
        deepLinkUnsubscribeRef.current = unsubscribe;
      } else {
        setSelectedImage(null);
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

  const updateURL = (params: { image?: string; user?: string; search?: string; view?: string } | null) => {
    const url = new URL(window.location.href);
    url.search = ''; 
    
    if (params?.image) {
      url.pathname = `/image/${params.image}`;
    } else {
      url.pathname = '/';
    }
    
    if (params?.user) url.searchParams.set('user', params.user);
    if (params?.search) url.searchParams.set('search', params.search);
    if (params?.view) url.searchParams.set('view', params.view);
    
    window.history.pushState({}, '', url.toString());
  };

  // --- Image Data Fetching Strategy ---
  // We use a hybrid approach:
  // 1. Fetch once with .get() to ensure crawlers/bots get data immediately without waiting for websocket.
  // 2. Set up .onSnapshot() for real-time updates for connected users.
  useEffect(() => {
    let unsubscribe: () => void;

    if (activeView === 'home' || activeView === 'explore') {
        if (allImages.length === 0) {
            setImagesLoading(true);
        }
        
        // Real-time listener
        unsubscribe = subscribeToImages((fetchedImages) => {
            setAllImages((prevImages) => {
                 // If this is the very first load, handle it cleanly
                  if (prevImages.length === 0) {
                      const sorted = smartSortImages(fetchedImages, currentUserProfile);
                      setDisplayedImages(sorted.slice(0, PAGE_SIZE));
                      setCurrentIndex(PAGE_SIZE);
                      setImagesLoading(false);
                      return sorted;
                  }
                 
                 // Merge updates logic - use base IDs (strip _loop_ suffixes) for matching
                 const newMap = new Map(fetchedImages.map(i => [i.id, i]));
                 const currentBaseIds = new Set(prevImages.map(i => i.id.split('_loop_')[0]));
                 const newUploads = fetchedImages.filter(i => !currentBaseIds.has(i.id));

                 let updatedList = prevImages
                    .filter(img => newMap.has(img.id.split('_loop_')[0]))
                    .map(img => {
                        const baseId = img.id.split('_loop_')[0];
                        const freshData = newMap.get(baseId);
                        return freshData ? { ...freshData, id: img.id } : img;
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

                 // Update display list quietly - preserve loop-suffixed IDs
                 setDisplayedImages(prevDisplayed => {
                    let updatedDisplayed = prevDisplayed
                        .filter(d => newMap.has(d.id.split('_loop_')[0]))
                        .map(d => {
                            const baseId = d.id.split('_loop_')[0];
                            const freshData = newMap.get(baseId);
                            return freshData ? { ...freshData, id: d.id } : d;
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
  }, [activeView, currentUserProfile, isOnline]);

  // Sync selectedImage
  useEffect(() => {
    if (selectedImage && allImages.length > 0) {
        const baseId = selectedImage.id.split('_loop_')[0];
        const updated = allImages.find(img => img.id.split('_loop_')[0] === baseId);
        if (updated && updated !== selectedImage) {
            setSelectedImage(updated);
        } else if (!updated) {
             setSelectedImage(null);
        }
    }
  }, [allImages, selectedImage]);

  const loadMoreImages = useCallback(() => {
    if (imagesLoading || allImages.length === 0 || isLoadingMore.current) return;

    isLoadingMore.current = true;

    let newImages: ImageMeta[] = [];

    if (currentIndex < allImages.length) {
        const nextIndex = currentIndex + PAGE_SIZE;
        newImages = allImages.slice(currentIndex, nextIndex);
        setCurrentIndex(nextIndex);
    } else {
        // Infinite scroll loop back to start! Reshuffle using our dynamic smart addictive sort!
        const reshuffled = smartSortImages(allImages, currentUserProfile);
        newImages = reshuffled.slice(0, PAGE_SIZE);
        setCurrentIndex(PAGE_SIZE);
    }

    if (newImages.length > 0) {
        // Dynamic unique loop suffix keys to prevent any DOM/React duplicate key collisions
        const uniqueTime = Date.now();
        const processed = newImages.map((img, idx) => ({
            ...img,
            id: `${img.id}_loop_${uniqueTime}_${idx}`
        }));
        setDisplayedImages(prev => [...prev, ...processed]);
    }

    // Reset guard immediately - React batches state updates so DOM won't actually
    // re-render until next frame, preventing double-fires naturally
    requestAnimationFrame(() => { isLoadingMore.current = false; });
  }, [currentIndex, allImages, imagesLoading, currentUserProfile]);

  useEffect(() => {
    let ticking = false;
    const handleScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        if (activeView === 'home' && !isLoadingMore.current) {
            // Aggressive preload: start loading 1500px BEFORE bottom so content
            // is already rendered by the time the user scrolls there
            const scrollThreshold = 1500;
            const isNearBottom = window.innerHeight + document.documentElement.scrollTop >= document.documentElement.offsetHeight - scrollThreshold;
            
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

  // --- Full-screen drag-and-drop ---
  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (user && !isUploadModalOpen && !isLoginModalOpen && !selectedImage && e.dataTransfer?.items && e.dataTransfer.items.length > 0) {
        const containsFile = Array.from(e.dataTransfer.items).some(item => item.kind === 'file' && item.type.startsWith('image/'));
        if (containsFile) {
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
            if (file && file.type.startsWith('image/')) {
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
    const baseId = image.id.split('_loop_')[0];
    const original = allImages.find(img => img.id.split('_loop_')[0] === baseId) || image;
    setSelectedImage(original);
    updateURL({ image: original.id });
  };
  
  const handleImageClickFromNotification = (partialImage: Partial<ImageMeta>) => {
    const fullImage = allImages.find(i => i.id === partialImage.id);
    if (fullImage) {
        setSelectedImage(fullImage);
        updateURL({ image: fullImage.id });
    } else if (partialImage.id) {
        updateURL({ image: partialImage.id });
    }
  };
  
  const handleLocationClick = (location: string) => {
      setExploreSearchTerm(location);
      setActiveView('explore');
      updateURL({ search: location });
      setSelectedImage(null);
  }

  const refetchImages = () => {
    setImagesLoading(true);
    getImagesFromFirestore().then(({ images }) => {
         const sorted = smartSortImages(images, currentUserProfile);
         setAllImages(sorted);
         setDisplayedImages(sorted.slice(0, PAGE_SIZE));
         setCurrentIndex(PAGE_SIZE);
         setImagesLoading(false);
    }).catch(err => {
        console.error("Refetch failed", err);
        setImagesLoading(false);
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
    saveScrollPosition();
    if (activeView !== 'profile') {
        setLastView(activeView as 'home' | 'explore' | 'api');
    }
    setProfileUser(userToView);
    setActiveView('profile');
    setSelectedImage(null);
    updateURL({ user: userToView.uploaderUid });
  };

  const handleBack = () => {
    saveScrollPosition();
    setActiveView(lastView);
    setProfileUser(null);
    updateURL(null);
  }
  
  const handleSetView = (view: 'home' | 'explore' | 'notifications' | 'api') => {
    if (view === activeView && (view === 'home' || view === 'explore')) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        setAllImages(prevImages => {
             const reshuffled = smartSortImages(prevImages, currentUserProfile);
             setDisplayedImages(reshuffled.slice(0, PAGE_SIZE));
             setCurrentIndex(PAGE_SIZE);
             return reshuffled;
        });
        if (view === 'explore') {
            setExploreSearchTerm('');
            updateURL(null);
        }
    } else {
        saveScrollPosition();
        setActiveView(view);
        setProfileUser(null);
        setExploreSearchTerm('');
        
        if (view === 'api') {
            updateURL({ view: 'api' });
        } else {
            updateURL(null);
        }
    }
  }

  const handleOpenLegal = (tab: 'terms' | 'privacy' | 'guidelines' = 'terms') => {
      setLegalModalTab(tab);
      setLegalModalOpen(true);
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

    // Fix for SEO: Do NOT block on authLoading. Only block if images are strictly loading and empty.
    // If auth is loading, we just render as if 'guest'.
    if (imagesLoading && displayedImages.length === 0 && activeView !== 'profile') {
       return <SkeletonGrid />;
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
                />
            </>
        );
    }

    // HOME
    return (
        <>
            <SEOHead 
                title="Home"
                description="A modern image sharing platform. Discover and share beautiful images."
                url={window.location.href}
                favicon={DEFAULT_FAVICON}
            />
            <ImageGrid images={displayedImages} user={user} onImageClick={handleImageClick} onViewProfile={handleViewProfile} onLikeToggle={handleLikeToggle} />
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
      <main className="flex-1 min-w-0 p-4 md:p-8 pb-20 md:pb-8">
        {renderContent()}
      </main>

      <BottomNav
        user={user}
        onCreateClick={handleCreateClick}
        onLoginClick={() => setLoginModalOpen(true)}
        activeView={activeView}
        setView={handleSetView}
        onViewProfile={handleViewProfile}
        notifications={notifications}
        onNotificationsClick={() => setNotificationsPanelOpen(true)}
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
      
      {isLegalModalOpen && (
        <LegalModal
            onClose={() => setLegalModalOpen(false)}
            initialTab={legalModalTab}
        />
      )}
      
      {isNotificationsPanelOpen && user && (
        <MobileNotificationsModal
            notifications={notifications}
            onClose={() => setNotificationsPanelOpen(false)}
            onImageClick={(image) => {
                setNotificationsPanelOpen(false);
                handleImageClickFromNotification(image);
            }}
            onViewProfile={handleViewProfile}
        />
      )}

      {selectedImage && (
        <ImageDetailModal
          image={selectedImage}
          user={user}
          allImages={allImages}
          onClose={() => {
            setSelectedImage(null);
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
          }}
          onViewProfile={handleViewProfile}
          onImageUpdate={handleImageUpdate}
          onImageDelete={handleImageDelete}
          onLikeToggle={handleLikeToggle}
          onLocationClick={handleLocationClick}
          onSelectImage={handleImageClick}
        />
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

      <MobileAppPromo />
    </div>
  );
};

export default App;
