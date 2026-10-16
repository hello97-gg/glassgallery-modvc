
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { User } from 'firebase/auth';
import type { ProfileUser, ImageMeta, Comment } from '../types';
import { getImagesByUploader, PAGE_SIZE, getUserProfile, getFollowStats, toggleFollowUser, getImagesFromFirestore, updateUserProfile, getUserComments } from '../services/firestoreService';
import ImageGrid from './ImageGrid';
import Spinner from './Spinner';
import Button from './Button';
import EditProfileModal from './EditProfileModal';
import FollowersModal from './FollowersModal';
import CreatorDashboard from './CreatorDashboard';
import CrawlableContent from './CrawlableContent';

// Throttle utility
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

const VerifiedBadge: React.FC<{ className?: string; onClick?: (e: React.MouseEvent) => void }> = ({ className = "h-4 w-4", onClick }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    className={`${className} text-blue-500 filter drop-shadow-[0_0_8px_rgba(59,130,246,0.6)] cursor-pointer hover:scale-110 active:scale-95 transition-all select-none animate-pulse`}
    viewBox="0 0 24 24" 
    fill="currentColor"
    onClick={onClick}
  >
    <path fillRule="evenodd" d="M8.603 3.799A4.49 4.49 0 0112 2.25c1.357 0 2.573.6 3.397 1.549a4.49 4.49 0 013.498 1.307 4.491 4.491 0 011.307 3.497A4.49 4.49 0 0121.75 12a4.49 4.49 0 01-1.549 3.397 4.491 4.491 0 01-1.307 3.497 4.491 4.491 0 01-3.497 1.307A4.49 4.49 0 0112 21.75a4.49 4.49 0 01-3.397-1.549 4.49 4.49 0 01-3.498-1.306 4.491 4.491 0 01-1.307-3.498A4.49 4.49 0 012.25 12c0-1.357.6-2.573 1.549-3.397a4.49 4.49 0 011.307-3.497a4.49 4.49 0 013.497-1.307zm7.007 6.387a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" />
  </svg>
);

