import React, { useState, useRef, memo } from 'react';
import { Virtuoso, VirtuosoHandle, State } from 'react-virtuoso';
import type { User } from 'firebase/auth';
import type { ImageMeta, ProfileUser } from '../types';
import { recordWatchInterest } from '../services/interestTracker';
import { isVideoUrl } from '../utils/mediaUtils';
import EmbedModal from './EmbedModal';
import VideoPlayer from './VideoPlayer';
import Button from './Button';
import Spinner from './Spinner';

interface InfiniteFeedProps {
  images: ImageMeta[];
  user: User | null;
  onImageClick: (image: ImageMeta) => void;
  onViewProfile: (user: ProfileUser) => void;
  onLikeToggle: (image: ImageMeta) => void;
  onLoginClick: () => void;
  feedTab: 'discover' | 'following';
  setFeedTab: (tab: 'discover' | 'following') => void;
  onCreateClick: () => void;
  savedImages: Set<string>;
  onSaveToggle: (image: ImageMeta) => void;
  onImageDelete: (imageId: string) => void;
  onImageEdit: (image: ImageMeta) => void;
  topicFilter?: string;
  onClearTopicFilter?: () => void;
  onEndReached?: () => void;
  isFetchingNextPage?: boolean;
  virtuosoRef?: React.RefObject<VirtuosoHandle | null>;
  restoreStateFrom?: State;
}

