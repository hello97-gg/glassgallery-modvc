
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
// Fix: Use Firebase v8 compatibility User type.
import type { User } from 'firebase/auth';
import { auth } from './services/firebase';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { PushNotifications } from '@capacitor/push-notifications';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Share } from '@capacitor/share';
import { SendIntent } from '@supernotes/capacitor-send-intent';
import { Filesystem } from '@capacitor/filesystem';
import { subscribeToImages, deleteImageFromFirestore, getNotificationsForUser, toggleImageLike, PAGE_SIZE, subscribeToImage, getImagesByUploader, getImagesFromFirestore, getPersonalizedFeed, recordImageView, getUserProfile, updateUserProfile, markNotificationsAsRead } from './services/firestoreService';
import { getInterestBoost, recordClickInterest, shouldFetchPersonalizedFeed, markPersonalizedFeedFetched } from './services/interestTracker';
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
import LegalPage from './components/LegalPage';
import FollowersPage from './components/FollowersPage';
import NotificationsPage from './components/NotificationsPage';
import FullScreenDropzone from './components/FullScreenDropzone';
import SEOHead, { DEFAULT_FAVICON } from './components/SEOHead';
import OnboardingModal, { generateSvgAvatar, generateUniqueName } from './components/OnboardingModal';

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
        bg-surface/50 rounded-xl mb-4 md:mb-6 break-inside-avoid
        ${heightClass}
      `}
    />
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

  type ImageWithScore = ImageMeta & { sortScore?: number };

  return images
    .map((image: ImageMeta): ImageWithScore => {
      const uploadedAt = image.uploadedAt?.toDate ? image.uploadedAt.toDate().getTime() : now;
      const ageInHours = (now - uploadedAt) / (1000 * 60 * 60);

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

      const likeCount = image.likeCount || 0;
      const downloadCount = image.downloadCount || 0;
      const popularityScore = (likeCount * 15) + (downloadCount * 5); 

      let personalizationBoost = 0;
      if (profile && profile.followedTags && profile.followedTags.length > 0) {
          const imgTags = image.flags || [];
          const overlap = imgTags.filter(t => profile.followedTags?.includes(t));
          personalizationBoost += overlap.length * 1200;
      }

      // Client-side interest boost (search history + click history from localStorage)
      const interestBoost = getInterestBoost(image);

      const randomFactor = Math.random() * 250;

      const finalScore = recencyScore + popularityScore + personalizationBoost + interestBoost + randomFactor;

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

const CURRENT_VERSION_CODE = 6;
const CURRENT_VERSION_NAME = "1.0.5";

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Update System States
  const [updateInfo, setUpdateInfo] = useState<{
    versionCode: number;
    versionName: string;
    apkUrl: string;
    releaseNotes: string;
    forceUpdate: boolean;
  } | null>(null);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);

  const checkForUpdates = useCallback(async () => {
    try {
      const res = await fetch('https://pub-0b9a9d568aa64fe6afb1da05ff60483f.r2.dev/version.json?t=' + Date.now(), {
        cache: 'no-store'
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.versionCode > CURRENT_VERSION_CODE) {
          setUpdateInfo(data);
          setIsUpdateModalOpen(true);
          return true;
        }
      }
    } catch (err) {
      console.error("Failed to check for updates silently:", err);
    }
    return false;
  }, []);
  
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
    try {
      localStorage.removeItem('cached_all_images');
      localStorage.removeItem('cached_displayed_images');
    } catch (e) {}
  }, []);

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
  const [longPressedImage, setLongPressedImage] = useState<ImageMeta | null>(null);
  const [isUploadModalOpen, setUploadModalOpen] = useState(false);
  const [isLoginModalOpen, setLoginModalOpen] = useState(false);

  // Legal Tab State
  const [legalModalTab, setLegalModalTab] = useState<'terms' | 'privacy' | 'guidelines'>('terms');

  const [activeView, setActiveView] = useState<'home' | 'explore' | 'profile' | 'notifications' | 'api' | 'followers_following' | 'legal'>('home');
  const [profileUser, setProfileUser] = useState<ProfileUser | null>(null);
  const [lastView, setLastView] = useState<'home' | 'explore' | 'notifications' | 'profile' | 'api' | 'followers_following' | 'legal'>('home');
  
  // Standalone Follow/Unfollow view variables
  const [followViewType, setFollowViewType] = useState<'followers' | 'following'>('followers');
  const [followViewUid, setFollowViewUid] = useState<string>('');
  const [followViewName, setFollowViewName] = useState<string>('');
  
  // New state for Explore search
  const [exploreSearchTerm, setExploreSearchTerm] = useState('');

  const [notifications, setNotifications] = useState<Notification[]>([]);
  
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [droppedFile, setDroppedFile] = useState<File | null>(null);
  const dragCounter = useRef(0);
  const deepLinkUnsubscribeRef = useRef<(() => void) | null>(null);
  const isLoadingMore = useRef(false);

  const [currentUserProfile, setCurrentUserProfile] = useState<ProfileUser | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);

  const checkShareIntent = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) return;
    try {
      const result = await SendIntent.checkSendIntentReceived();
      console.log('SendIntent received:', result);
      if (result && result.url) {
        const decodedUrl = decodeURIComponent(result.url);
        console.log('Decoded SendIntent URL:', decodedUrl);
        
        const isImage = result.type && result.type.startsWith('image/');
        const hasImgExtension = decodedUrl.match(/\.(jpg|jpeg|png|webp|gif|bmp)$/i);
        
        if (isImage || hasImgExtension) {
          if (!auth.currentUser) {
            localStorage.setItem('pending_share_intent', JSON.stringify({
              url: result.url,
              type: result.type
            }));
            setLoginModalOpen(true);
            return;
          }
          
          window.scrollTo({ top: 0, behavior: 'instant' });
          
          const content = await Filesystem.readFile({
            path: result.url
          });
          
          const mime = result.type || 'image/jpeg';
          const base64Url = `data:${mime};base64,${content.data}`;
          const res = await fetch(base64Url);
          const blob = await res.blob();
          const filename = decodedUrl.split('/').pop() || `shared_${Date.now()}.jpg`;
          const sharedFile = new File([blob], filename, { type: mime });
          
          setDroppedFile(sharedFile);
          setUploadModalOpen(true);
        }
      }
    } catch (err) {
      console.error('Error handling send intent:', err);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      const pending = localStorage.getItem('pending_share_intent');
      if (pending) {
        localStorage.removeItem('pending_share_intent');
        try {
          const parsed = JSON.parse(pending);
          if (parsed && parsed.url) {
            Filesystem.readFile({ path: parsed.url }).then(async (content) => {
              const mime = parsed.type || 'image/jpeg';
              const base64Url = `data:${mime};base64,${content.data}`;
              const res = await fetch(base64Url);
              const blob = await res.blob();
              const filename = parsed.url.split('/').pop() || `shared_${Date.now()}.jpg`;
              const sharedFile = new File([blob], filename, { type: mime });
              
              setDroppedFile(sharedFile);
              setUploadModalOpen(true);
            }).catch(err => {
              console.error("Failed to read pending share intent:", err);
            });
          }
        } catch (e) {
          console.error("Failed to parse pending share intent:", e);
        }
      }
    }
  }, [user]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    
    setTimeout(() => {
      checkShareIntent();
    }, 1000);

    const stateListener = CapApp.addListener('appStateChange', (state) => {
      if (state.isActive) {
        setTimeout(() => {
          checkShareIntent();
        }, 500);
      }
    });

    return () => {
      stateListener.then(l => l.remove());
    };
  }, [checkShareIntent]);

  // Trigger update check on startup
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      checkForUpdates();
    }
  }, [checkForUpdates]);

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
      } else if (viewParam === 'api' || window.location.pathname === '/api') {
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
      
      // Create high-importance push notification channel (Required for Android 8+ headers)
      try {
        await PushNotifications.createChannel({
          id: 'glassgallery_alerts',
          name: 'General Notifications',
          description: 'General updates and notifications',
          importance: 5, // Urgent (Forces heads-up banners on screen)
          visibility: 1, // Public visibility
          sound: 'default',
          vibration: true
        });
        console.log('FCM high-priority notification channel registered.');
      } catch (channelErr) {
        console.error('Failed to register native channel:', channelErr);
      }

      // Also create a local notification channel for foreground re-display
      try {
        await LocalNotifications.createChannel({
          id: 'glassgallery_local',
          name: 'Glass Gallery Alerts',
          description: 'Foreground notification alerts',
          importance: 5,
          visibility: 1,
          sound: 'default',
          vibration: true
        });
      } catch (localChErr) {
        console.error('Failed to create local notification channel:', localChErr);
      }
      
      await PushNotifications.register();
      
      PushNotifications.addListener('registration', (token) => {
        console.log('Push registration success, token:', token.value);
      });
      
      PushNotifications.addListener('registrationError', (err) => {
        console.error('Push registration error:', err);
      });
      
      // When a push notification arrives while the app is in the foreground,
      // Android suppresses the system banner. Re-display it as a local notification
      // so it shows in the notification drawer with sound.
      PushNotifications.addListener('pushNotificationReceived', async (notification) => {
        console.log('Push notification received in foreground:', notification);
        try {
          await LocalNotifications.schedule({
            notifications: [{
              title: notification.title || 'Glass Gallery',
              body: notification.body || 'You have a new notification',
              id: Date.now(),
              channelId: 'glassgallery_local',
              sound: 'default',
              smallIcon: 'ic_notification',
              largeIcon: 'ic_launcher',
              extra: notification.data
            }]
          });
        } catch (localErr) {
          console.error('Failed to schedule local notification:', localErr);
        }
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
        }
    }
  }, [allImages, selectedImage]);

  const loadMoreImages = useCallback(() => {
    if (imagesLoading || allImages.length === 0 || isLoadingMore.current) return;

    if (currentIndex >= allImages.length) {
      isLoadingMore.current = false;
      return;
    }

    isLoadingMore.current = true;

    const nextIndex = currentIndex + PAGE_SIZE;
    const newImages = allImages.slice(currentIndex, nextIndex);
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
  }, [currentIndex, allImages, imagesLoading]);

  useEffect(() => {
    let ticking = false;
    const handleScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        if (activeView === 'home' && !isLoadingMore.current) {
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
    // Record view for server-side taste profile (fire-and-forget)
    if (user) {
      recordImageView(original.id, user.uid);
    }
    // Record click interest for client-side personalization (localStorage)
    recordClickInterest(original);
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
    const fetchFn = user 
      ? getPersonalizedFeed(user.uid).then(({ images }) => images)
      : getImagesFromFirestore().then(({ images }) => images);
    
    fetchFn.then((images) => {
         const sorted = user ? images : smartSortImages(images, currentUserProfile);
         setAllImages(sorted);
         setDisplayedImages(sorted.slice(0, PAGE_SIZE));
         setCurrentIndex(PAGE_SIZE);
         setImagesLoading(false);
    }).catch(err => {
        console.error("Refetch failed", err);
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

  const handleViewProfile = (userToView: ProfileUser) => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    if (activeView !== 'profile') {
        setLastView(activeView);
    }
    setProfileUser(userToView);
    setActiveView('profile');
    setSelectedImage(null);
    updateURL({ user: userToView.uploaderUid });
  };

  const handleBack = () => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    if (activeView === 'followers_following') {
      setActiveView('profile');
      if (profileUser) {
        updateURL({ user: profileUser.uploaderUid });
      }
      return;
    }
    if (activeView === 'legal') {
      setActiveView(lastView);
      if (lastView === 'profile' && profileUser) {
        updateURL({ user: profileUser.uploaderUid });
      } else {
        updateURL(null);
      }
      return;
    }
    if (activeView === 'notifications') {
      setActiveView('home');
      setLastView('home');
      setProfileUser(null);
      updateURL(null);
    } else {
      setActiveView(lastView);
      if (lastView === 'notifications') {
        setLastView('home');
      }
      setProfileUser(null);
      updateURL(null);
    }
  };

  const handleViewFollowList = (uid: string, type: 'followers' | 'following') => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    setLastView(activeView);
    setFollowViewUid(uid);
    setFollowViewType(type);
    setActiveView('followers_following');
  };
  
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
        if (activeView !== view) {
            setLastView(activeView);
        }
        window.scrollTo({ top: 0, behavior: 'instant' });
        setActiveView(view);
        setProfileUser(null);
        setExploreSearchTerm('');
        
        if (view === 'api') {
            updateURL({ view: 'api' });
        } else {
            updateURL(null);
        }
    }
  };

  const handleOpenLegal = (tab: 'terms' | 'privacy' | 'guidelines' = 'terms') => {
      setLegalModalTab(tab);
      setLoginModalOpen(false);
      setActiveView('legal');
  };

  // Safe Native Android hardware back-button listener
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let active = true;
    const registerBackButton = async () => {
      const listener = await CapApp.addListener('backButton', () => {
        if (!active) return;
        if (selectedImage) {
          // If the child detail modal is currently in fullscreen zoom mode, close that first!
          if ((window as any).__glassGalleryFullscreen && (window as any).__glassGalleryCloseFullscreen) {
            (window as any).__glassGalleryCloseFullscreen();
            return;
          }
          setSelectedImage(null);
        } else if (longPressedImage) {
          setLongPressedImage(null);
        } else if (isUploadModalOpen) {
          setUploadModalOpen(false);
        } else if (activeView === 'notifications') {
          handleBack();
        } else if (activeView === 'profile') {
          handleBack();
        } else if (activeView === 'explore') {
          handleSetView('home');
        } else {
          CapApp.exitApp();
        }
      });
      return listener;
    };

    const listenerPromise = registerBackButton();

    return () => {
      active = false;
      listenerPromise.then(listener => {
        if (listener) {
          listener.remove();
        }
      });
    };
  }, [selectedImage, longPressedImage, isUploadModalOpen, activeView]);

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

  const handleMarkNotificationsAsRead = useCallback((notificationIds: string[]) => {
    // Optimistically update notifications state locally for instant UI update
    setNotifications(prev => prev.map(n => 
      notificationIds.includes(n.id) ? { ...n, read: true } : n
    ));
    // Write changes silently to Firestore in background
    markNotificationsAsRead(notificationIds).catch(err => {
      console.error("Firestore mark read failed:", err);
    });
  }, []);

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
    
    if (activeView === 'followers_following') {
        return (
            <FollowersPage 
                uid={followViewUid}
                type={followViewType}
                loggedInUser={user}
                onBack={handleBack}
                onUserClick={handleViewProfile}
            />
        );
    }

    if (activeView === 'legal') {
        return (
            <LegalPage 
                initialTab={legalModalTab}
                onBack={handleBack}
            />
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
                    allImages={allImages}
                    onLongPress={setLongPressedImage}
                    onViewFollowList={handleViewFollowList}
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
                    onLongPress={setLongPressedImage}
                />
            </>
        );
    }

    if (activeView === 'notifications') {
        return (
            <>
                <SEOHead 
                    title="Inbox"
                    description="Keep track of your Glass Gallery activity."
                    url={window.location.href}
                />
                <NotificationsPage 
                    notifications={notifications}
                    onImageClick={handleImageClickFromNotification}
                    onViewProfile={handleViewProfile}
                    onMarkAsRead={handleMarkNotificationsAsRead}
                    onBack={handleBack}
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
            <ImageGrid images={displayedImages} user={user} onImageClick={handleImageClick} onViewProfile={handleViewProfile} onLikeToggle={handleLikeToggle} onLongPress={setLongPressedImage} />
        </>
    );
  }

  return (
    <div className="flex min-h-screen w-full bg-background text-primary font-sans">
      {/* Premium Minimalist Mobile Header - Only visible on Home feed */}
      {activeView === 'home' && !profileUser && (
        <header className="fixed top-0 left-0 right-0 z-40 h-16 bg-[#0a0a0a]/95 border-b border-white/5 flex items-center justify-between px-5 backdrop-blur-md md:hidden select-none">
          {/* Left Side: Logo & App Name */}
          <div className="flex items-center gap-2" onClick={() => handleSetView('home')}>
            <div className="w-8 h-8 bg-gradient-to-tr from-red-600 to-amber-500 rounded-xl flex items-center justify-center shadow-lg shadow-red-500/10">
              <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M19 10V19C19 20.1 18.1 21 17 21H7C5.9 21 5 20.1 5 19V10"/>
                <path d="M12 2L2 9L12 16L22 9L12 2Z" fill="currentColor"/>
              </svg>
            </div>
            <span className="text-white font-bold tracking-tight text-lg">Glass Gallery</span>
          </div>

          {/* Right Side: [+] Upload & Bell Notifications with Premium Glassmorphism & Correct SVG Sizes */}
          <div className="flex items-center gap-3">
            {/* [+] Upload Button */}
            <button 
              onClick={() => {
                if (user) {
                  setUploadModalOpen(true);
                } else {
                  setLoginModalOpen(true);
                }
              }}
              className="p-2 bg-white/10 hover:bg-white/20 border border-white/10 text-white rounded-full transition-all duration-150 active:scale-90 flex items-center justify-center"
              title="Upload Glass Art"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </button>

            {/* Bell Notifications */}
            <button 
              onClick={() => {
                if (user) {
                  handleSetView('notifications');
                } else {
                  setLoginModalOpen(true);
                }
              }}
              className="p-2 bg-white/10 hover:bg-white/20 border border-white/10 text-white rounded-full transition-all duration-150 active:scale-90 flex items-center justify-center relative"
              title="Notifications"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              {notifications.filter(n => !n.read).length > 0 && (
                <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-600 rounded-full border border-[#0a0a0a]" />
              )}
            </button>
          </div>
        </header>
      )}

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

      {/* Dynamic main wrapper padding: pt-20 on Home feed to accommodate header, pt-4 on Explore/Profile as top headers are removed */}
      <main className={`flex-1 min-w-0 p-4 md:p-8 ${activeView === 'home' && !profileUser ? 'pt-20' : 'pt-4'} md:pt-8 pb-20 md:pb-8`}>
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
        onNotificationsClick={() => {
          if (user) {
            handleSetView('notifications');
          } else {
            setLoginModalOpen(true);
          }
        }}
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

      {/* Premium Glassmorphic Update Modal */}
      {isUpdateModalOpen && updateInfo && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md transition-all duration-300">
          <div className="relative w-full max-w-md p-6 rounded-3xl bg-neutral-950/80 border border-white/10 backdrop-blur-xl shadow-2xl flex flex-col gap-6 overflow-hidden transition-all duration-200">
            {/* Ambient glowing background circles */}
            <div className="absolute -top-24 -left-24 w-48 h-48 bg-red-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-rose-500/10 rounded-full blur-3xl pointer-events-none" />

            <div className="flex flex-col items-center text-center gap-3 relative z-10">
              {/* Premium Update Icon */}
              <div className="p-4 bg-red-500/10 text-red-500 rounded-2xl border border-red-500/20">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-8 h-8 animate-bounce">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-white tracking-wide">Update Available!</h2>
              <p className="text-neutral-400 text-sm">
                A new version of Glass Gallery is ready to download.
              </p>
            </div>

            {/* Version comparative pill */}
            <div className="flex items-center justify-around p-3 rounded-2xl bg-neutral-900/50 border border-white/5 text-sm font-semibold relative z-10">
              <div className="flex flex-col items-center">
                <span className="text-xs text-neutral-500 font-normal">Current</span>
                <span className="text-neutral-300">v{CURRENT_VERSION_NAME}</span>
              </div>
              <div className="h-8 w-px bg-white/10" />
              <div className="flex flex-col items-center">
                <span className="text-xs text-neutral-500 font-normal">Latest</span>
                <span className="text-red-400 font-bold">v{updateInfo.versionName}</span>
              </div>
            </div>

            {/* Release Notes */}
            <div className="flex flex-col gap-2 relative z-10 max-h-48 overflow-y-auto pr-1">
              <span className="text-xs text-neutral-400 font-bold uppercase tracking-wider">What's New:</span>
              <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/5 text-sm text-neutral-300 leading-relaxed font-medium">
                {updateInfo.releaseNotes}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col gap-3 relative z-10 w-full">
              <button
                onClick={() => {
                  window.open(updateInfo.apkUrl, '_system');
                  if (!updateInfo.forceUpdate) {
                    setIsUpdateModalOpen(false);
                  }
                }}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white font-bold tracking-wide shadow-lg shadow-red-500/20 active:scale-95 transition-all duration-150 border border-red-400/20"
              >
                Download & Auto Update
              </button>

              {!updateInfo.forceUpdate && (
                <button
                  onClick={() => setIsUpdateModalOpen(false)}
                  className="w-full py-3 rounded-2xl bg-neutral-900/60 hover:bg-neutral-900 text-neutral-400 hover:text-white text-sm font-semibold active:scale-95 transition-all duration-150 border border-white/5"
                >
                  Later
                </button>
              )}
            </div>
          </div>
        </div>
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

      {longPressedImage && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => setLongPressedImage(null)}>
          <div 
            className="w-full max-w-md bg-[#161616] rounded-t-[32px] p-6 pb-8 border-t border-white/10 shadow-2xl flex flex-col items-center justify-start transition-transform duration-300 animate-slide-up select-none"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Handle/Indicator */}
            <div className="w-12 h-1.5 bg-neutral-700 rounded-full mb-6" />

            {/* Thumbnail Preview */}
            <div className="flex items-center gap-4 w-full mb-6 pb-4 border-b border-white/5">
              <img 
                src={longPressedImage.imageUrl} 
                alt={longPressedImage.title || "Share preview"} 
                className="w-16 h-16 rounded-2xl object-cover border border-white/10 shadow-md"
              />
              <div className="flex-1 min-w-0">
                <h3 className="text-white font-bold truncate text-lg">{longPressedImage.title || "Glass Art Masterpiece"}</h3>
                <p className="text-neutral-400 text-xs truncate">by {longPressedImage.uploaderName}</p>
              </div>
            </div>

            {/* Actions list */}
            <div className="flex flex-col gap-3 w-full">
              {/* Send to WhatsApp */}
              <button 
                onClick={() => {
                  const shareUrl = `https://gg.modvc.org/image/${longPressedImage.id}`;
                  const text = encodeURIComponent(`Check out this beautiful glass art "${longPressedImage.title || 'Masterpiece'}" on Glass Gallery:\n${shareUrl}`);
                  window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
                  setLongPressedImage(null);
                }}
                className="flex items-center justify-between w-full p-4 rounded-2xl bg-neutral-900/60 hover:bg-neutral-800 text-white font-semibold transition-all duration-150 active:scale-95 border border-white/5"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-full">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" className="bi bi-whatsapp" viewBox="0 0 16 16">
                      <path d="M13.601 2.326A7.85 7.85 0 0 0 8 0a7.85 7.85 0 0 0-7.852 7.852c0 1.51.394 2.977 1.147 4.298L.15 15.65a.5.5 0 0 0 .686.686l3.705-1.22c1.272.705 2.703 1.077 4.159 1.077a7.85 7.85 0 0 0 7.853-7.852 7.85 7.85 0 0 0-2.302-5.554M8 14.18c-1.39 0-2.754-.372-3.948-1.079L3.782 13l-2.224.733.743-2.261-.29-.463C1.228 10.013 1 8.861 1 7.7 1 3.997 4.002 1 8 1c3.997 0 7 2.997 7 6.7 0 3.7-3.003 6.48-7 6.48m3.608-4.747c-.202-.102-1.198-.592-1.385-.66-.188-.068-.324-.101-.46.102-.136.204-.527.66-.646.793-.12.134-.238.15-.44.048-.202-.102-.852-.315-1.623-.999-.6-.535-1.005-1.198-1.122-1.4-.117-.202-.012-.311.089-.412.09-.09.202-.238.303-.356.101-.118.136-.202.202-.338.067-.136.033-.255-.017-.357-.05-.102-.46-1.107-.63-1.513-.167-.399-.333-.344-.46-.344H6.2a.5.5 0 0 0-.412.223c-.167.188-.637.62-.637 1.513s.65 1.754.743 1.879c.093.125 1.285 1.961 3.112 2.752.434.188.773.3 1.036.384.436.139.833.12 1.147.073.35-.053 1.199-.49 1.37-.963.171-.473.171-.879.12-1.017-.05-.136-.18-.202-.383-.304"/>
                    </svg>
                  </div>
                  <span>Send to WhatsApp</span>
                </div>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-neutral-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </svg>
              </button>

              {/* Native System Share */}
              <button 
                onClick={async () => {
                  const shareUrl = `https://gg.modvc.org/image/${longPressedImage.id}`;
                  if (Capacitor.isNativePlatform()) {
                    try {
                      await Share.share({
                        title: longPressedImage.title || 'Glass Art',
                        text: `Check out "${longPressedImage.title || 'Masterpiece'}" on Glass Gallery!`,
                        url: shareUrl,
                        dialogTitle: 'Share Artwork'
                      });
                    } catch (err) {
                      console.log('Capacitor share failed or was cancelled', err);
                    }
                  } else if (navigator.share) {
                    try {
                      await navigator.share({
                        title: longPressedImage.title || 'Glass Art',
                        text: `Check out "${longPressedImage.title || 'Masterpiece'}" on Glass Gallery!`,
                        url: shareUrl,
                      });
                    } catch (err) {
                      console.log('Native share cancelled', err);
                    }
                  } else {
                    navigator.clipboard.writeText(shareUrl);
                    alert('Link copied to clipboard!');
                  }
                  setLongPressedImage(null);
                }}
                className="flex items-center justify-between w-full p-4 rounded-2xl bg-neutral-900/60 hover:bg-neutral-800 text-white font-semibold transition-all duration-150 active:scale-95 border border-white/5"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-sky-500/20 text-sky-400 rounded-full">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186l.908-.454a3.5 3.5 0 110-3.697l-.908-.454m0 4.605a2.25 2.25 0 110-2.186m0 2.186l3.574 1.787m-3.574-3.973l3.574-1.787m.022 12.09a2.25 2.25 0 100-4.5 2.25 2.25 0 000 4.5z" />
                    </svg>
                  </div>
                  <span>System Share</span>
                </div>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-neutral-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </svg>
              </button>

              {/* Copy Share Link */}
              <button 
                onClick={() => {
                  const shareUrl = `https://gg.modvc.org/image/${longPressedImage.id}`;
                  navigator.clipboard.writeText(shareUrl);
                  setLongPressedImage(null);
                }}
                className="flex items-center justify-between w-full p-4 rounded-2xl bg-neutral-900/60 hover:bg-neutral-800 text-white font-semibold transition-all duration-150 active:scale-95 border border-white/5"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-500/20 text-purple-400 rounded-full">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                    </svg>
                  </div>
                  <span>Copy Link</span>
                </div>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-neutral-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </svg>
              </button>

              {/* Close Button */}
              <button 
                onClick={() => setLongPressedImage(null)}
                className="w-full mt-4 py-4 rounded-2xl bg-neutral-800/80 hover:bg-neutral-800 text-neutral-300 font-bold transition-all duration-150 active:scale-95"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
