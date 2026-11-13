import React, { useState, useRef, useEffect, memo } from 'react';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import type { User } from 'firebase/auth';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';
import type { ImageMeta, ProfileUser } from '../types';
import { triggerLikeHaptic } from '../utils/haptics';
import { isVideoUrl } from '../utils/mediaUtils';
import VideoPlayer from './VideoPlayer';
import Spinner from './Spinner';
import PullToRefresh from './PullToRefresh';
import { useLikeSave } from '../services/likeSaveStore';

interface InfiniteFeedProps {
  images: ImageMeta[];
  user: User | null;
  onImageClick: (image: ImageMeta) => void;
  onViewProfile: (user: ProfileUser) => void;
  onLikeToggle: (image: ImageMeta) => void;
  onLoginClick: () => void;
  feedTab: 'discover' | 'following';
  setFeedTab: (tab: 'discover' | 'following') => void;
  onCreateClick: (type?: 'media' | 'text') => void;
  savedImages: Set<string>;
  onSaveToggle: (image: ImageMeta) => void;
  onImageDelete?: (imageId: string) => void;
  onImageEdit?: (image: ImageMeta) => void;
  onEndReached?: () => void;
  isFetchingNextPage?: boolean;
  followingError?: string | null;
  onRetryFollowing?: () => void;
  onRefresh?: () => Promise<any>;
  onRefreshFollowing?: () => Promise<any>;
  isLoadingFollowing?: boolean;
}

