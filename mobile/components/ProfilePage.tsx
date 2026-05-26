
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { User } from 'firebase/auth';
import type { ProfileUser, ImageMeta } from '../types';
import { getImagesByUploader, PAGE_SIZE, getUserProfile, getFollowStats, toggleFollowUser, getImagesFromFirestore, updateUserProfile } from '../services/firestoreService';
import ImageGrid from './ImageGrid';
import Spinner from './Spinner';
import Button from './Button';
import EditProfileModal from './EditProfileModal';
import FollowersModal from './FollowersModal';
import CreatorDashboard from './CreatorDashboard';

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

interface ProfilePageProps {
  user: ProfileUser;
  loggedInUser: User | null;
  onBack: () => void;
  onImageClick: (image: ImageMeta) => void;
  onViewProfile: (user: ProfileUser) => void;
  onLikeToggle: (image: ImageMeta) => void;
  onLocationClick?: (location: string) => void;
  allImages: ImageMeta[];
  onLongPress?: (image: ImageMeta) => void;
  onViewFollowList?: (uid: string, type: 'followers' | 'following') => void;
  onCheckUpdates?: () => void;
  updateCheckLoading?: boolean;
  updateStatusMessage?: string | null;
}

const ProfilePage: React.FC<ProfilePageProps> = ({ 
  user, 
  loggedInUser, 
  onBack, 
  onImageClick, 
  onViewProfile, 
  onLikeToggle, 
  onLocationClick, 
  allImages: cacheAllImages, 
  onLongPress, 
  onViewFollowList,
  onCheckUpdates,
  updateCheckLoading = false,
  updateStatusMessage = null
}) => {
  const [profileData, setProfileData] = useState<ProfileUser>(user);
  const isOwner = loggedInUser?.uid === user.uploaderUid;
  
  // Tab Management
  const [activeTab, setActiveTab] = useState<'created' | 'saved' | 'dashboard'>('created');

  // Created/Uploads Gallery State
  const [allImages, setAllImages] = useState<ImageMeta[]>([]);
  const [displayedImages, setDisplayedImages] = useState<ImageMeta[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);

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

  // Fetch Follow Stats (Uses stable user.uploaderUid to prevent any state evaluation loops!)
  const fetchFollowStats = useCallback(async () => {
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
    fetchFollowStats();
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
    if (onViewFollowList) {
      onViewFollowList(user.uploaderUid, type);
    } else {
      setFollowersModalType(type);
      setIsFollowersModalOpen(true);
    }
  };

  // Single bulletproof profile loaders to reset states immediately when viewing another profile
  useEffect(() => {
    let mounted = true;
    
    // Reset states immediately when shifting profiles
    setProfileData(user);
    
    // Instantly filter from hybrid cache!
    const cachedCreated = cacheAllImages.filter(img => img.uploaderUid === user.uploaderUid);
    const cachedSaved = cacheAllImages.filter(img => img.likedBy?.includes(user.uploaderUid));
    
    setAllImages(cachedCreated);
    setDisplayedImages(cachedCreated.slice(0, PAGE_SIZE));
    setLikedImages(cachedSaved);
    setDisplayedLikedImages(cachedSaved.slice(0, PAGE_SIZE));
    
    // If we have cached images, disable loading spinner instantly!
    setIsLoading(cachedCreated.length === 0);
    setIsLoadingLikes(cachedSaved.length === 0);
    setActiveTab('created');

    const fetchProfile = async () => {
        const fullProfile = await getUserProfile(user.uploaderUid);
        if (mounted && fullProfile) {
            setProfileData(prev => ({ ...prev, ...fullProfile }));
        }
    };
    fetchProfile();
    return () => { mounted = false; };
  }, [user.uploaderUid, cacheAllImages]);

  const totalLikes = useMemo(() => {
    return allImages.reduce((sum, img) => sum + (img.likeCount || 0), 0);
  }, [allImages]);

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
    if (allImages.length === 0) {
      setIsLoading(true);
    }
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
  }, [user.uploaderUid, allImages.length]);

  useEffect(() => {
    fetchUserImages();
  }, [fetchUserImages]);

  // Fetch Liked/Saved Images
  const fetchLikedImages = useCallback(async () => {
    if (likedImages.length === 0) {
      setIsLoadingLikes(true);
    }
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
  }, [user.uploaderUid, likedImages.length]);

  useEffect(() => {
    if (activeTab === 'saved') {
      fetchLikedImages();
    }
  }, [activeTab, fetchLikedImages]);

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
        const isAtBottom = window.innerHeight + document.documentElement.scrollTop >= document.documentElement.offsetHeight - scrollThreshold;
        if (isAtBottom) {
            if (activeTab === 'created') {
                loadMoreUserImages();
            } else {
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
  const totalDownloads = useMemo(() => allImages.reduce((sum, img) => sum + (img.downloadCount || 0), 0), [allImages]);

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
                 {profileData.bio && <p className="text-secondary text-sm md:text-base whitespace-pre-wrap mb-3">{profileData.bio}</p>}
                 
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

         {/* Premium Glassmorphic Updates Center */}
         {false && (
             <div className="w-full mt-4 p-5 rounded-3xl bg-neutral-900/40 border border-white/5 backdrop-blur-md flex flex-col gap-3 relative overflow-hidden">
                 <div className="absolute -top-10 -right-10 w-24 h-24 bg-red-500/5 rounded-full blur-2xl pointer-events-none" />
                 <div className="flex items-center justify-between">
                     <div className="flex items-center gap-3">
                         <div className="p-2 bg-red-500/10 text-red-500 rounded-xl border border-red-500/20">
                             <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                                 <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                             </svg>
                         </div>
                         <div>
                             <h3 className="text-sm font-bold text-white leading-none">Glass Gallery Updates Center</h3>
                             <span className="text-[11px] text-neutral-500 font-semibold block mt-1">Installed Version: v1.0.0</span>
                         </div>
                     </div>
                     <button
                         onClick={onCheckUpdates}
                         disabled={updateCheckLoading}
                         className="text-xs font-bold px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white transition-all active:scale-95 border border-white/5 disabled:opacity-50 flex items-center gap-1.5"
                     >
                         {updateCheckLoading ? (
                             <>
                                 <svg className="animate-spin h-3 w-3 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                     <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                     <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                 </svg>
                                 Checking...
                             </>
                         ) : 'Check for Updates'}
                     </button>
                 </div>
                 {updateStatusMessage && (
                     <div className="text-xs text-neutral-400 font-semibold px-2 py-1 rounded-lg bg-white/[0.02] border border-white/5 animate-fade-in">
                         {updateStatusMessage}
                     </div>
                 )}
             </div>
         )}
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
            <ImageGrid user={loggedInUser} images={displayedImages} onImageClick={onImageClick} onViewProfile={onViewProfile} onLikeToggle={handleLocalLikeToggle} onLongPress={onLongPress} />
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
            <ImageGrid user={loggedInUser} images={displayedLikedImages} onImageClick={onImageClick} onViewProfile={onViewProfile} onLikeToggle={handleLocalLikeToggle} onLongPress={onLongPress} />
          </div>
        )
      ) : (
        <CreatorDashboard 
          images={allImages} 
          followersCount={followersCount} 
          followingCount={followingCount} 
          onImageClick={onImageClick}
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
