import React, { useState, useRef, useEffect } from 'react';
import type { User } from 'firebase/auth';
import type { ImageMeta, ProfileUser } from '../../types';
import { observeImpression } from '../../services/impressionTracker';
import { isVideoUrl } from '../../utils/mediaUtils';
import { updateImageDetails, deleteImageFromFirestore } from '../../services/firestoreService';

interface CommunityPostCardProps {
  post: ImageMeta;
  user: User | null;
  communitySlug?: string;
  communityIconUrl?: string;
  onPostClick: (post: ImageMeta) => void;
  onViewProfile?: (user: ProfileUser) => void;
  onLikeToggle?: (post: ImageMeta) => void;
  onSaveToggle?: (post: ImageMeta) => void;
  isSaved?: boolean;
  isMod?: boolean;
  onPinToggle?: (post: ImageMeta) => void;
  onLockToggle?: (post: ImageMeta) => void;
  onDeletePost?: (post: ImageMeta) => void;
  onPostUpdated?: (updated: ImageMeta) => void;
}

const formatTimeAgo = (timestamp: any): string => {
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

  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
};

export const CommunityPostCard: React.FC<CommunityPostCardProps> = ({
  post,
  user,
  communitySlug,
  communityIconUrl,
  onPostClick,
  onViewProfile,
  onLikeToggle,
  onSaveToggle,
  isSaved = false,
  isMod = false,
  onPinToggle,
  onLockToggle,
  onDeletePost
}) => {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [isReporting, setIsReporting] = useState(false);

  const handleReportPost = async () => {
    setIsMenuOpen(false);
    if (!user) {
      alert('Please sign in to report this post.');
      return;
    }
    const reason = window.prompt('Reason for reporting this post to community moderators:', 'Spam or inappropriate content');
    if (!reason || !reason.trim()) return;

    setIsReporting(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/communities/reports', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          uid: user.uid,
          communityId: post.community_id,
          target_type: 'post',
          target_id: post.id,
          reason: reason.trim(),
          details: `Reported by @${user.displayName || 'user'}`
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to submit report.');
      }
      alert('Thank you for your report. Community moderators have received it in their queue.');
    } catch (err: any) {
      alert(err.message || 'Report submission failed.');
    } finally {
      setIsReporting(false);
    }
  };
  const [localLikeCount, setLocalLikeCount] = useState<number>(post.likeCount || 0);
  const [hasLiked, setHasLiked] = useState<boolean>(
    Boolean(post.isLiked || (user && post.likedBy && post.likedBy.includes(user.uid)))
  );

  // Edit post state
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(post.title || '');
  const [editDescription, setEditDescription] = useState(post.description || '');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const isAuthor = Boolean(user && post.uploaderUid === user.uid);
  const canManage = isAuthor || isMod;

  const cardRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Sync like count when post prop updates
  useEffect(() => {
    setLocalLikeCount(post.likeCount || 0);
    setHasLiked(Boolean(post.isLiked || (user && post.likedBy && post.likedBy.includes(user.uid))));
  }, [post.likeCount, post.likedBy, post.isLiked, user]);

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!editTitle.trim()) return;
    setIsSavingEdit(true);
    try {
      await updateImageDetails(post.id, {
        title: editTitle.trim(),
        description: editDescription.trim()
      });
      post.title = editTitle.trim();
      post.description = editDescription.trim();
      setIsEditing(false);
      if (onPostUpdated) {
        onPostUpdated({ ...post, title: editTitle.trim(), description: editDescription.trim() });
      }
    } catch (err: any) {
      alert(err.message || 'Failed to update post.');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDeleteClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsMenuOpen(false);
    if (!confirm('Are you sure you want to permanently delete this post?')) return;
    try {
      if (onDeletePost) {
        onDeletePost(post);
      } else {
        await deleteImageFromFirestore(post.id);
        window.location.reload();
      }
    } catch (err: any) {
      alert(err.message || 'Failed to delete post.');
    }
  };

  // Impression view tracking (MRC Standard)
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    return observeImpression(el, post.id);
  }, [post.id]);

  // Close 3-dots menu on outside click
  useEffect(() => {
    if (!isMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMenuOpen]);

  const isVideo = Boolean(isVideoUrl(post.imageUrl) || post.flags?.includes('Video'));
  const isText = Boolean(!post.imageUrl || post.imageUrl === 'text://post' || post.imageUrl.startsWith('text://'));

  const slug = post.community_slug || communitySlug || '';
  const uploaderUsername = post.uploaderName ? post.uploaderName.replace(/\s+/g, '').toLowerCase() : 'user';

  const handleCardClick = () => {
    onPostClick(post);
  };

  const handleAuthorClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onViewProfile) {
      onViewProfile({
        uploaderUid: post.uploaderUid,
        uploaderName: post.uploaderName,
        uploaderPhotoURL: post.uploaderPhotoURL
      });
    }
  };

  const handleCommunityClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (slug) {
      window.location.href = `/c/${slug}`;
    }
  };

  const handleLikeClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextLiked = !hasLiked;
    setHasLiked(nextLiked);
    setLocalLikeCount(prev => prev + (nextLiked ? 1 : -1));
    if (onLikeToggle) {
      onLikeToggle(post);
    }
  };

  const handleSaveClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onSaveToggle) {
      onSaveToggle(post);
    }
  };

  const handleCopyLink = (e: React.MouseEvent) => {
    e.stopPropagation();
    const url = `${window.location.origin}/image/${post.id}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedLink(true);
      setTimeout(() => {
        setCopiedLink(false);
        setIsMenuOpen(false);
      }, 1500);
    });
  };

  const tags = Array.isArray(post.flags) ? post.flags.filter(f => f && f !== 'Video' && f !== 'pinned' && f !== 'discussion') : [];

  return (
    <article
      ref={cardRef}
      onClick={handleCardClick}
      className={`group relative w-full rounded-2xl bg-surface/50 hover:bg-surface/75 backdrop-blur-md border border-border hover:border-accent/30 transition-all duration-200 cursor-pointer p-4 sm:p-5 shadow-sm overflow-visible ${
        isMenuOpen ? 'z-40' : 'z-0'
      }`}
    >
      {/* Pending Approval Banner (visible to poster & mods) */}
      {post.mod_status === 'pending_approval' && (
        <div className="mb-3 px-3.5 py-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-semibold flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <svg className="w-4 h-4 text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="truncate">Pending Moderator Approval — visible only to you & moderators</span>
          </div>
          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/40 shrink-0">
            Pending
          </span>
        </div>
      )}

      {/* 1. Header Row */}
      <div className="flex items-center justify-between gap-3 mb-2.5">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          {/* Community Icon & Slug */}
          {slug && (
            <button
              onClick={handleCommunityClick}
              className="flex items-center gap-1.5 group/comm hover:opacity-90 transition-opacity shrink-0"
              title={`c/${slug}`}
            >
              <div className="w-5 h-5 rounded-full overflow-hidden bg-accent/20 border border-border/80 flex items-center justify-center shrink-0">
                {post.community_icon_url || communityIconUrl ? (
                  <img
                    src={post.community_icon_url || communityIconUrl}
                    alt={slug}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-[10px] font-bold text-accent uppercase">
                    {slug.charAt(0)}
                  </span>
                )}
              </div>
              <span className="text-xs font-bold text-primary group-hover/comm:text-accent group-hover/comm:underline">
                c/{slug}
              </span>
            </button>
          )}

          <span className="text-xs text-secondary/60">·</span>

          {/* Author */}
          <div className="flex items-center gap-1 text-xs text-secondary min-w-0 truncate">
            <span>Posted by</span>
            <button
              onClick={handleAuthorClick}
              className="text-secondary hover:text-primary hover:underline font-medium truncate"
              title={`@${uploaderUsername}`}
            >
              @{uploaderUsername}
            </button>
          </div>

          <span className="text-xs text-secondary/60">·</span>

          {/* Relative Time */}
          <span className="text-xs text-secondary shrink-0" title={new Date(post.uploadedAt).toLocaleString()}>
            {formatTimeAgo(post.uploadedAt)}
          </span>

          {/* Badges: Pinned / Locked */}
          {post.is_pinned && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-accent/15 text-accent border border-accent/25 shrink-0">
              <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 18V4z" />
              </svg>
              <span>Pinned</span>
            </span>
          )}

          {post.is_locked && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-neutral-500/20 text-neutral-300 border border-neutral-500/30 shrink-0">
              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <span>Locked</span>
            </span>
          )}
        </div>

        {/* 3-dots Menu Button */}
        <div className="relative shrink-0" ref={menuRef}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsMenuOpen(!isMenuOpen);
            }}
            className="w-8 h-8 rounded-full flex items-center justify-center text-secondary hover:text-primary hover:bg-surface transition-colors"
            title="More actions"
            aria-label="More actions"
          >
            <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
              <circle cx="5" cy="12" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="19" cy="12" r="2" />
            </svg>
          </button>

          {isMenuOpen && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="absolute right-0 top-9 w-48 rounded-2xl bg-surface/95 backdrop-blur-xl border border-border shadow-2xl py-1.5 z-50 animate-fade-in"
            >
              <button
                onClick={handleCopyLink}
                className="w-full text-left px-3.5 py-2 text-xs font-medium text-primary hover:bg-background/80 flex items-center gap-2.5 transition-colors"
              >
                <svg className="w-4 h-4 text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
                <span>{copiedLink ? 'Copied Link!' : 'Copy Link'}</span>
              </button>

              <button
                onClick={(e) => {
                  handleSaveClick(e);
                  setIsMenuOpen(false);
                }}
                className="w-full text-left px-3.5 py-2 text-xs font-medium text-primary hover:bg-background/80 flex items-center gap-2.5 transition-colors"
              >
                <svg className="w-4 h-4 text-secondary" fill={isSaved ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                </svg>
                <span>{isSaved ? 'Remove from Saved' : 'Save Post'}</span>
              </button>

              <button
                onClick={handleReportPost}
                disabled={isReporting}
                className="w-full text-left px-3.5 py-2 text-xs font-medium text-secondary hover:text-red-400 hover:bg-background/80 flex items-center gap-2.5 transition-colors border-t border-border/40"
              >
                <svg className="w-4 h-4 text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
                </svg>
                <span>{isReporting ? 'Submitting Report...' : 'Report Post'}</span>
              </button>

              {/* Author / Mod Post Actions */}
              {(isAuthor || isMod) && (
                <>
                  <div className="my-1 border-t border-border/40" />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsMenuOpen(false);
                      setEditTitle(post.title || '');
                      setEditDescription(post.description || '');
                      setIsEditing(true);
                    }}
                    className="w-full text-left px-3.5 py-2 text-xs font-medium text-primary hover:bg-background/80 flex items-center gap-2.5 transition-colors"
                  >
                    <svg className="w-4 h-4 text-accent" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M14.06 9.02l.92.92L5.92 19H5v-.92l9.06-9.06M17.66 3c-.25 0-.51.1-.7.29l-1.83 1.83 3.75 3.75 1.83-1.83c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.2-.2-.45-.29-.71-.29zm-3.6 3.19L3 17.25V21h3.75L17.81 9.94l-3.75-3.75z" />
                    </svg>
                    <span>Edit Post</span>
                  </button>

                  <button
                    onClick={handleDeleteClick}
                    className="w-full text-left px-3.5 py-2 text-xs font-medium text-red-400 hover:bg-red-500/10 flex items-center gap-2.5 transition-colors"
                  >
                    <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    <span>Delete Post</span>
                  </button>
                </>
              )}

              {/* Mod Controls */}
              {isMod && (
                <>
                  <div className="my-1 border-t border-border/40" />
                  <div className="px-3 py-1 text-[10px] font-bold text-accent uppercase tracking-wider">
                    Mod Controls
                  </div>

                  {onPinToggle && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsMenuOpen(false);
                        onPinToggle(post);
                      }}
                      className="w-full text-left px-3.5 py-1.5 text-xs text-primary hover:bg-background/80 flex items-center gap-2 transition-colors"
                    >
                      <svg className="w-3.5 h-3.5 text-accent" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 18V4z" />
                      </svg>
                      <span>{post.is_pinned ? 'Unpin Post' : 'Pin to Top'}</span>
                    </button>
                  )}

                  {onLockToggle && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsMenuOpen(false);
                        onLockToggle(post);
                      }}
                      className="w-full text-left px-3.5 py-1.5 text-xs text-primary hover:bg-background/80 flex items-center gap-2 transition-colors"
                    >
                      <svg className="w-3.5 h-3.5 text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                      <span>{post.is_locked ? 'Unlock Comments' : 'Lock Comments'}</span>
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 2. Title */}
      {post.title && (
        <h2 className="text-base sm:text-lg font-bold text-primary mb-2 line-clamp-2 leading-snug group-hover:text-accent transition-colors">
          {post.title}
        </h2>
      )}

      {/* 3. Body: Text / Video / Image */}
      {isText ? (
        // Text Post
        post.description ? (
          <div className="relative mb-3">
            <p className="text-sm text-neutral-300 line-clamp-4 leading-relaxed font-normal whitespace-pre-line">
              {post.description}
            </p>
            <div className="absolute bottom-0 inset-x-0 h-6 bg-gradient-to-t from-surface via-surface/60 to-transparent pointer-events-none" />
            <span className="text-xs text-accent font-semibold hover:underline mt-1 inline-block">
              Read more &rarr;
            </span>
          </div>
        ) : null
      ) : isVideo ? (
        // Video Post
        <div className="relative my-2.5 rounded-2xl overflow-hidden max-h-[512px] bg-black/60 border border-border/50 flex items-center justify-center group/video">
          <video
            src={post.imageUrl}
            preload="metadata"
            className="w-full max-h-[512px] object-contain pointer-events-none"
          />
          <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover/video:bg-black/10 transition-colors">
            <div className="w-14 h-14 rounded-full bg-black/60 backdrop-blur-md border border-white/20 flex items-center justify-center text-white shadow-xl group-hover/video:scale-110 transition-transform">
              <svg className="w-6 h-6 ml-0.5 fill-current" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </div>
        </div>
      ) : (
        // Image Post
        <div className="relative my-2.5 rounded-2xl overflow-hidden max-h-[512px] bg-black/40 border border-border/40 flex items-center justify-center">
          {imageError ? (
            <div className="w-full h-44 sm:h-56 rounded-2xl bg-surface/40 flex flex-col items-center justify-center text-secondary gap-2 p-4">
              <svg className="w-8 h-8 text-secondary/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="text-xs font-medium text-secondary">Image preview unavailable</span>
            </div>
          ) : (
            <>
              {/* Skeleton loading indicator */}
              {!imageLoaded && (
                <div className="absolute inset-0 bg-surface/50 animate-pulse flex items-center justify-center min-h-[220px]">
                  <div className="w-7 h-7 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                </div>
              )}

              {/* Blurred backdrop for tall or panoramic images */}
              <div
                className="absolute inset-0 bg-cover bg-center blur-2xl opacity-30 scale-110 pointer-events-none"
                style={{ backgroundImage: `url(${post.thumbnailUrl || post.imageUrl})` }}
              />

              {/* Main image */}
              <img
                src={post.imageUrl}
                alt={post.title || 'Community post'}
                decoding="async"
                onLoad={() => setImageLoaded(true)}
                onError={() => setImageError(true)}
                className={`relative z-10 w-full max-h-[512px] object-contain transition-opacity duration-300 ${
                  imageLoaded ? 'opacity-100' : 'opacity-0'
                }`}
              />
            </>
          )}
        </div>
      )}

      {/* 4. Tag Chips */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 my-2.5">
          {tags.map((t, idx) => (
            <span
              key={idx}
              className="text-[11px] font-medium text-secondary bg-surface/80 border border-border px-2.5 py-0.5 rounded-full hover:border-accent/40 transition-colors"
            >
              #{t}
            </span>
          ))}
        </div>
      )}

      {/* 5. Action Bar (Touch-friendly, at least 44px tap target) */}
      <div className="flex items-center gap-2 pt-2 border-t border-border/40 text-xs text-secondary mt-2 flex-wrap">
        {/* Like Button */}
        <button
          onClick={handleLikeClick}
          className={`min-h-[44px] px-3.5 rounded-full bg-surface/60 hover:bg-surface border border-border/60 transition-colors flex items-center gap-2 font-semibold ${
            hasLiked ? 'text-accent border-accent/40' : 'hover:text-accent'
          }`}
          aria-label={hasLiked ? 'Unlike post' : 'Like post'}
        >
          <svg
            className={`w-4 h-4 ${hasLiked ? 'text-accent fill-current' : 'fill-none stroke-current'}`}
            viewBox="0 0 24 24"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
          <span>{localLikeCount}</span>
        </button>

        {/* Comment Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onPostClick(post);
          }}
          className="min-h-[44px] px-3.5 rounded-full bg-surface/60 hover:bg-surface border border-border/60 hover:text-primary transition-colors flex items-center gap-2 font-semibold"
          aria-label="Comments"
        >
          <svg className="w-4 h-4 fill-none stroke-current" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <span>{post.commentCount || 0}</span>
        </button>

        {/* Share Button */}
        <button
          onClick={handleCopyLink}
          className="min-h-[44px] px-3.5 rounded-full bg-surface/60 hover:bg-surface border border-border/60 hover:text-primary transition-colors flex items-center gap-2 font-semibold"
          aria-label="Share post"
        >
          <svg className="w-4 h-4 fill-none stroke-current" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
          </svg>
          <span>{copiedLink ? 'Copied!' : 'Share'}</span>
        </button>

        {/* Save Button */}
        <button
          onClick={handleSaveClick}
          className={`min-h-[44px] px-3.5 rounded-full bg-surface/60 hover:bg-surface border border-border/60 transition-colors flex items-center gap-2 font-semibold ${
            isSaved ? 'text-accent border-accent/40' : 'hover:text-primary'
          }`}
          aria-label={isSaved ? 'Remove from saved' : 'Save post'}
        >
          <svg
            className={`w-4 h-4 ${isSaved ? 'text-accent fill-current' : 'fill-none stroke-current'}`}
            viewBox="0 0 24 24"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
          </svg>
          <span>{isSaved ? 'Saved' : 'Save'}</span>
        </button>
      </div>

      {/* Edit Post Modal */}
      {isEditing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in"
          onClick={(e) => {
            e.stopPropagation();
            setIsEditing(false);
          }}
        >
          <div
            className="w-full max-w-lg rounded-3xl bg-surface/95 border border-border p-6 shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-primary">Edit Post</h3>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="text-secondary hover:text-primary text-xl leading-none p-1"
                aria-label="Close"
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-secondary uppercase tracking-wider mb-1.5">
                  Title
                </label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  maxLength={300}
                  className="w-full px-4 py-2.5 rounded-xl bg-background/60 border border-border text-sm text-primary placeholder-secondary focus:border-accent focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-secondary uppercase tracking-wider mb-1.5">
                  Content / Description
                </label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={4}
                  className="w-full px-4 py-2.5 rounded-xl bg-background/60 border border-border text-sm text-primary placeholder-secondary focus:border-accent focus:outline-none resize-none"
                />
              </div>
              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-secondary hover:text-primary hover:bg-surface border border-border transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit || !editTitle.trim()}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-accent text-surface hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {isSavingEdit ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </article>
  );
};

export default React.memo(CommunityPostCard);