export const FeedItem: React.FC<{
  image: ImageMeta;
  user: any;
  onImageClick: (image: ImageMeta) => void;
  onViewProfile: (user: ProfileUser) => void;
  onLikeToggle: (image: ImageMeta) => void;
  onLoginClick: () => void;
  savedImages: Set<string>;
  onSaveToggle: (image: ImageMeta) => void;
  onImageDelete: (imageId: string) => void;
  onImageEdit: (image: ImageMeta) => void;
}> = memo(({ image, user, onImageClick, onViewProfile, onLikeToggle, onLoginClick, savedImages, onSaveToggle, onImageDelete, onImageEdit }) => {
  const hasLiked = user ? (image.likedBy || []).includes(user.uid) : false;
  const baseId = image.id.split('_loop_')[0];
  const hasSaved = savedImages.has(baseId);
  const watchLoggedRef = useRef(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showEmbed, setShowEmbed] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isImageLoaded, setIsImageLoaded] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleVideoTimeUpdate = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = e.currentTarget;
    if (video.duration && !watchLoggedRef.current) {
      const ratio = video.currentTime / video.duration;
      if (ratio >= 0.5) {
        watchLoggedRef.current = true;
        recordWatchInterest(image, ratio);
      }
    }
  };

  const formatTimeAgo = (timestamp: any) => {
    if (!timestamp) return 'Just now';
    let date: Date;
    if (timestamp.toDate) {
      date = timestamp.toDate();
    } else if (typeof timestamp.seconds === 'number') {
      date = new Date(timestamp.seconds * 1000);
    } else {
      date = new Date(timestamp);
    }

    if (isNaN(date.getTime())) return 'Just now';
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);

    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + 'y';
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + 'mo';
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + 'd';
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + 'h';
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + 'm';
    return Math.floor(seconds) + 's';
  };

  return (
    <article
      className="flex gap-3 p-4 border-b border-border transition-colors hover:bg-surface/30 cursor-pointer"
      onClick={() => onImageClick(image)}
    >
      <div className="shrink-0">
        <img
          src={image.uploaderPhotoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${image.uploaderName}`}
          alt={image.uploaderName}
          className="w-10 h-10 rounded-full object-cover cursor-pointer hover:opacity-80 transition-opacity"
          loading="lazy"
          decoding="async"
          onClick={(e) => {
            e.stopPropagation();
            onViewProfile({
              uploaderUid: image.uploaderUid,
              uploaderName: image.uploaderName,
              uploaderPhotoURL: image.uploaderPhotoURL
            });
          }}
        />
      </div>

      <div className="flex-1 min-w-0 flex flex-col">
        <div className="flex items-baseline justify-between mb-1">
          <div className="flex items-baseline gap-1.5 truncate">
            <span
              className="font-bold text-[15px] text-primary hover:underline cursor-pointer truncate"
              onClick={(e) => {
                e.stopPropagation();
                onViewProfile({
                  uploaderUid: image.uploaderUid,
                  uploaderName: image.uploaderName,
                  uploaderPhotoURL: image.uploaderPhotoURL
                });
              }}
            >
              {image.uploaderName || 'Anonymous'}
            </span>
            <span
              className="text-[14px] text-secondary cursor-pointer truncate"
              onClick={(e) => {
                e.stopPropagation();
                onViewProfile({
                  uploaderUid: image.uploaderUid,
                  uploaderName: image.uploaderName,
                  uploaderPhotoURL: image.uploaderPhotoURL
                });
              }}
            >
              @{image.uploaderName?.toLowerCase().replace(/\s+/g, '') || 'anon'}
            </span>
            <span className="text-secondary text-[14px]">·</span>
            <span className="text-[14px] text-secondary hover:underline shrink-0">
              {formatTimeAgo(image.uploadedAt)}
            </span>
          </div>

          <div className="relative" ref={dropdownRef} onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              className="p-1.5 text-secondary hover:text-primary hover:bg-surface/50 rounded-full transition-colors"
            >
              <svg viewBox="0 0 24 24" className="w-[18px] h-[18px] fill-current">
                <g><path d="M3 12c0-1.1.9-2 2-2s2 .9 2 2-.9 2-2 2-2-.9-2-2zm7 0c0-1.1.9-2 2-2s2 .9 2 2-.9 2-2 2-2-.9-2-2zm7 0c0-1.1.9-2 2-2s2 .9 2 2-.9 2-2 2-2-.9-2-2z"></path></g>
              </svg>
            </button>

            {showDropdown && (
              <div className="absolute right-0 top-8 w-48 bg-surface/95 backdrop-blur-md border border-border rounded-xl shadow-xl z-50 py-1 overflow-hidden animate-fade-in text-sm font-medium">
                <button
                  onClick={() => {
                    setShowDropdown(false);
                    setShowEmbed(true);
                  }}
                  className="w-full text-left px-4 py-2.5 hover:bg-white/10 text-primary flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                  </svg>
                  Embed Post
                </button>

                {user && user.uid === image.uploaderUid && (
                  <>
                    <button
                      onClick={() => {
                        setShowDropdown(false);
                        onImageEdit(image);
                      }}
                      className="w-full text-left px-4 py-2.5 hover:bg-white/10 text-primary flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      Edit Post
                    </button>
                    <button
                      onClick={() => {
                        setShowDropdown(false);
                        setShowDeleteConfirm(true);
                      }}
                      className="w-full text-left px-4 py-2.5 hover:bg-red-500/20 text-red-400 flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      Delete Post
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="text-[15px] text-primary whitespace-pre-wrap break-words mb-3 leading-snug">
          {image.title && <span className="font-semibold block">{image.title}</span>}
          {image.description && <span className="block mt-1">{image.description}</span>}
        </div>

        <div className="rounded-2xl border border-border overflow-hidden mb-3 max-h-[500px] bg-surface/30 relative min-h-[180px] flex items-center justify-center">
          {isVideoUrl(image.imageUrl) ? (
            <VideoPlayer
              src={image.imageUrl}
              muted
              loop
              autoPlay
              preload="metadata"
              onTimeUpdate={handleVideoTimeUpdate}
              className="w-full h-full object-contain max-h-[500px]"
            />
          ) : (
            <>
              {!isImageLoaded && (
                <div className="absolute inset-0 bg-gradient-to-br from-surface/80 via-surface/40 to-surface/90 animate-pulse flex items-center justify-center">
                  <div className="w-7 h-7 border-2 border-accent/40 border-t-accent rounded-full animate-spin"></div>
                </div>
              )}
              <img
                src={image.imageUrl}
                alt={image.title || 'Post image'}
                onLoad={() => setIsImageLoaded(true)}
                className={`w-full h-full object-cover max-h-[500px] transition-all duration-500 ease-out ${isImageLoaded ? 'opacity-100 blur-0 scale-100' : 'opacity-0 blur-md scale-95'
                  }`}
                loading="lazy"
                decoding="async"
              />
            </>
          )}
        </div>

        <div className="flex justify-between items-center text-secondary w-full max-w-md mt-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onImageClick(image);
            }}
            className="flex items-center gap-1.5 group hover:text-accent transition-colors outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 rounded-full"
          >
            <div className="p-2 rounded-full group-hover:bg-accent/10 transition-colors">
              <svg viewBox="0 0 24 24" className="w-[18px] h-[18px] fill-current">
                <g><path d="M1.751 10c0-4.42 3.584-8 8.005-8h4.366c4.49 0 8.129 3.64 8.129 8.13 0 2.96-1.607 5.59-4 7.03v3.59c0 .41-.34.75-.75.75-.17 0-.33-.06-.46-.17l-3.37-2.92h-3.91c-4.421 0-8.005-3.58-8.005-8zm8.005-6c-3.317 0-6.005 2.69-6.005 6s2.688 6 6.005 6h4.366c.2 0 .39.08.53.22l2.35 2.04v-1.76c0-.41.34-.75.75-.75 2.44 0 4.13-1.87 4.13-4.13 0-3.39-2.74-6.13-6.13-6.13h-4.001z"></path></g>
              </svg>
            </div>
            <span className="text-xs">{image.commentCount || 0}</span>
          </button>

          {/* Like */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (!user) {
                onLoginClick();
              } else {
                onLikeToggle(image);
              }
            }}
            className={`flex items-center gap-1.5 group transition-colors outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 rounded-full ${hasLiked ? 'text-pink-500' : 'hover:text-pink-500'}`}
          >
            <div className={`p-2 rounded-full group-hover:bg-pink-500/10 transition-colors`}>
              <svg viewBox="0 0 24 24" className={`w-[18px] h-[18px] ${hasLiked ? 'fill-pink-500' : 'fill-current'}`}>
                <g>
                  {hasLiked ? (
                    <path d="M12 21.638h-.014C9.403 21.59 1.95 14.851 1.95 8.478c0-3.064 2.525-5.554 5.63-5.554 1.774 0 3.424.832 4.42 2.247 1-1.415 2.646-2.247 4.42-2.247 3.105 0 5.63 2.49 5.63 5.554 0 6.373-7.453 13.112-10.036 13.16s-.01.002-.014.002z"></path>
                  ) : (
                    <path d="M12 21.638h-.014C9.403 21.59 1.95 14.851 1.95 8.478c0-3.064 2.525-5.554 5.63-5.554 1.774 0 3.424.832 4.42 2.247 1-1.415 2.646-2.247 4.42-2.247 3.105 0 5.63 2.49 5.63 5.554 0 6.373-7.453 13.112-10.036 13.16s-.01.002-.014.002zM7.58 4.924c-1.996 0-3.63 1.595-3.63 3.554 0 4.397 5.2 10.36 8.05 11.144 2.85-.784 8.05-6.747 8.05-11.144 0-1.959-1.634-3.554-3.63-3.554-1.464 0-2.827.917-3.376 2.272h-2.092C10.407 5.841 9.044 4.924 7.58 4.924z"></path>
                  )}
                </g>
              </svg>
            </div>
            <span className="text-xs">{image.likeCount || 0}</span>
          </button>

          {/* Views */}
          <div className="flex items-center gap-1.5 group">
            <div className="p-2 rounded-full">
              <svg viewBox="0 0 24 24" className="w-[18px] h-[18px] fill-current">
                <g><path d="M8.75 21V3h2v18h-2zM18 21V8.5h2V21h-2zM4 21v-6h2v6H4zM13.25 21V11h2v10h-2z"></path></g>
              </svg>
            </div>
            <span className="text-xs">{image.viewCount || 0}</span>
          </div>

          {/* Bookmark / Save */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSaveToggle(image);
              showToast(hasSaved ? 'Removed from Bookmarks' : 'Saved to Bookmarks');
            }}
            className={`p-2 rounded-full hover:bg-accent/10 hover:text-accent transition-colors outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${hasSaved ? 'text-accent' : ''}`}
          >
            <svg viewBox="0 0 24 24" className={`w-[18px] h-[18px] ${hasSaved ? 'fill-accent' : 'fill-current'}`}>
              <g>
                {hasSaved ? (
                  <path d="M4 4.5C4 3.12 5.119 2 6.5 2h11C18.881 2 20 3.12 20 4.5v18.44l-8-5.71-8 5.71V4.5z"></path>
                ) : (
                  <path d="M4 4.5C4 3.12 5.119 2 6.5 2h11C18.881 2 20 3.12 20 4.5v16.86l-7.482-4.68-7.518 4.7V4.5zM6.5 4c-.276 0-.5.224-.5.5v13.64l5.518-3.45L17 18.12V4.5c0-.276-.224-.5-.5-.5h-11z"></path>
                )}
              </g>
            </svg>
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              const shareUrl = `${window.location.origin}/image/${image.id}`;
              navigator.clipboard.writeText(shareUrl);
              showToast('Post link copied to clipboard!');
            }}
            className="p-2 rounded-full hover:bg-accent/10 hover:text-accent transition-colors outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          >
            <svg viewBox="0 0 24 24" className="w-[18px] h-[18px] fill-current">
              <g><path d="M12 2.59l5.7 5.7-1.41 1.42L13 6.41V16h-2V6.41L7.71 9.71 6.3 8.29 12 2.59zM21 15l-.02 3.51c0 1.38-1.12 2.49-2.5 2.49H5.5C4.11 21 3 19.88 3 18.5V15h2v3.5c0 .28.22.5.5.5h12.98c.28 0 .5-.22.5-.5L19 15h2z"></path></g>
            </svg>
          </button>
        </div>
      </div>

      {showEmbed && (
        <EmbedModal image={image} onClose={() => setShowEmbed(false)} />
      )}

      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4" onClick={(e) => e.stopPropagation()}>
          <div className="bg-surface border border-border p-6 rounded-2xl max-w-sm w-full text-center shadow-2xl animate-scale-up">
            <h3 className="text-xl font-bold text-primary mb-2">Delete Post?</h3>
            <p className="text-secondary text-sm mb-6">
              This action cannot be undone. This post will be permanently removed from Glass Gallery.
            </p>
            <div className="flex gap-3 justify-center">
              <Button variant="secondary" onClick={() => setShowDeleteConfirm(false)} disabled={isDeleting}>
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  setIsDeleting(true);
                  try {
                    await onImageDelete(image.id);
                  } finally {
                    setIsDeleting(false);
                    setShowDeleteConfirm(false);
                  }
                }}
                className="!bg-red-600 hover:!bg-red-700 text-white border-none"
                disabled={isDeleting}
              >
                {isDeleting ? <Spinner /> : 'Delete Forever'}
              </Button>
            </div>
          </div>
        </div>
      )}
      {toastMessage && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-accent text-white px-6 py-3 rounded-full shadow-2xl z-[100] animate-fade-in font-bold text-[15px] whitespace-nowrap">
          {toastMessage}
        </div>
      )}
    </article>
  );
}, (prevProps, nextProps) => {
  const prevBase = prevProps.image.id.split('_loop_')[0];
  const nextBase = nextProps.image.id.split('_loop_')[0];
  const uid = nextProps.user?.uid;
  const prevLiked = uid ? (prevProps.image.likedBy || []).includes(uid) : false;
  const nextLiked = uid ? (nextProps.image.likedBy || []).includes(uid) : false;
  const prevSaved = prevProps.savedImages.has(prevBase);
  const nextSaved = nextProps.savedImages.has(nextBase);

  return (
    prevBase === nextBase &&
    prevProps.image === nextProps.image &&
    prevLiked === nextLiked &&
    prevSaved === nextSaved &&
    prevProps.image.likeCount === nextProps.image.likeCount &&
    prevProps.image.downloadCount === nextProps.image.downloadCount &&
    prevProps.image.commentCount === nextProps.image.commentCount &&
    prevProps.user?.uid === nextProps.user?.uid
  );
});

const InfiniteFeed: React.FC<InfiniteFeedProps> = ({
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
  onImageDelete,
  onImageEdit,
  topicFilter,
  onClearTopicFilter,
  onEndReached,
  isFetchingNextPage,
  virtuosoRef,
  restoreStateFrom
}) => {
  return (
    <div className="w-full flex justify-center bg-background min-h-screen">
      <div className="w-full max-w-2xl border-l border-r border-border min-h-screen pb-20 md:pb-0">
        <div className="sticky top-0 z-10 bg-background/90 backdrop-blur-md border-b border-border">
          <div className="flex">
            {topicFilter ? (
              <div className="flex items-center gap-4 py-3 px-4 w-full">
                <button onClick={onClearTopicFilter} className="p-2 hover:bg-surface/50 rounded-full transition-colors text-primary">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
                  </svg>
                </button>
                <h1 className="text-xl font-bold text-primary truncate">Search: {topicFilter}</h1>
              </div>
            ) : (
              <>
                <button
                  className={`flex-1 pt-4 pb-3 text-[15px] font-bold hover:bg-surface/30 transition-colors relative ${feedTab === 'discover' ? 'text-primary' : 'text-secondary font-medium'}`}
                  onClick={() => setFeedTab('discover')}
                >
                  Discover
                  {feedTab === 'discover' && <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-16 h-1 bg-accent rounded-t-full"></div>}
                </button>
                <button
                  className={`flex-1 pt-4 pb-3 text-[15px] font-bold hover:bg-surface/30 transition-colors relative ${feedTab === 'following' ? 'text-primary' : 'text-secondary font-medium'}`}
                  onClick={() => {
                    if (!user) onLoginClick();
                    else setFeedTab('following');
                  }}
                >
                  Following
                  {feedTab === 'following' && <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-16 h-1 bg-accent rounded-t-full"></div>}
                </button>
              </>
            )}
          </div>
        </div>

        {!topicFilter && (
          <div className="flex gap-4 p-4 border-b border-border hover:bg-surface/30 cursor-text transition-colors" onClick={user ? onCreateClick : onLoginClick}>
            <img
              src={user?.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${user?.displayName || 'Guest'}`}
              alt="User"
              className="w-10 h-10 rounded-full object-cover shrink-0 cursor-pointer"
              loading="lazy"
              decoding="async"
            />
            <div className="flex-1 flex flex-col justify-center">
              <div className="text-[20px] text-secondary/70 font-medium">What is happening?!</div>
            </div>
            <button className="shrink-0 flex items-center justify-center w-9 h-9 rounded-full text-accent hover:bg-accent/10 transition-colors mt-0.5">
              <svg viewBox="0 0 24 24" className="w-[22px] h-[22px] fill-current"><g><path d="M3 5.5C3 4.119 4.119 3 5.5 3h13C19.881 3 21 4.119 21 5.5v13c0 1.381-1.119 2.5-2.5 2.5h-13C4.119 21 3 19.881 3 18.5v-13zM5.5 5c-.276 0-.5.224-.5.5v9.086l3-3 3 3 5-5 3 3V5.5c0-.276-.224-.5-.5-.5h-13zM19 15.414l-3-3-5 5-3-3-3 3V18.5c0 .276.224.5.5.5h13c.276 0 .5-.224.5-.5v-3.086zM9.75 7C8.784 7 8 7.784 8 8.75s.784 1.75 1.75 1.75 1.75-.784 1.75-1.75S10.716 7 9.75 7z"></path></g></svg>
            </button>
          </div>
        )}

        <Virtuoso
          ref={virtuosoRef}
          useWindowScroll
          data={images}
          restoreStateFrom={restoreStateFrom}
          endReached={onEndReached}
          itemContent={(index, image) => (
            <FeedItem
              key={`${image.id}_${index}`}
              image={image}
              user={user}
              onImageClick={onImageClick}
              onViewProfile={onViewProfile}
              onLikeToggle={onLikeToggle}
              onLoginClick={onLoginClick}
              savedImages={savedImages}
              onSaveToggle={onSaveToggle}
              onImageDelete={onImageDelete}
              onImageEdit={onImageEdit}
            />
          )}
          components={{
            Footer: () => (
              isFetchingNextPage ? (
                <div className="py-6 flex justify-center items-center">
                  <Spinner />
                </div>
              ) : null
            )
          }}
        />
      </div>
    </div>
  );
};

export default InfiniteFeed;