const formatCommentDate = (dateString?: string) => {
  if (!dateString) return 'Recently';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return 'Recently';
  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`;
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
  });
};

interface ProfilePageProps {
  user: ProfileUser;
  loggedInUser: User | null;
  onBack: () => void;
  onImageClick: (image: ImageMeta, commentId?: string) => void;
  onViewProfile: (user: ProfileUser) => void;
  onLikeToggle: (image: ImageMeta) => void;
  onLocationClick?: (location: string) => void;
}

const ProfilePage: React.FC<ProfilePageProps> = ({ user, loggedInUser, onBack, onImageClick, onViewProfile, onLikeToggle, onLocationClick }) => {
  const [profileData, setProfileData] = useState<ProfileUser>(user);
  
  // Tab Management
  const [activeTab, setActiveTab] = useState<'created' | 'saved' | 'replies' | 'dashboard'>('created');

  // Created/Uploads Gallery State (preloads from SSR if available for instant Googlebot render)
  const preloadedImages = useMemo<ImageMeta[]>(() => {
    if (typeof window !== 'undefined' && (window as any).__PRELOADED_CREATOR_IMAGES__) {
      const p = (window as any).__PRELOADED_CREATOR_IMAGES__;
      if (Array.isArray(p) && p.length > 0) return p;
    }
    return [];
  }, []);

  const [allImages, setAllImages] = useState<ImageMeta[]>(preloadedImages);
  const [displayedImages, setDisplayedImages] = useState<ImageMeta[]>(preloadedImages.slice(0, PAGE_SIZE));
  const [isLoading, setIsLoading] = useState(preloadedImages.length === 0);
  const [currentIndex, setCurrentIndex] = useState(preloadedImages.length > 0 ? PAGE_SIZE : 0);

  // Saved/Likes Gallery State
  const [likedImages, setLikedImages] = useState<ImageMeta[]>([]);
  const [displayedLikedImages, setDisplayedLikedImages] = useState<ImageMeta[]>([]);
  const [likedCurrentIndex, setLikedCurrentIndex] = useState(0);
  const [isLoadingLikes, setIsLoadingLikes] = useState(false);

  // Modals & Controls State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [isFollowingUser, setIsFollowingUser] = useState(false);
  const [followersModalType, setFollowersModalType] = useState<'followers' | 'following'>('followers');
  const [isFollowPending, setIsFollowPending] = useState(false);
  const [isFollowersModalOpen, setIsFollowersModalOpen] = useState(false);
  const [showVerifiedModal, setShowVerifiedModal] = useState(false);

  // Secure check: ensure we only show edit controls if logged in user matches the currently displayed profile data
  const isOwner = loggedInUser?.uid === profileData.uploaderUid;

  // Replies Gallery State
  const [userReplies, setUserReplies] = useState<Comment[]>([]);
  const [isLoadingReplies, setIsLoadingReplies] = useState(false);
  const [hasLoadedReplies, setHasLoadedReplies] = useState(false);

  // Synchronize hide replies preference with database profile + local fallback
  const isRepliesHidden = useMemo(() => {
    if (typeof profileData.hideReplies === 'boolean') {
      return profileData.hideReplies;
    }
    try {
      return localStorage.getItem(`gg_hide_replies_${user.uploaderUid}`) === 'true';
    } catch {
      return false;
    }
  }, [profileData.hideReplies, user.uploaderUid]);

  const handleToggleRepliesVisibility = async () => {
    const next = !isRepliesHidden;
    setProfileData(prev => ({ ...prev, hideReplies: next }));
    try {
      localStorage.setItem(`gg_hide_replies_${user.uploaderUid}`, next ? 'true' : 'false');
    } catch {}
    try {
      await updateUserProfile(profileData.uploaderUid, { hideReplies: next });
    } catch (err) {
      console.error("Failed to save hideReplies preference to database:", err);
    }
  };

  // Stats memoized selectors
  const totalLikes = useMemo(() => allImages.reduce((sum, img) => sum + (img.likeCount || 0), 0), [allImages]);
  const totalDownloads = useMemo(() => allImages.reduce((sum, img) => sum + (img.downloadCount || 0), 0), [allImages]);

  // Fetch Follow Stats (Uses stable user.uploaderUid to prevent any state evaluation loops!)
  const fetchFollowStats = useCallback(async () => {
    if (!user.uploaderUid) return;
    try {
      const stats = await getFollowStats(user.uploaderUid, loggedInUser?.uid);
      setFollowersCount(stats.followersCount);
      setFollowingCount(stats.followingCount);
      setIsFollowingUser(stats.isFollowing);
    } catch (err) {
      console.error("Failed to fetch follow stats:", err);
    }
  }, [user.uploaderUid, loggedInUser?.uid]);

  useEffect(() => {
    if (user.uploaderUid) {
      fetchFollowStats();
    }
  }, [fetchFollowStats, user.uploaderUid, loggedInUser?.uid]);

  const handleFollowToggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!loggedInUser || isFollowPending) return;

    setIsFollowPending(true);
    const prevIsFollowing = isFollowingUser;
    const prevFollowersCount = followersCount;

    // Optimistically update
    setIsFollowingUser(!prevIsFollowing);
    setFollowersCount(prevIsFollowing ? prevFollowersCount - 1 : prevFollowersCount + 1);

    try {
      const res = await toggleFollowUser(
        loggedInUser.uid,
        user.uploaderUid,
        loggedInUser.displayName || 'Someone',
        loggedInUser.photoURL || ''
      );
      setIsFollowingUser(res.isFollowing);
    } catch (err) {
      console.error("Failed to toggle follow:", err);
      // Revert
      setIsFollowingUser(prevIsFollowing);
      setFollowersCount(prevFollowersCount);
    } finally {
      setIsFollowPending(false);
    }
  };

  const handleOpenFollowersModal = (type: 'followers' | 'following') => {
    setFollowersModalType(type);
    setIsFollowersModalOpen(true);
  };

  // Single bulletproof profile loaders to reset states immediately when viewing another profile
  useEffect(() => {
    let mounted = true;
    
    // Reset states immediately when shifting profiles (unless matching preloaded SSR)
    setProfileData(user);
    const hasMatchingPreload = preloadedImages.length > 0 && preloadedImages[0]?.uploaderUid === user.uploaderUid;
    if (!hasMatchingPreload) {
      setAllImages([]);
      setDisplayedImages([]);
      setIsLoading(true);
    }
    setLikedImages([]);
    setDisplayedLikedImages([]);
    setUserReplies([]);
    setHasLoadedReplies(false);
    setActiveTab('created');

    if (!user.uploaderUid) {
      setIsLoading(false);
      return;
    }

    const fetchProfile = async () => {
        const fullProfile = await getUserProfile(user.uploaderUid);
        if (mounted && fullProfile) {
            setProfileData(prev => ({ ...prev, ...fullProfile }));
        }
    };
    fetchProfile();
    return () => { mounted = false; };
  }, [user.uploaderUid]);

  // Auto-equip and save Verified Creator status in DB when milestones are unlocked
  useEffect(() => {
    if (isOwner && !profileData.isVerified && allImages.length >= 50 && totalLikes >= 250) {
      const autoVerify = async () => {
        try {
          await updateUserProfile(profileData.uploaderUid, { isVerified: true });
          setProfileData(prev => ({ ...prev, isVerified: true }));
          console.log("Verified Creator status successfully auto-equipped and saved in SQLite database!");
        } catch (err) {
          console.error("Failed to auto-equip and save Verified status:", err);
        }
      };
      autoVerify();
    }
  }, [isOwner, profileData.isVerified, allImages.length, totalLikes, profileData.uploaderUid]);

  // Fetch Created/Uploaded Images
  const fetchUserImages = useCallback(async () => {
    if (!user.uploaderUid) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const { images: userImages } = await getImagesByUploader(user.uploaderUid);
      setAllImages(userImages);
      setDisplayedImages(userImages.slice(0, PAGE_SIZE));
      setCurrentIndex(PAGE_SIZE);
    } catch (error) {
      console.error("Failed to fetch user images:", error);
    } finally {
      setIsLoading(false);
    }
  }, [user.uploaderUid]);

  useEffect(() => {
    fetchUserImages();
  }, [fetchUserImages]);

  // Fetch Liked/Saved Images
  const fetchLikedImages = useCallback(async () => {
    setIsLoadingLikes(true);
    try {
      const { images } = await getImagesFromFirestore();
      // Filter images liked by this profile user
      const liked = images.filter(img => img.likedBy?.includes(user.uploaderUid));
      setLikedImages(liked);
      setDisplayedLikedImages(liked.slice(0, PAGE_SIZE));
      setLikedCurrentIndex(PAGE_SIZE);
    } catch (error) {
      console.error("Failed to fetch liked images:", error);
    } finally {
      setIsLoadingLikes(false);
    }
  }, [user.uploaderUid]);

  useEffect(() => {
    if (activeTab === 'saved') {
      fetchLikedImages();
    }
  }, [activeTab, fetchLikedImages]);

  // Fetch User Replies/Comments
  const fetchUserReplies = useCallback(async () => {
    if (!user.uploaderUid) return;
    setIsLoadingReplies(true);
    try {
      const replies = await getUserComments(user.uploaderUid, loggedInUser?.uid);
      setUserReplies(replies);
      setHasLoadedReplies(true);
    } catch (error) {
      console.error("Failed to fetch user replies:", error);
    } finally {
      setIsLoadingReplies(false);
    }
  }, [user.uploaderUid, loggedInUser?.uid]);

  useEffect(() => {
    if (activeTab === 'replies' && !hasLoadedReplies) {
      fetchUserReplies();
    }
  }, [activeTab, hasLoadedReplies, fetchUserReplies]);

  const loadMoreUserImages = useCallback(() => {
    if (isLoading || allImages.length === 0) return;

    if (currentIndex < allImages.length) {
        const nextIndex = currentIndex + PAGE_SIZE;
        const newImages = allImages.slice(currentIndex, nextIndex);
        setDisplayedImages(prev => [...prev, ...newImages]);
        setCurrentIndex(nextIndex);
    }
  }, [currentIndex, allImages, isLoading]);

  const loadMoreLikedImages = useCallback(() => {
    if (isLoadingLikes || likedImages.length === 0) return;

    if (likedCurrentIndex < likedImages.length) {
        const nextIndex = likedCurrentIndex + PAGE_SIZE;
        const newImages = likedImages.slice(likedCurrentIndex, nextIndex);
        setDisplayedLikedImages(prev => [...prev, ...newImages]);
        setLikedCurrentIndex(nextIndex);
    }
  }, [likedCurrentIndex, likedImages, isLoadingLikes]);

  useEffect(() => {
    const handleScroll = () => {
        const scrollThreshold = 800;
        const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
        const isAtBottom = window.innerHeight + scrollY >= document.documentElement.scrollHeight - scrollThreshold;
        if (isAtBottom) {
            if (activeTab === 'created') {
                loadMoreUserImages();
            } else if (activeTab === 'saved') {
                loadMoreLikedImages();
            }
        }
    };
    const throttledScrollHandler = throttle(handleScroll, 200);
    window.addEventListener('scroll', throttledScrollHandler);
    return () => window.removeEventListener('scroll', throttledScrollHandler);
  }, [loadMoreUserImages, loadMoreLikedImages, activeTab]);

  // Wrapper to handle local state update for likes, as the prop only updates App state
  const handleLocalLikeToggle = (image: ImageMeta) => {
      if (!loggedInUser) {
          onLikeToggle(image); // Will trigger login modal from App
          return;
      }

      // Secure checking: is this profile owner the current logged in user?
      const isOwner = loggedInUser.uid === user.uploaderUid;

      // Optimistic update logic
      const oldLikedBy = image.likedBy || [];
      const hasLiked = oldLikedBy.includes(loggedInUser.uid);
      const newLikedBy = hasLiked
        ? oldLikedBy.filter(id => id !== loggedInUser.uid)
        : [...oldLikedBy, loggedInUser.uid];
      
      const updatedImage = { 
          ...image, 
          likedBy: newLikedBy, 
          likeCount: newLikedBy.length 
      };

      // Update local uploads state
      const updater = (prev: ImageMeta[]) => prev.map(img => img.id === image.id ? updatedImage : img);
      setAllImages(updater);
      setDisplayedImages(updater);

      // Update local liked/saved pins state with seamless removal animation if unliked on owner's profile page
      setLikedImages(prev => {
          if (isOwner && hasLiked) {
              return prev.filter(img => img.id !== image.id);
          }
          return prev.map(img => img.id === image.id ? updatedImage : img);
      });
      setDisplayedLikedImages(prev => {
          if (isOwner && hasLiked) {
              return prev.filter(img => img.id !== image.id);
          }
          return prev.map(img => img.id === image.id ? updatedImage : img);
      });

      // Call parent to handle Firestore and App-wide state
      onLikeToggle(image);
  };

  return (
    <div className="animate-fade-in pb-10">
      {/* Header / Banner */}
      <div className="relative mb-16 md:mb-20">
        <div 
            className="w-full h-48 md:h-64 bg-surface rounded-b-2xl bg-cover bg-center relative overflow-hidden"
            style={{ backgroundImage: profileData.backgroundImageURL ? `url(${profileData.backgroundImageURL})` : 'none' }}
        >
            {!profileData.backgroundImageURL && <div className="absolute inset-0 bg-gradient-to-r from-surface via-border to-surface opacity-50" />}
            
            {/* Back Button overlay on banner */}
            <div className="absolute top-4 left-4 z-10">
                 <button onClick={onBack} className="bg-black/40 backdrop-blur-sm p-2 rounded-full text-white hover:bg-black/60 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                 </button>
            </div>
            {isOwner ? (
                <div className="absolute bottom-4 right-4 z-10">
                    <Button onClick={() => setIsEditModalOpen(true)} variant="secondary" size="sm" className="!bg-black/50 !text-white backdrop-blur-sm border-none hover:!bg-black/70">
                        Edit Profile
                    </Button>
                </div>
            ) : loggedInUser ? (
                <div className="absolute bottom-4 right-4 z-10">
                    <button
                        onClick={handleFollowToggle}
                        disabled={isFollowPending}
                        className={`font-bold px-6 py-2 rounded-full cursor-pointer transition-all duration-200 shadow-md ${
                          isFollowingUser
                            ? 'bg-black/50 text-white hover:bg-black/70 backdrop-blur-sm border border-white/20'
                            : 'bg-red-600 text-white hover:bg-red-500 hover:scale-[1.03]'
                        } ${isFollowPending ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                        {isFollowPending ? '...' : (isFollowingUser ? 'Following' : 'Follow')}
                    </button>
                </div>
            ) : null}
        </div>

        {/* Profile Info Container - Floating overlap */}
        <div className="absolute -bottom-12 md:-bottom-16 left-6 md:left-10 flex items-end gap-4">
            <img 
                src={profileData.uploaderPhotoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${profileData.uploaderName}`}
                alt={profileData.uploaderName}
                className="w-24 h-24 md:w-32 md:h-32 rounded-full border-4 border-background bg-surface object-cover shadow-lg"
            />
            <div className="mb-2 hidden md:block">
                <div className="flex items-center gap-3">
                    <h1 className="text-3xl font-bold text-primary flex items-center gap-1.5">
                      {profileData.uploaderName}
                      {profileData.isVerified && (
                        <VerifiedBadge className="h-6 w-6 mt-1" onClick={() => setShowVerifiedModal(true)} />
                      )}
                    </h1>
                    {!isOwner && loggedInUser && (
                        <button
                          onClick={handleFollowToggle}
                          disabled={isFollowPending}
                          className={`text-xs font-bold px-4 py-2 rounded-full cursor-pointer transition-all duration-200 ${
                            isFollowingUser
                              ? 'bg-border/60 text-secondary hover:bg-border/90 border border-border/80'
                              : 'bg-red-600 text-white hover:bg-red-500 hover:scale-[1.03]'
                          } ${isFollowPending ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          {isFollowPending ? '...' : (isFollowingUser ? 'Following' : 'Follow')}
                        </button>
                    )}
                </div>
                
                {/* Followers & Following Counts (desktop) */}
                <div className="flex items-center gap-2 text-xs text-secondary mt-1">
                    <button 
                        onClick={() => handleOpenFollowersModal('followers')} 
                        className="hover:text-primary hover:underline font-semibold cursor-pointer"
                    >
                        {followersCount} follower{followersCount !== 1 ? 's' : ''}
                    </button>
                    <span>&middot;</span>
                    <button 
                        onClick={() => handleOpenFollowersModal('following')} 
                        className="hover:text-primary hover:underline font-semibold cursor-pointer"
                    >
                        {followingCount} following
                    </button>
                </div>
            </div>
        </div>
      </div>

      {/* Mobile Name / Bio Section */}
      <div className="px-6 md:px-10 mt-4">
         <div className="md:hidden mb-2">
             <div className="flex items-center justify-between gap-3">
                 <div>
                     <h1 className="text-2xl font-bold text-primary flex items-center gap-1.5">
                       {profileData.uploaderName}
                       {profileData.isVerified && (
                         <VerifiedBadge className="h-5 w-5" onClick={() => setShowVerifiedModal(true)} />
                       )}
                     </h1>
                     {/* Followers & Following Counts (mobile) */}
                     <div className="flex items-center gap-2 text-xs text-secondary mt-0.5">
                         <button 
                             onClick={() => handleOpenFollowersModal('followers')} 
                             className="hover:text-primary hover:underline font-semibold cursor-pointer"
                         >
                             {followersCount} follower{followersCount !== 1 ? 's' : ''}
                         </button>
                         <span>&middot;</span>
                         <button 
                             onClick={() => handleOpenFollowersModal('following')} 
                             className="hover:text-primary hover:underline font-semibold cursor-pointer"
                         >
                             {followingCount} following
                         </button>
                     </div>
                 </div>
                 {!isOwner && loggedInUser && (
                      <button
                        onClick={handleFollowToggle}
                        disabled={isFollowPending}
                        className={`text-xs font-bold px-4 py-2 rounded-full cursor-pointer transition-all duration-200 ${
                          isFollowingUser
                            ? 'bg-border/60 text-secondary hover:bg-border/90 border border-border/80'
                            : 'bg-red-600 text-white hover:bg-red-500'
                        } ${isFollowPending ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        {isFollowPending ? '...' : (isFollowingUser ? 'Following' : 'Follow')}
                      </button>
                 )}
             </div>
         </div>

         {/* Bio & Meta */}
         <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4 mb-6">
             <div className="max-w-2xl">
                 {profileData.bio && <CrawlableContent content={profileData.bio} className="text-secondary text-sm md:text-base whitespace-pre-wrap mb-3" />}
                 
                 <div className="flex flex-wrap gap-4 text-sm text-secondary">
                     {profileData.location && (
                         <button 
                            onClick={() => onLocationClick && onLocationClick(profileData.location!)}
                            className={`flex items-center gap-1.5 ${onLocationClick ? 'hover:text-accent hover:underline cursor-pointer' : ''}`}
                         >
                             <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                             {profileData.location}
                         </button>
                     )}
                     {profileData.email && (
                         <div className="flex items-center gap-1.5">
                             <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                             <a href={`mailto:${profileData.email}`} className="hover:text-primary">{profileData.email}</a>
                         </div>
                     )}
                 </div>
             </div>

             {/* Stats */}
             <div className="flex gap-3">
                 <div className="bg-surface border border-border px-3 py-1.5 rounded-lg text-center">
                     <span className="block text-lg font-bold text-primary leading-none">{allImages.length}</span>
                     <span className="text-xs text-secondary">Uploads</span>
                 </div>
                 <div className="bg-surface border border-border px-3 py-1.5 rounded-lg text-center">
                     <span className="block text-lg font-bold text-primary leading-none">{totalLikes}</span>
                     <span className="text-xs text-secondary">Likes</span>
                 </div>
                 <div className="bg-surface border border-border px-3 py-1.5 rounded-lg text-center">
                     <span className="block text-lg font-bold text-primary leading-none">{totalDownloads}</span>
                     <span className="text-xs text-secondary">Downloads</span>
                 </div>
             </div>
         </div>


      </div>

      {/* Pinterest-style Slide Animated Tab Bar */}
      <div className="flex justify-center gap-8 mb-8 border-b border-border/40 pb-3 mx-6 md:mx-10 select-none">
        <button
          onClick={() => setActiveTab('created')}
          className={`relative pb-3 text-sm font-semibold transition-colors cursor-pointer ${
            activeTab === 'created' ? 'text-primary' : 'text-secondary hover:text-primary'
          }`}
        >
          Created
          {activeTab === 'created' && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full animate-fade-in" />
          )}
        </button>
        <button
          onClick={() => setActiveTab('saved')}
          className={`relative pb-3 text-sm font-semibold transition-colors cursor-pointer ${
            activeTab === 'saved' ? 'text-primary' : 'text-secondary hover:text-primary'
          }`}
        >
          Saved
          {activeTab === 'saved' && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full animate-fade-in" />
          )}
        </button>
        {(isOwner || !isRepliesHidden) && (
          <button
            onClick={() => setActiveTab('replies')}
            className={`relative pb-3 text-sm font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'replies' ? 'text-primary' : 'text-secondary hover:text-primary'
            }`}
          >
            Replies
            {isRepliesHidden && isOwner ? (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 font-medium">
                Hidden
              </span>
            ) : hasLoadedReplies && userReplies.length > 0 ? (
              <span className="text-[11px] px-1.5 py-0.2 rounded-full bg-surface border border-border text-secondary font-normal">
                {userReplies.length}
              </span>
            ) : null}
            {activeTab === 'replies' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full animate-fade-in" />
            )}
          </button>
        )}
        {isOwner && (
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`relative pb-3 text-sm font-semibold transition-colors cursor-pointer ${
              activeTab === 'dashboard' ? 'text-primary' : 'text-secondary hover:text-primary'
            }`}
          >
            Dashboard
            {activeTab === 'dashboard' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full animate-fade-in" />
            )}
          </button>
        )}
      </div>
      
      {/* Gallery Content switcher */}
      {activeTab === 'created' ? (
        isLoading ? (
          <div className="flex justify-center items-center py-20">
            <Spinner />
          </div>
        ) : allImages.length === 0 ? (
          <div className="text-center py-20 px-4">
            <div className="w-16 h-16 bg-surface rounded-full flex items-center justify-center mx-auto mb-4 border border-border">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-primary mb-1">Nothing created yet</h3>
            <p className="text-sm text-secondary max-w-sm mx-auto">
              {isOwner ? "Share your first masterpiece with the Glass Gallery community!" : "This creator hasn't published any images yet."}
            </p>
          </div>
        ) : (
          <div className="px-4 md:px-8">
            <ImageGrid user={loggedInUser} images={displayedImages} onImageClick={onImageClick} onViewProfile={onViewProfile} onLikeToggle={handleLocalLikeToggle} />
          </div>
        )
      ) : activeTab === 'saved' ? (
        isLoadingLikes ? (
          <div className="flex justify-center items-center py-20">
            <Spinner />
          </div>
        ) : likedImages.length === 0 ? (
          <div className="text-center py-20 px-4">
            <div className="w-16 h-16 bg-surface rounded-full flex items-center justify-center mx-auto mb-4 border border-border">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-primary mb-1">No saved items</h3>
            <p className="text-sm text-secondary max-w-sm mx-auto">
              {isOwner ? "Curate your inspiration board! Click the Save button on any image to store it here." : "This user hasn't saved any images yet."}
            </p>
          </div>
        ) : (
          <div className="px-4 md:px-8">
            <ImageGrid user={loggedInUser} images={displayedLikedImages} onImageClick={onImageClick} onViewProfile={onViewProfile} onLikeToggle={handleLocalLikeToggle} />
          </div>
        )
      ) : activeTab === 'replies' ? (
        !isOwner && isRepliesHidden ? (
          <div className="text-center py-20 px-4 animate-fade-in">
            <div className="w-16 h-16 bg-surface rounded-2xl flex items-center justify-center mx-auto mb-4 border border-border shadow-md">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-primary mb-1">Replies are private</h3>
            <p className="text-sm text-secondary max-w-sm mx-auto">
              This creator has chosen to keep their replies hidden from public visitors.
            </p>
          </div>
        ) : isLoadingReplies ? (
          <div className="flex flex-col justify-center items-center py-20 gap-3">
            <Spinner />
            <p className="text-xs text-secondary animate-pulse">Loading replies...</p>
          </div>
        ) : userReplies.length === 0 ? (
          <div className="text-center py-20 px-4 animate-fade-in">
            <div className="w-16 h-16 bg-surface rounded-2xl flex items-center justify-center mx-auto mb-4 border border-border shadow-md">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-primary mb-1">No replies yet</h3>
            <p className="text-sm text-secondary max-w-sm mx-auto mb-5">
              {isOwner 
                ? "You haven't replied to any posts yet. Drop a comment on any image to join the conversation!" 
                : "This user hasn't posted any replies or comments yet."}
            </p>
            {isOwner && (
              <button
                onClick={onBack}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-accent text-white font-medium text-sm hover:brightness-110 shadow-lg shadow-accent/20 transition-all hover:scale-105 active:scale-95 cursor-pointer"
              >
                Explore Community Posts
              </button>
            )}
          </div>
        ) : (
          <div className="max-w-3xl mx-auto px-4 md:px-6 space-y-4 animate-fade-in">
            {/* Owner Visibility Controls */}
            {isOwner && (
              <div className="flex items-center justify-between p-3 rounded-2xl bg-surface/70 border border-border/70 text-xs mb-1">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${isRepliesHidden ? 'bg-amber-400' : 'bg-emerald-400'}`} />
                  <span className="text-secondary font-medium">Replies tab visibility:</span>
                  <span className={`font-semibold ${isRepliesHidden ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {isRepliesHidden ? 'Hidden from public visitors' : 'Visible on public profile'}
                  </span>
                </div>
                <button
                  onClick={handleToggleRepliesVisibility}
                  className="px-3 py-1 rounded-full bg-background border border-border/80 hover:border-accent text-secondary hover:text-primary transition-all font-semibold text-xs cursor-pointer flex items-center gap-1.5"
                >
                  {isRepliesHidden ? 'Unhide replies' : 'Keep replies hidden'}
                </button>
              </div>
            )}
            {userReplies.map((reply) => {
              const post = reply.post;
              return (
                <div
                  key={reply.id}
                  className="group bg-surface/80 hover:bg-surface border border-border/70 hover:border-accent/40 rounded-2xl p-4 md:p-5 transition-all duration-200 shadow-sm hover:shadow-lg backdrop-blur-md"
                >
                  {/* Post Context Header */}
                  {post ? (
                    <div
                      onClick={() => onImageClick(post, reply.id)}
                      className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-background/60 hover:bg-background border border-border/50 hover:border-accent/50 cursor-pointer transition-all duration-200 mb-3.5 group/post"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {post.imageUrl ? (
                          <img
                            src={post.imageUrl}
                            alt={post.title || 'Post thumbnail'}
                            className="w-12 h-12 md:w-14 md:h-14 rounded-lg object-cover border border-border/60 shrink-0 group-hover/post:scale-105 transition-transform"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-12 h-12 md:w-14 md:h-14 rounded-lg bg-surface flex items-center justify-center border border-border shrink-0">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 text-xs text-secondary mb-0.5">
                            <span className="font-semibold text-accent flex items-center gap-1">
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                              </svg>
                              Replied to post
                            </span>
                            <span>&middot;</span>
                            <span className="truncate">by @{post.uploaderName}</span>
                          </div>
                          <h4 className="text-sm font-semibold text-primary truncate group-hover/post:text-accent transition-colors">
                            {post.title || 'Untitled Post'}
                          </h4>
                        </div>
                      </div>

                      <div className="shrink-0 flex items-center gap-1 text-xs font-semibold text-accent bg-accent/10 group-hover/post:bg-accent group-hover/post:text-white px-3 py-1.5 rounded-full transition-all duration-200">
                        <span>View post</span>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 group-hover/post:translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-xs text-secondary/80 mb-2 italic">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Replied to a post
                    </div>
                  )}

                  {/* Comment Content */}
                  <div className="flex items-start gap-3 pl-1">
                    <img
                      src={reply.userPhotoURL || profileData.uploaderPhotoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${reply.userName || profileData.uploaderName}`}
                      alt={reply.userName || profileData.uploaderName}
                      className="w-9 h-9 rounded-full object-cover border border-border shrink-0 mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <span className="text-sm font-bold text-primary flex items-center gap-1">
                          {reply.userName || profileData.uploaderName}
                          {profileData.isVerified && <VerifiedBadge className="h-3.5 w-3.5" />}
                        </span>
                        <span className="text-xs text-secondary">
                          {formatCommentDate(reply.createdAt)}
                        </span>
                        {reply.parentId && (
                          <span className="text-[10px] uppercase font-bold text-secondary bg-border/50 px-2 py-0.5 rounded-full">
                            Thread Reply
                          </span>
                        )}
                      </div>

                      <div className="bg-background/40 border border-border/40 rounded-xl p-3 text-sm text-primary/90 leading-relaxed whitespace-pre-wrap break-words">
                        {reply.content}
                      </div>

                      {/* Footer Actions / Likes info */}
                      <div className="flex items-center justify-between mt-3 pt-2 border-t border-border/30 text-xs text-secondary">
                        <div className="flex items-center gap-1.5">
                          <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 ${reply.likeCount && reply.likeCount > 0 ? 'text-red-500 fill-current' : 'text-secondary'}`} viewBox="0 0 20 20" fill={reply.likeCount && reply.likeCount > 0 ? "currentColor" : "none"} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" />
                          </svg>
                          <span>{reply.likeCount || 0} {reply.likeCount === 1 ? 'like' : 'likes'}</span>
                        </div>

                        {post && (
                          <button
                            onClick={() => onImageClick(post, reply.id)}
                            className="hover:text-primary transition-colors flex items-center gap-1 text-[11px] font-semibold text-accent cursor-pointer"
                          >
                            <span>Open in post view</span>
                            <span>→</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : (
        <CreatorDashboard 
          images={allImages} 
          followersCount={followersCount} 
          followingCount={followingCount} 
          onImageClick={onImageClick}
          profileUser={profileData}
        />
      )}

      {isEditModalOpen && (
        <EditProfileModal 
            user={profileData} 
            onClose={() => setIsEditModalOpen(false)} 
            onUpdateSuccess={(updated) => setProfileData(updated)} 
        />
      )}

      {isFollowersModalOpen && (
        <FollowersModal
          uid={profileData.uploaderUid}
          type={followersModalType}
          title={followersModalType === 'followers' ? 'Followers' : 'Following'}
          loggedInUser={loggedInUser}
          onClose={() => setIsFollowersModalOpen(false)}
          onUserClick={onViewProfile}
          onFollowToggleParent={fetchFollowStats}
        />
      )}

      {showVerifiedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in p-4">
          <div className="bg-surface border border-white/10 p-6 md:p-8 rounded-3xl max-w-md w-full shadow-2xl relative space-y-6 text-center select-none">
            <button 
              onClick={() => setShowVerifiedModal(false)}
              className="absolute top-4 right-4 text-secondary hover:text-white bg-white/5 hover:bg-white/10 p-2 rounded-full transition-colors cursor-pointer"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
            <div className="flex justify-center py-4">
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                className="h-24 w-24 text-blue-500 filter drop-shadow-[0_0_20px_rgba(59,130,246,0.8)] animate-pulse"
                viewBox="0 0 24 24" 
                fill="currentColor"
              >
                <path fillRule="evenodd" d="M8.603 3.799A4.49 4.49 0 0112 2.25c1.357 0 2.573.6 3.397 1.549a4.49 4.49 0 013.498 1.307 4.491 4.491 0 011.307 3.497A4.49 4.49 0 0121.75 12a4.49 4.49 0 01-1.549 3.397 4.491 4.491 0 01-1.307 3.497 4.491 4.491 0 01-3.497 1.307A4.49 4.49 0 0112 21.75a4.49 4.49 0 01-3.397-1.549 4.49 4.49 0 01-3.498-1.306 4.491 4.491 0 01-1.307-3.498A4.49 4.49 0 012.25 12c0-1.357.6-2.573 1.549-3.397a4.49 4.49 0 011.307-3.497a4.49 4.49 0 013.497-1.307zm7.007 6.387a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-black text-primary tracking-tight">Verified Creator</h2>
              <span className="text-[10px] uppercase font-bold text-blue-400 bg-blue-500/10 border border-blue-500/20 px-3 py-1 rounded-full inline-block">
                Elite Creator standing
              </span>
            </div>
            <p className="text-xs text-secondary leading-relaxed max-w-sm mx-auto">
              This badge is awarded automatically to creators who have reached our Gold & Artisan Milestone requirements of <strong className="text-white">50+ published images</strong> and over <strong className="text-white">250+ community likes</strong>. Thank you for contributing your premium creations to the Glass Gallery catalog!
            </p>
            <div className="pt-2">
              <button 
                onClick={() => setShowVerifiedModal(false)}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-blue-600/30 transition-all cursor-pointer active:scale-95"
              >
                Acknowledge Milestone
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfilePage;