const FollowingFeedSkeleton: React.FC = () => (
  <div className="w-full divide-y divide-border/60">
    {[1, 2, 3].map(i => (
      <div key={i} className="p-4 flex flex-col gap-3 animate-pulse">
        {/* User bar */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-surface shrink-0" />
          <div className="flex flex-col gap-1.5 flex-1">
            <div className="h-3.5 bg-surface rounded w-32" />
            <div className="h-2.5 bg-surface/60 rounded w-20" />
          </div>
        </div>
        {/* Text lines */}
        <div className="h-3 bg-surface rounded w-3/4 mt-1" />
        {/* Media placeholder */}
        <div className="w-full aspect-[4/3] rounded-2xl bg-surface/50 border border-border/40" />
        {/* Actions bar */}
        <div className="flex items-center gap-6 pt-1">
          <div className="h-5 w-12 bg-surface rounded-full" />
          <div className="h-5 w-12 bg-surface rounded-full" />
          <div className="h-5 w-12 bg-surface rounded-full" />
        </div>
      </div>
    ))}
  </div>
);

export const FeedItem: React.FC<{
  image: ImageMeta;
  user: User | null;
  onImageClick: (image: ImageMeta) => void;
  onViewProfile: (user: ProfileUser) => void;
  onLikeToggle: (image: ImageMeta) => void;
  onLoginClick: () => void;
  savedImages: Set<string>;
  onSaveToggle: (image: ImageMeta) => void;
}> = memo(({
  image,
  user,
  onImageClick,
  onViewProfile,
  onLikeToggle,
  onLoginClick,
  savedImages,
  onSaveToggle
}) => {
  const baseId = image.id.split('_loop_')[0];
  const { isLiked, isSaved, likeCount, toggle } = useLikeSave(image, user as any);
  const isCombinedActive = isLiked || isSaved;

  const [isLikeAnimating, setIsLikeAnimating] = useState(false);
  const [isImageLoaded, setIsImageLoaded] = useState(false);
  const [isImageError, setIsImageError] = useState(false);
  const [isTextExpanded, setIsTextExpanded] = useState(false);

  const isCommunityOwner = Boolean(
    user?.uid && (
      image.community_owner_uid === user.uid ||
      image.is_owner
    )
  );

  const [isMember, setIsMember] = useState(Boolean(image.is_member || isCommunityOwner));
  const [isJoining, setIsJoining] = useState(false);

  useEffect(() => {
    setIsMember(Boolean(image.is_member || isCommunityOwner));
  }, [image.is_member, isCommunityOwner]);

  const handleJoin = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) {
      onLoginClick();
      return;
    }
    if (!image.community_id) return;
    setIsJoining(true);
    try {
      const res = await fetch('/api/communities/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          communityId: image.community_id,
          action: 'join',
          uid: user.uid
        })
      });
      const data = await res.json();
      if (data.success) {
        setIsMember(true);
      }
    } catch (err) {
      console.error('Failed to join community:', err);
    } finally {
      setIsJoining(false);
    }
  };

  const handleToggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) {
      onLoginClick();
      return;
    }
    setIsLikeAnimating(true);
    setTimeout(() => setIsLikeAnimating(false), 500);
    await toggle();
  };

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const postUrl = `https://gg.modvc.org/image/${baseId}`;
    if (Capacitor.isNativePlatform()) {
      try {
        await Share.share({
          title: image.title || 'Glass Gallery Post',
          text: image.description || 'Check out this post on Glass Gallery',
          url: postUrl,
          dialogTitle: 'Share Post'
        });
        return;
      } catch {}
    }
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: image.title || 'Glass Gallery Post',
          text: image.description || '',
          url: postUrl
        });
        return;
      } catch {}
    }
    try {
      await navigator.clipboard.writeText(postUrl);
      alert('Link copied to clipboard!');
    } catch {}
  };

  const isTextOnly = !image.imageUrl || image.imageUrl === 'text://post' || image.imageUrl.startsWith('text://');
  const isVideo = !isTextOnly && isVideoUrl(image.imageUrl);

  const formatTimeAgo = (timestamp: any) => {
    if (!timestamp) return 'Just now';
    let date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp.seconds ? timestamp.seconds * 1000 : timestamp);
    if (isNaN(date.getTime())) return 'Just now';
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
    if (seconds < 60) return `${Math.max(1, seconds)}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <article
      className="p-4 border-b border-border transition-colors hover:bg-surface/20 active:bg-surface/30 cursor-pointer"
      style={{ contentVisibility: 'auto', containIntrinsicSize: '400px 320px' }}
      onClick={() => onImageClick(image)}
    >
      {/* Community Line above Author if belongs to Community */}
      {image.community_slug && (
        <div className="flex items-center justify-between gap-2 mb-2 min-h-[32px]">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              window.history.pushState(null, '', `/c/${image.community_slug}`);
              window.dispatchEvent(new PopStateEvent('popstate'));
            }}
            className="flex items-center gap-1.5 hover:underline group/comm min-w-0 text-left min-h-[36px]"
          >
            {image.community_icon_url ? (
              <img
                src={image.community_icon_url}
                alt=""
                className="w-4 h-4 rounded-full object-cover shrink-0"
              />
            ) : (
              <span className="w-4 h-4 rounded-full bg-accent/20 text-accent text-[10px] font-bold flex items-center justify-center shrink-0">
                {image.community_slug[0]?.toUpperCase()}
              </span>
            )}
            <span className="text-xs font-bold text-primary group-hover/comm:text-accent transition-colors truncate">
              c/{image.community_slug}
            </span>
          </button>

          {!isMember && !isCommunityOwner && (
            <button
              type="button"
              onClick={handleJoin}
              disabled={isJoining}
              className="px-3.5 py-1 rounded-full text-xs font-bold bg-accent text-primary active:scale-95 transition-all min-h-[36px] flex items-center gap-1 shrink-0"
            >
              {isJoining ? '...' : 'Join'}
            </button>
          )}
        </div>
      )}

      {/* Author Header Row */}
      <div className="flex items-center justify-between mb-2">
        <div
          className="flex items-center gap-2.5 min-w-0"
          onClick={(e) => {
            e.stopPropagation();
            onViewProfile({
              uploaderUid: image.uploaderUid,
              uploaderName: image.uploaderName,
              uploaderPhotoURL: image.uploaderPhotoURL
            });
          }}
        >
          <img
            src={image.uploaderPhotoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${image.uploaderName}`}
            alt={image.uploaderName}
            className="w-9 h-9 rounded-full object-cover shrink-0 border border-border"
            loading="lazy"
          />
          <div className="min-w-0">
            <div className="flex items-baseline gap-1.5 truncate">
              <span className="text-sm font-bold text-primary hover:underline truncate">
                {image.uploaderName || 'Anonymous'}
              </span>
              <span className="text-xs text-secondary truncate">
                @{image.uploaderName ? image.uploaderName.replace(/\s+/g, '').toLowerCase() : 'user'}
              </span>
              <span className="text-xs text-secondary shrink-0">· {formatTimeAgo(image.uploadedAt)}</span>
            </div>
          </div>
        </div>

        {image.is_pinned && (
          <span className="text-[10px] font-bold text-accent bg-accent/15 px-2 py-0.5 rounded-full shrink-0">
            Pinned
          </span>
        )}
      </div>

      {/* Title */}
      {image.title && (
        <h2 className="text-[15px] font-bold text-primary mb-1.5 leading-snug line-clamp-2">
          {image.title}
        </h2>
      )}

      {/* Description / Text Post Excerpt */}
      {image.description && (
        <div className="relative mb-3">
          <p className={`text-sm text-neutral-300 leading-relaxed font-normal whitespace-pre-line ${
            isTextOnly && !isTextExpanded ? 'line-clamp-4' : ''
          }`}>
            {image.description}
          </p>
          {isTextOnly && image.description.length > 200 && !isTextExpanded && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsTextExpanded(true);
              }}
              className="text-xs font-bold text-accent hover:underline mt-1 block"
            >
              Read more →
            </button>
          )}
        </div>
      )}

      {/* Media: Image or Video */}
      {!isTextOnly && (
        <div className="rounded-2xl overflow-hidden border border-border bg-black/40 my-2 relative shadow-md">
          {isVideo ? (
            <VideoPlayer
              src={image.imageUrl}
              poster={image.thumbnailUrl}
              className="w-full max-h-[70vh] object-contain rounded-2xl"
            />
          ) : (
            <div className="relative w-full min-h-[200px] flex items-center justify-center bg-black/20">
              {!isImageLoaded && !isImageError && (
                <div className="absolute inset-0 bg-surface/30 animate-pulse flex items-center justify-center">
                  <div className="w-8 h-8 rounded-full border-2 border-accent border-t-transparent animate-spin" />
                </div>
              )}
              {isImageError ? (
                <div className="py-12 px-4 text-center text-xs text-secondary flex flex-col items-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-neutral-600 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span>Image preview unavailable</span>
                </div>
              ) : (
                <img
                  src={image.thumbnailUrl || image.imageUrl}
                  alt={image.title || 'Feed item'}
                  className="w-full max-h-[70vh] object-cover sm:object-contain rounded-2xl transition-opacity duration-300"
                  style={{ opacity: isImageLoaded ? 1 : 0 }}
                  loading="lazy"
                  onLoad={() => setIsImageLoaded(true)}
                  onError={() => setIsImageError(true)}
                />
              )}
            </div>
          )}
        </div>
      )}

      {/* Tags Chips */}
      {image.flags && image.flags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2.5">
          {image.flags.slice(0, 4).map(flag => (
            <span key={flag} className="px-2 py-0.5 rounded-full bg-surface/70 border border-border/70 text-[10px] text-secondary">
              #{flag}
            </span>
          ))}
        </div>
      )}

      {/* Action Row — 44px min touch targets */}
      <div className="flex items-center justify-between text-secondary pt-1 border-t border-border/40">
        {/* Like */}
        <button
          type="button"
          onClick={handleToggle}
          className="flex items-center gap-1.5 min-h-[44px] min-w-[44px] px-2 rounded-full hover:bg-surface/60 active:scale-95 transition-all text-secondary"
          style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
          aria-label="Like post"
        >
          <div className={isLikeAnimating ? 'animate-like-bounce' : ''}>
            {isCombinedActive ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-accent" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 hover:text-accent transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            )}
          </div>
          <span className={`text-xs font-semibold ${isCombinedActive ? 'text-accent' : 'text-secondary'}`}>
            {likeCount || 0}
          </span>
        </button>

        {/* Comment */}
        <button
          type="button"
          onClick={() => onImageClick(image)}
          className="flex items-center gap-1.5 min-h-[44px] min-w-[44px] px-2 rounded-full hover:bg-surface/60 active:scale-95 transition-all text-secondary"
          style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
          aria-label="Comments"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <span className="text-xs font-semibold">{image.commentCount || 0}</span>
        </button>

        {/* Share */}
        <button
          type="button"
          onClick={handleShare}
          className="flex items-center justify-center min-h-[44px] min-w-[44px] rounded-full hover:bg-surface/60 active:scale-95 transition-all text-secondary"
          style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
          aria-label="Share"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
          </svg>
        </button>

        {/* Save */}
        <button
          type="button"
          onClick={handleToggle}
          className="flex items-center justify-center min-h-[44px] min-w-[44px] rounded-full hover:bg-surface/60 active:scale-95 transition-all text-secondary"
          style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
          aria-label="Save post"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 ${isCombinedActive ? 'text-accent fill-current' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
          </svg>
        </button>
      </div>
    </article>
  );
});

export const InfiniteFeed: React.FC<InfiniteFeedProps> = ({
  images,
  user,
  onImageClick,
  onViewProfile,
  onLikeToggle,
  onLoginClick,
  feedTab,
  setFeedTab,
  onCreateClick,
  savedImages,
  onSaveToggle,
  onEndReached,
  isFetchingNextPage,
  followingError,
  onRetryFollowing,
  onRefresh,
  onRefreshFollowing,
  isLoadingFollowing
}) => {
  const virtuosoRef = useRef<VirtuosoHandle>(null);

  const handlePullRefresh = async () => {
    if (feedTab === 'following') {
      if (onRefreshFollowing) await onRefreshFollowing();
    } else {
      if (onRefresh) await onRefresh();
    }
  };

  return (
    <div className="w-full max-w-xl mx-auto flex flex-col min-h-screen bg-background">
      {/* Sticky Tab Header (Discover / Following) - Fixed height with single inset source */}
      <div
        className="sticky top-0 z-30 bg-background/90 backdrop-blur-md border-b border-border flex items-center justify-center gap-6 px-4"
        style={{
          paddingTop: 'env(safe-area-inset-top, 0px)',
          height: 'calc(48px + env(safe-area-inset-top, 0px))'
        }}
      >
        <button
          type="button"
          onClick={() => setFeedTab('discover')}
          className={`py-3 text-sm font-bold transition-all relative min-h-[48px] flex items-center ${
            feedTab === 'discover' ? 'text-primary' : 'text-secondary hover:text-primary'
          }`}
          style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
        >
          <span>Discover</span>
          {feedTab === 'discover' && (
            <span className="absolute bottom-0 inset-x-0 h-1 bg-accent rounded-full" />
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            if (!user) {
              onLoginClick();
            } else {
              setFeedTab('following');
            }
          }}
          className={`py-3 text-sm font-bold transition-all relative min-h-[48px] flex items-center ${
            feedTab === 'following' ? 'text-primary' : 'text-secondary hover:text-primary'
          }`}
          style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
        >
          <span>Following</span>
          {feedTab === 'following' && (
            <span className="absolute bottom-0 inset-x-0 h-1 bg-accent rounded-full" />
          )}
        </button>
      </div>

      <PullToRefresh onRefresh={handlePullRefresh} className="flex-1 flex flex-col">
        {/* Composer Bar ("Create post" with media & text shortcuts) */}
        <div className="p-3.5 border-b border-border/80 flex items-center gap-3 bg-surface/30">
          <img
            src={user?.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${user?.displayName || 'Guest'}`}
            alt=""
            className="w-10 h-10 rounded-full object-cover shrink-0 border border-border"
          />
          <div
            onClick={() => onCreateClick()}
            className="flex-1 bg-surface border border-border rounded-full px-4 py-2.5 text-xs text-secondary cursor-pointer hover:border-accent/40 transition-colors flex items-center justify-between min-h-[44px]"
            style={{ touchAction: 'manipulation' }}
          >
            <span>What is happening?!</span>
            <div className="flex items-center gap-2 text-secondary">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCreateClick('media');
                }}
                className="p-1 hover:text-accent transition-colors min-w-[32px] min-h-[32px] flex items-center justify-center"
                title="Media Post"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCreateClick('text');
                }}
                className="p-1 hover:text-accent transition-colors min-w-[32px] min-h-[32px] flex items-center justify-center"
                title="Discussion Post"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Feed List, Loading Skeleton, Error State, or Empty State */}
        {feedTab === 'following' && isLoadingFollowing && images.length === 0 ? (
          <FollowingFeedSkeleton />
        ) : feedTab === 'following' && followingError ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center min-h-[50vh]">
            <div className="w-14 h-14 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-3 text-red-400">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 className="text-base font-bold text-primary mb-1">Failed to load Following feed</h3>
            <p className="text-xs text-secondary max-w-xs mb-4">{followingError}</p>
            {onRetryFollowing && (
              <button
                type="button"
                onClick={onRetryFollowing}
                className="px-5 py-2.5 rounded-full bg-accent text-primary text-xs font-bold active:scale-95 transition-all shadow-md min-h-[44px]"
              >
                Retry
              </button>
            )}
          </div>
        ) : images.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center min-h-[50vh]">
            <div className="w-14 h-14 rounded-full bg-surface border border-border flex items-center justify-center mb-3 text-secondary">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <h3 className="text-base font-bold text-primary mb-1">
              {feedTab === 'following' ? 'No posts in Following' : 'No posts found'}
            </h3>
            <p className="text-xs text-secondary max-w-xs mb-4">
              {feedTab === 'following'
                ? 'Follow creators and join communities to see their latest updates here.'
                : 'Be the first to share your creative work or thoughts with the community!'}
            </p>
            <button
              type="button"
              onClick={() => onCreateClick()}
              className="px-5 py-2.5 rounded-full bg-accent text-primary text-xs font-bold active:scale-95 transition-all shadow-md min-h-[44px]"
            >
              Create Post
            </button>
          </div>
        ) : (
          <Virtuoso
            ref={virtuosoRef}
            useWindowScroll
            data={images}
            endReached={onEndReached}
            itemContent={(index, item) => (
              <FeedItem
                key={item.id}
                image={item}
                user={user}
                onImageClick={onImageClick}
                onViewProfile={onViewProfile}
                onLikeToggle={onLikeToggle}
                onLoginClick={onLoginClick}
                savedImages={savedImages}
                onSaveToggle={onSaveToggle}
              />
            )}
            components={{
              Footer: () => (
                <div className="py-6 flex items-center justify-center">
                  {isFetchingNextPage ? (
                    <Spinner size="sm" />
                  ) : (
                    <div className="text-[11px] text-secondary">You're all caught up!</div>
                  )}
                </div>
              )
            }}
          />
        )}
      </PullToRefresh>
    </div>
  );
};

export default InfiniteFeed;

