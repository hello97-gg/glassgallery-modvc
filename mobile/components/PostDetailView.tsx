import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import type { User } from 'firebase/auth';
import { App as CapApp } from '@capacitor/app';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import type { ImageMeta, Comment, ProfileUser } from '../types';
import { 
  getCommentsForImage, 
  addCommentToImage, 
  toggleCommentLike, 
  editComment, 
  deleteComment, 
  getFollowStats, 
  toggleFollowUser 
} from '../services/firestoreService';
import { triggerLikeHaptic } from '../utils/haptics';
import { isVideoUrl, getRelatedImages } from '../utils/mediaUtils';
import Spinner from './Spinner';
import VideoPlayer from './VideoPlayer';
import { FeedItem } from './InfiniteFeed';
import { useLikeSave } from '../services/likeSaveStore';
import EmbedModal from './EmbedModal';

interface PostDetailViewProps {
  image: ImageMeta;
  user: User | null;
  suggestedImages: ImageMeta[];
  onClose: () => void;
  onViewProfile: (user: ProfileUser) => void;
  onLikeToggle: (image: ImageMeta) => void;
  onLoginClick: () => void;
  onImageClick: (image: ImageMeta) => void;
  savedImages: Set<string>;
  onSaveToggle: (image: ImageMeta) => void;
  onImageUpdate?: (image: ImageMeta) => void;
}

export const PostDetailView: React.FC<PostDetailViewProps> = ({
  image,
  user,
  suggestedImages,
  onClose,
  onViewProfile,
  onLikeToggle,
  onLoginClick,
  onImageClick,
  savedImages,
  onSaveToggle,
  onImageUpdate
}) => {
  const [history, setHistory] = useState<{ image: ImageMeta; scrollY: number }[]>([]);
  const [currentImage, setCurrentImage] = useState<ImageMeta>(image);
  const virtuosoRef = useRef<VirtuosoHandle>(null);

  // Recommendations state (fetched from /api/images?action=suggestions)
  const [recommendations, setRecommendations] = useState<ImageMeta[]>([]);
  const [recCursor, setRecCursor] = useState<string | null>(null);
  const [hasMoreRecs, setHasMoreRecs] = useState(true);
  const [isLoadingRecs, setIsLoadingRecs] = useState(true);
  const [isLoadingMoreRecs, setIsLoadingMoreRecs] = useState(false);
  const [showEmbedModal, setShowEmbedModal] = useState(false);

  // Linked Like & Save Store
  const { isLiked, isSaved, likeCount, toggle } = useLikeSave(currentImage, user as any);
  const isCombinedActive = isLiked || isSaved;

  const [flatComments, setFlatComments] = useState<Comment[]>([]);
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [newCommentText, setNewCommentText] = useState('');
  
  // Comment interaction states
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editCommentText, setEditCommentText] = useState('');
  const [isDeletingCommentId, setIsDeletingCommentId] = useState<string | null>(null);
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [collapsedComments, setCollapsedComments] = useState<Set<string>>(new Set());
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set());

  // Post meta & follow state
  const [isFollowing, setIsFollowing] = useState(false);
  const [isFollowLoading, setIsFollowLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isMainLoaded, setIsMainLoaded] = useState(false);
  const [isLikeAnimating, setIsLikeAnimating] = useState(false);

  const isCommunityOwner = Boolean(
    user?.uid && (
      currentImage.community_owner_uid === user.uid ||
      currentImage.is_owner
    )
  );
  const isCommunityMod = Boolean(
    user?.uid && (
      isCommunityOwner ||
      currentImage.viewer_community_role === 'moderator' ||
      currentImage.viewer_community_role === 'owner'
    )
  );
  const isPostOwner = Boolean(user?.uid && currentImage.uploaderUid === user.uid);
  const isSuperAdmin = Boolean(user?.uid && user.uid === 'i6yimUiehtQDt8M7Et2ERCA50B02');

  const [isCommunityMember, setIsCommunityMember] = useState(Boolean(currentImage.is_member || isCommunityOwner));
  const [isCommunityJoining, setIsCommunityJoining] = useState(false);

  useEffect(() => {
    setCurrentImage(image);
  }, [image.id]);

  useEffect(() => {
    setIsCommunityMember(Boolean(currentImage.is_member || isCommunityOwner));
  }, [currentImage.is_member, isCommunityOwner, currentImage.id]);

  // Register post stack back handler for central App.tsx hardware back button listener
  useEffect(() => {
    (window as any).__glassGalleryPostDetailBack = () => {
      if (history.length > 0) {
        const prev = history[history.length - 1];
        setCurrentImage(prev.image);
        setHistory(old => old.slice(0, -1));
        setTimeout(() => {
          virtuosoRef.current?.scrollTo({ top: prev.scrollY });
        }, 50);
        return true;
      }
      return false;
    };
    return () => {
      delete (window as any).__glassGalleryPostDetailBack;
    };
  }, [history]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleBack = () => {
    if (history.length > 0) {
      const prev = history[history.length - 1];
      setCurrentImage(prev.image);
      setHistory(old => old.slice(0, -1));
      setTimeout(() => {
        window.scrollTo({ top: prev.scrollY, behavior: 'instant' });
        virtuosoRef.current?.scrollTo({ top: prev.scrollY });
      }, 50);
    } else {
      onClose();
    }
  };

  const navigateToPost = (img: ImageMeta) => {
    const currentScrollY = window.scrollY || document.documentElement.scrollTop || 0;
    setHistory(prev => [...prev, { image: currentImage, scrollY: currentScrollY }]);
    window.scrollTo({ top: 0, behavior: 'instant' });
    virtuosoRef.current?.scrollTo({ top: 0 });
    setCurrentImage(img);
    onImageClick(img);
  };

  // Fetch full page of recommendations with cursor pagination and abort controller
  useEffect(() => {
    const controller = new AbortController();
    setIsLoadingRecs(true);
    setRecommendations([]);
    setRecCursor(null);
    setHasMoreRecs(true);

    const fetchRecs = async () => {
      try {
        const url = `/api/images?action=suggestions&imageId=${currentImage.id}&userUid=${user?.uid || ''}&limit=24`;
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error('Failed to load suggestions');
        const data = await res.json();
        if (data.success && Array.isArray(data.images)) {
          setRecommendations(data.images);
          setRecCursor(data.nextCursor || null);
          setHasMoreRecs(Boolean(data.hasMore));
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.warn('[PostDetailView] Error loading recommendations, falling back to feed:', err);
          const fallback = (suggestedImages || []).filter(img => img.id !== currentImage.id);
          if (fallback.length >= 10) {
            setRecommendations(fallback.slice(0, 24));
          } else {
            try {
              const feedRes = await fetch('/api/images?limit=24');
              const feedData = await feedRes.json();
              const feedImages = (feedData.images || []).filter((img: ImageMeta) => img.id !== currentImage.id);
              setRecommendations(feedImages.length > 0 ? feedImages : fallback);
            } catch {
              setRecommendations(fallback.slice(0, 24));
            }
          }
        }
      } finally {
        setIsLoadingRecs(false);
      }
    };

    fetchRecs();

    return () => {
      controller.abort();
    };
  }, [currentImage.id, user?.uid]);

  const loadMoreRecs = useCallback(async () => {
    if (isLoadingMoreRecs || !hasMoreRecs || !recCursor) return;
    setIsLoadingMoreRecs(true);
    try {
      const url = `/api/images?action=suggestions&imageId=${currentImage.id}&userUid=${user?.uid || ''}&limit=24&cursor=${recCursor}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success && Array.isArray(data.images) && data.images.length > 0) {
        setRecommendations(prev => {
          const ids = new Set(prev.map(img => img.id));
          const deduped = data.images.filter((img: ImageMeta) => !ids.has(img.id));
          return [...prev, ...deduped];
        });
        setRecCursor(data.nextCursor || null);
        setHasMoreRecs(Boolean(data.hasMore));
      } else {
        setHasMoreRecs(false);
      }
    } catch (err) {
      console.warn('[PostDetailView] Error paginating recommendations:', err);
    } finally {
      setIsLoadingMoreRecs(false);
    }
  }, [isLoadingMoreRecs, hasMoreRecs, recCursor, currentImage.id, user?.uid]);

  // Follow author stats
  useEffect(() => {
    if (!user || user.uid === currentImage.uploaderUid) {
      setIsFollowing(false);
      return;
    }
    let isMounted = true;
    getFollowStats(currentImage.uploaderUid, user.uid)
      .then(stats => {
        if (isMounted) setIsFollowing(stats.isFollowing);
      })
      .catch(() => {});
    return () => { isMounted = false; };
  }, [currentImage.uploaderUid, user?.uid]);

  const handleFollowToggle = async () => {
    if (!user) {
      onLoginClick();
      return;
    }
    if (user.uid === currentImage.uploaderUid) return;
    setIsFollowLoading(true);
    try {
      const res = await toggleFollowUser(user.uid, currentImage.uploaderUid);
      setIsFollowing(res.isFollowing);
      showToast(res.isFollowing ? `Followed @${currentImage.uploaderName}` : `Unfollowed @${currentImage.uploaderName}`);
    } catch {
      showToast('Error updating follow status');
    } finally {
      setIsFollowLoading(false);
    }
  };

  // Load comments whenever currentImage changes
  useEffect(() => {
    let isMounted = true;
    setIsLoadingComments(true);
    getCommentsForImage(currentImage.id)
      .then(cmts => {
        if (isMounted) setFlatComments(cmts);
      })
      .catch(() => {})
      .finally(() => {
        if (isMounted) setIsLoadingComments(false);
      });
    setReplyToId(null);
    setReplyText('');
    setNewCommentText('');
    setEditingCommentId(null);
    return () => { isMounted = false; };
  }, [currentImage.id]);

  const handleCommunityJoinToggle = async () => {
    if (!user) {
      onLoginClick();
      return;
    }
    if (!currentImage.community_id) return;
    if (isCommunityOwner) {
      showToast("You are the owner of this community.");
      return;
    }
    setIsCommunityJoining(true);
    try {
      const action = isCommunityMember ? 'leave' : 'join';
      const res = await fetch('/api/communities/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          communityId: currentImage.community_id,
          action,
          uid: user.uid
        })
      });
      const data = await res.json();
      if (data.success) {
        setIsCommunityMember(!isCommunityMember);
        showToast(isCommunityMember ? `Left c/${currentImage.community_slug}` : `Joined c/${currentImage.community_slug}!`);
      } else {
        showToast(data.error || 'Failed to update membership');
      }
    } catch {
      showToast('Error updating membership');
    } finally {
      setIsCommunityJoining(false);
    }
  };

  const handleLikeSaveToggle = async () => {
    if (!user) {
      onLoginClick();
      return;
    }
    setIsLikeAnimating(true);
    setTimeout(() => setIsLikeAnimating(false), 500);
    const updated = await toggle();
    if (updated && onImageUpdate) {
      onImageUpdate({
        ...currentImage,
        likeCount: updated.likeCount,
        likedBy: updated.isLiked 
          ? [...(currentImage.likedBy || []).filter(u => u !== user.uid), user.uid]
          : (currentImage.likedBy || []).filter(u => u !== user.uid),
        isLiked: updated.isLiked,
        isSaved: updated.isSaved
      });
    }
  };

  const handleShareClick = async () => {
    const postUrl = `https://gg.modvc.org/image/${currentImage.id.split('_loop_')[0]}`;
    if (Capacitor.isNativePlatform()) {
      try {
        await Share.share({
          title: currentImage.title || 'Glass Gallery Post',
          text: currentImage.description || `Check out this post on Glass Gallery`,
          url: postUrl,
          dialogTitle: 'Share Post'
        });
        return;
      } catch {}
    }
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: currentImage.title || 'Glass Gallery Post',
          text: currentImage.description || '',
          url: postUrl
        });
        return;
      } catch {}
    }
    try {
      await navigator.clipboard.writeText(postUrl);
      showToast('Link copied to clipboard!');
    } catch {
      showToast('Failed to copy link');
    }
  };

  // Top-level comment submission
  const handlePostComment = async () => {
    if (!newCommentText.trim()) return;
    if (!user) {
      onLoginClick();
      return;
    }
    setIsSubmittingComment(true);
    try {
      const newComment = await addCommentToImage(currentImage.id, user, newCommentText.trim());
      setFlatComments(prev => [...prev, newComment]);
      setNewCommentText('');
      const updated = { ...currentImage, commentCount: (currentImage.commentCount || 0) + 1 };
      setCurrentImage(updated);
      if (onImageUpdate) onImageUpdate(updated);
    } catch {
      showToast('Failed to post reply.');
    } finally {
      setIsSubmittingComment(false);
    }
  };

  // Nested reply submission
  const handlePostReply = async (parentId: string) => {
    if (!replyText.trim() || !user) return;
    setIsSubmittingComment(true);
    try {
      const newReply = await addCommentToImage(currentImage.id, user, replyText.trim(), parentId);
      setFlatComments(prev => [...prev, newReply]);
      setReplyText('');
      setReplyToId(null);
      // Auto expand replies for parent so the new reply is immediately visible
      setExpandedReplies(prev => new Set(prev).add(parentId));
      const updated = { ...currentImage, commentCount: (currentImage.commentCount || 0) + 1 };
      setCurrentImage(updated);
      if (onImageUpdate) onImageUpdate(updated);
    } catch {
      showToast('Failed to post reply.');
    } finally {
      setIsSubmittingComment(false);
    }
  };

  // Inline comment edit
  const handleEditSubmit = async (commentId: string) => {
    if (!editCommentText.trim() || !user) return;
    setIsSubmittingComment(true);
    try {
      await editComment(commentId, editCommentText.trim(), user.uid);
      setFlatComments(prev => prev.map(c => c.id === commentId ? { ...c, content: editCommentText.trim() } : c));
      setEditingCommentId(null);
      setEditCommentText('');
      showToast('Comment updated');
    } catch (err) {
      console.error("Failed to edit comment:", err);
      showToast('Failed to update comment.');
    } finally {
      setIsSubmittingComment(false);
    }
  };

  // Delete comment with confirm dialog
  const handleDeleteComment = async (commentId: string) => {
    if (!user) return;
    const confirmed = window.confirm("Are you sure you want to delete this reply?");
    if (!confirmed) return;
    setIsDeletingCommentId(commentId);
    try {
      await deleteComment(commentId, user.uid);
      setFlatComments(prev => prev.filter(c => c.id !== commentId && c.parentId !== commentId));
      const updated = {
        ...currentImage,
        commentCount: Math.max(0, (currentImage.commentCount || 1) - 1)
      };
      setCurrentImage(updated);
      if (onImageUpdate) onImageUpdate(updated);
      showToast('Comment deleted');
    } catch (err) {
      console.error("Failed to delete comment:", err);
      showToast('Failed to delete comment.');
    } finally {
      setIsDeletingCommentId(null);
    }
  };

  // Optimistic comment like toggle
  const handleCommentLikeToggle = async (commentId: string) => {
    if (!user) {
      onLoginClick();
      return;
    }
    // Optimistic local update
    setFlatComments(prev => prev.map(c => {
      if (c.id === commentId) {
        const liked = (c.likedBy || []).includes(user.uid);
        const newLikedBy = liked 
          ? (c.likedBy || []).filter(u => u !== user.uid) 
          : [...(c.likedBy || []), user.uid];
        return { 
          ...c, 
          likedBy: newLikedBy, 
          likeCount: Math.max(0, (c.likeCount || 0) + (liked ? -1 : 1)) 
        };
      }
      return c;
    }));

    try {
      await toggleCommentLike(commentId, user.uid);
    } catch (err) {
      console.error("Failed to toggle comment like:", err);
    }
  };

  const hasLiked = user && currentImage.likedBy?.includes(user.uid);
  const baseId = currentImage.id.split('_loop_')[0];
  const hasSaved = savedImages.has(baseId);
  const isTextOnly = !currentImage.imageUrl || currentImage.imageUrl === 'text://post' || currentImage.imageUrl.startsWith('text://');
  const isVideo = !isTextOnly && isVideoUrl(currentImage.imageUrl);

  const formatFullDate = (timestamp: any) => {
    if (!timestamp) return 'Just now';
    let date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp.seconds ? timestamp.seconds * 1000 : timestamp);
    if (isNaN(date.getTime())) return 'Just now';
    return date.toLocaleDateString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Build recursive multi-depth comment tree
  const treeComments = useMemo(() => {
    const commentMap: Record<string, Comment & { replies: Comment[] }> = {};
    const roots: (Comment & { replies: Comment[] })[] = [];

    flatComments.forEach(comment => {
      commentMap[comment.id] = { ...comment, replies: [] };
    });

    flatComments.forEach(comment => {
      const mapped = commentMap[comment.id];
      if (comment.parentId && commentMap[comment.parentId]) {
        commentMap[comment.parentId].replies.push(mapped);
      } else {
        roots.push(mapped);
      }
    });

    roots.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const sortRepliesRecursive = (node: Comment & { replies: Comment[] }) => {
      if (node.replies && node.replies.length > 0) {
        node.replies.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        node.replies.forEach(sortRepliesRecursive);
      }
    };
    roots.forEach(sortRepliesRecursive);

    return roots;
  }, [flatComments]);

  // Recommended feed posts
  const relatedImages = useMemo(() => {
    const currentBase = currentImage.id.split('_loop_')[0];
    const candidatePool = suggestedImages.filter(img => 
      img.id !== currentImage.id && 
      img.id.split('_loop_')[0] !== currentBase
    );
    if (currentImage.community_id) {
      const sameComm = candidatePool.filter(img => img.community_id === currentImage.community_id);
      if (sameComm.length >= 6) {
        return sameComm.slice(0, 12);
      }
      const others = getRelatedImages(
        currentImage, 
        candidatePool.filter(img => img.community_id !== currentImage.community_id), 
        12 - sameComm.length
      );
      return [...sameComm, ...others];
    }
    return getRelatedImages(currentImage, candidatePool, 12);
  }, [currentImage, suggestedImages]);

  // Render a single comment node with arbitrary depth, collapse, and inline reply/edit
  const renderCommentNode = (comment: Comment & { replies: Comment[] }, depth = 0, parentComment?: Comment): React.ReactNode => {
    const isReplying = replyToId === comment.id;
    const isEditing = editingCommentId === comment.id;
    const isCollapsed = collapsedComments.has(comment.id);
    const hasReplies = comment.replies && comment.replies.length > 0;
    const isRepliesExpanded = expandedReplies.has(comment.id) || depth === 0;
    
    // Depth styling: indent up to depth 5, then flatten indent
    const isIndented = depth > 0 && depth <= 5;
    const isFlattened = depth > 5;
    const isLiked = user ? (comment.likedBy || []).includes(user.uid) : false;

    const isCommentAuthor = Boolean(user?.uid && comment.userUid === user.uid);
    const canDelete = Boolean(user?.uid && (isCommentAuthor || isPostOwner || isCommunityOwner || isCommunityMod || isSuperAdmin));

    if (isCollapsed) {
      return (
        <div
          key={comment.id}
          onClick={() => setCollapsedComments(prev => {
            const next = new Set(prev);
            next.delete(comment.id);
            return next;
          })}
          className="text-xs text-secondary py-1.5 px-3 cursor-pointer hover:bg-surface/50 rounded-xl flex items-center gap-2 border border-border/50 my-1 bg-surface/30 select-none active:scale-[0.99] transition-all"
        >
          <span className="font-mono text-accent text-xs font-bold">[+]</span>
          <span>Thread by @{comment.userName.toLowerCase().replace(/\s+/g, '')} collapsed ({comment.replies?.length || 0} {comment.replies?.length === 1 ? 'reply' : 'replies'})</span>
        </div>
      );
    }

    return (
      <div
        key={comment.id}
        className={`flex flex-col gap-1.5 ${
          depth > 0
            ? (isIndented
                ? 'mt-2.5 pl-3 border-l-2 border-border/60 ml-2 sm:ml-3'
                : 'mt-2 pl-2 border-l border-accent/30 ml-0')
            : 'border-b border-border/40 pb-3 last:border-0 last:pb-0'
        }`}
      >
        <div className="flex gap-2.5 items-start">
          <img
            src={comment.userPhotoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${comment.userName}`}
            alt={comment.userName}
            className="w-8 h-8 rounded-full object-cover shrink-0 mt-0.5 border border-border/60"
          />
          <div className="flex-1 min-w-0">
            {/* Comment Header */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-bold text-xs text-primary truncate max-w-[130px] sm:max-w-[200px]">
                {comment.userName}
              </span>
              <span className="text-[11px] text-secondary truncate">
                @{comment.userName.toLowerCase().replace(/\s+/g, '')}
              </span>
              <span className="text-secondary text-[10px]">·</span>
              <span className="text-[10px] text-secondary">
                {new Date(comment.createdAt).toLocaleDateString()}
              </span>
              <button
                type="button"
                onClick={() => setCollapsedComments(prev => new Set(prev).add(comment.id))}
                title="Collapse thread"
                className="text-secondary/50 hover:text-secondary text-[11px] font-mono px-1 ml-auto min-h-[30px] flex items-center"
              >
                [-]
              </button>
            </div>

            {/* In deep threads, indicate parent mention context */}
            {isFlattened && parentComment && (
              <span className="text-[11px] text-accent/80 font-medium block mt-0.5">
                ↳ Replying to @{parentComment.userName.toLowerCase().replace(/\s+/g, '')}
              </span>
            )}

            {/* Comment Body or Inline Editor */}
            {isEditing ? (
              <div className="mt-2 flex flex-col gap-2">
                <textarea
                  value={editCommentText}
                  onChange={(e) => setEditCommentText(e.target.value)}
                  className="w-full bg-surface border border-border rounded-xl px-3 py-2 text-xs text-primary resize-none focus:outline-none focus:ring-1 focus:ring-accent"
                  rows={2}
                  autoFocus
                />
                <div className="flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingCommentId(null);
                      setEditCommentText('');
                    }}
                    className="text-xs text-secondary hover:text-primary px-3 py-1.5 font-medium min-h-[36px]"
                    disabled={isSubmittingComment}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => handleEditSubmit(comment.id)}
                    disabled={!editCommentText.trim() || isSubmittingComment}
                    className="bg-accent text-primary px-4 py-1.5 rounded-full text-xs font-bold hover:opacity-90 transition-opacity disabled:opacity-50 min-h-[36px]"
                  >
                    {isSubmittingComment ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-neutral-200 mt-1 leading-relaxed break-words whitespace-pre-wrap">
                {comment.content}
              </p>
            )}

            {/* Comment Actions (44px tap targets) */}
            <div className="flex items-center gap-3 mt-1.5">
              {/* Like on comment */}
              <button
                type="button"
                onClick={() => handleCommentLikeToggle(comment.id)}
                className={`flex items-center gap-1 text-[11px] min-h-[44px] px-1 transition-colors ${
                  isLiked ? 'text-accent font-bold' : 'text-secondary hover:text-primary'
                }`}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className={`h-3.5 w-3.5 ${isLiked ? 'text-accent fill-current' : 'fill-none'}`}
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
                <span>{comment.likeCount || 0}</span>
              </button>

              {/* Reply Button on EVERY comment */}
              <button
                type="button"
                onClick={() => {
                  if (isReplying) {
                    setReplyToId(null);
                    setReplyText('');
                  } else {
                    setReplyToId(comment.id);
                    setReplyText(isFlattened ? `@${comment.userName.toLowerCase().replace(/\s+/g, '')} ` : '');
                  }
                }}
                className="text-[11px] font-semibold text-secondary hover:text-accent transition-colors min-h-[44px] px-1 flex items-center"
              >
                Reply
              </button>

              {/* Edit Button (comment author only) */}
              {isCommentAuthor && !isEditing && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingCommentId(comment.id);
                    setEditCommentText(comment.content);
                  }}
                  className="text-[11px] text-secondary hover:text-primary font-semibold transition-colors min-h-[44px] px-1 flex items-center"
                >
                  Edit
                </button>
              )}

              {/* Delete Button (comment author, post owner, community owner/mod, or platform admin) */}
              {canDelete && (
                <button
                  type="button"
                  onClick={() => handleDeleteComment(comment.id)}
                  disabled={isDeletingCommentId === comment.id}
                  className="text-[11px] text-secondary hover:text-red-400 font-semibold transition-colors min-h-[44px] px-1 ml-auto flex items-center"
                  title="Delete reply"
                >
                  {isDeletingCommentId === comment.id ? 'Deleting...' : 'Delete'}
                </button>
              )}
            </div>

            {/* Inline Reply Composer directly under comment */}
            {isReplying && (
              <div className="mt-2 flex flex-col gap-2 p-2.5 rounded-xl bg-surface/50 border border-border animate-fade-in">
                <div className="flex gap-2 items-center">
                  <img
                    src={user?.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${user?.displayName || 'User'}`}
                    alt=""
                    className="w-6 h-6 rounded-full object-cover shrink-0"
                  />
                  <input
                    type="text"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder={`Reply to @${comment.userName.toLowerCase().replace(/\s+/g, '')}...`}
                    className="flex-1 bg-background border border-border rounded-xl px-3 py-2 text-xs text-primary focus:outline-none focus:ring-1 focus:ring-accent min-h-[40px]"
                    autoFocus
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setReplyToId(null);
                      setReplyText('');
                    }}
                    className="px-3 py-1.5 text-xs text-secondary hover:text-primary rounded-full min-h-[36px]"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePostReply(comment.id)}
                    disabled={!replyText.trim() || isSubmittingComment}
                    className="px-4 py-1.5 rounded-full bg-accent text-primary text-xs font-bold disabled:opacity-40 min-h-[36px] flex items-center justify-center active:scale-95 transition-all shadow-sm"
                  >
                    {isSubmittingComment ? 'Sending...' : 'Reply'}
                  </button>
                </div>
              </div>
            )}

            {/* Progressive Disclosure for Child Replies */}
            {hasReplies && (
              <div className="flex flex-col gap-1 mt-1">
                {!isRepliesExpanded ? (
                  <button
                    type="button"
                    onClick={() => setExpandedReplies(prev => new Set(prev).add(comment.id))}
                    className="flex items-center gap-2 text-xs text-accent font-semibold py-1.5 self-start min-h-[44px] transition-colors"
                  >
                    <span className="w-5 h-[1px] bg-accent/60 inline-block" />
                    <span>View {comment.replies.length} {comment.replies.length === 1 ? 'reply' : 'replies'}</span>
                  </button>
                ) : (
                  <>
                    {comment.replies.map(reply => renderCommentNode(reply, depth + 1, comment))}
                    {depth > 0 && (
                      <button
                        type="button"
                        onClick={() => setExpandedReplies(prev => {
                          const next = new Set(prev);
                          next.delete(comment.id);
                          return next;
                        })}
                        className="text-[11px] text-secondary hover:text-primary py-1 self-start min-h-[36px] flex items-center font-medium transition-colors"
                      >
                        Hide replies
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-background text-primary flex flex-col font-sans animate-fade-in overflow-y-auto">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 bg-accent text-primary px-4 py-2 rounded-full text-xs font-bold shadow-xl border border-white/20 animate-fade-in pointer-events-none">
          {toastMessage}
        </div>
      )}

      {/* Native Sticky Navigation Header */}
      <div 
        className="sticky top-0 z-40 bg-background/90 backdrop-blur-md border-b border-border px-3 py-2.5 flex items-center justify-between min-h-[50px]"
        style={{ paddingTop: 'calc(0.5rem + env(safe-area-inset-top, 0px))' }}
      >
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleBack}
            className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-surface/60 active:scale-95 transition-all text-primary"
            aria-label="Back"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <h1 className="text-lg font-bold tracking-tight">Post</h1>
        </div>

        {currentImage.community_slug && (
          <button
            type="button"
            onClick={() => {
              window.history.pushState(null, '', `/c/${currentImage.community_slug}`);
              window.dispatchEvent(new PopStateEvent('popstate'));
              onClose();
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface/80 border border-border text-xs font-bold text-primary active:scale-95 transition-all min-h-[36px]"
          >
            {currentImage.community_icon_url && (
              <img src={currentImage.community_icon_url} alt="" className="w-4 h-4 rounded-full object-cover" />
            )}
            <span>c/{currentImage.community_slug}</span>
          </button>
        )}
      </div>

      {/* Virtualized Page Scroll: Post Detail + Comments Header, followed by lazy-loaded recommendations */}
      <div className="flex-1 w-full max-w-xl mx-auto pb-24">
        <Virtuoso
          ref={virtuosoRef}
          useWindowScroll
          data={recommendations}
          endReached={loadMoreRecs}
          components={{
            Header: () => (
              <div className="px-4 py-3">
                {/* Community Context Bar if Post belongs to Community */}
                {currentImage.community_slug && (
                  <div className="flex items-center justify-between mb-3 px-3.5 py-2.5 rounded-xl bg-surface/50 border border-border/80">
                    <button
                      type="button"
                      onClick={() => {
                        window.history.pushState(null, '', `/c/${currentImage.community_slug}`);
                        window.dispatchEvent(new PopStateEvent('popstate'));
                        onClose();
                      }}
                      className="flex items-center gap-2 text-left group min-w-0"
                    >
                      {currentImage.community_icon_url ? (
                        <img src={currentImage.community_icon_url} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-accent/20 text-accent font-bold text-xs flex items-center justify-center shrink-0">
                          {currentImage.community_slug[0]?.toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-primary group-hover:text-accent transition-colors truncate">
                          c/{currentImage.community_slug}
                        </div>
                        {currentImage.community_name && (
                          <div className="text-[11px] text-secondary truncate">{currentImage.community_name}</div>
                        )}
                      </div>
                    </button>

                    {!isCommunityOwner && (
                      <button
                        type="button"
                        onClick={handleCommunityJoinToggle}
                        disabled={isCommunityJoining}
                        className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all min-h-[36px] flex items-center justify-center active:scale-95 ${
                          isCommunityMember
                            ? 'bg-surface border border-border text-primary hover:border-red-500/50 hover:text-red-400'
                            : 'bg-accent text-primary shadow-sm hover:opacity-90'
                        }`}
                      >
                        {isCommunityJoining ? '...' : (isCommunityMember ? 'Joined' : 'Join')}
                      </button>
                    )}
                    {isCommunityOwner && (
                      <span className="text-[11px] font-bold text-accent bg-accent/15 px-2.5 py-1 rounded-full border border-accent/20">
                        Owner
                      </span>
                    )}
                  </div>
                )}

                {/* Author Header Row */}
                <div className="flex items-center justify-between mb-3">
                  <div 
                    onClick={() => {
                      onViewProfile({
                        uploaderUid: currentImage.uploaderUid,
                        uploaderName: currentImage.uploaderName,
                        uploaderPhotoURL: currentImage.uploaderPhotoURL
                      });
                      onClose();
                    }}
                    className="flex items-center gap-3 cursor-pointer group"
                  >
                    <img
                      src={currentImage.uploaderPhotoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${currentImage.uploaderName}`}
                      alt={currentImage.uploaderName}
                      className="w-11 h-11 rounded-full object-cover border border-border group-hover:opacity-80 transition-opacity"
                    />
                    <div className="min-w-0">
                      <div className="text-[15px] font-bold text-primary group-hover:underline truncate">
                        {currentImage.uploaderName || 'Anonymous'}
                      </div>
                      <div className="text-xs text-secondary truncate">
                        @{currentImage.uploaderName.replace(/\s+/g, '').toLowerCase()}
                      </div>
                    </div>
                  </div>

                  {user && user.uid !== currentImage.uploaderUid && (
                    <button
                      type="button"
                      onClick={handleFollowToggle}
                      disabled={isFollowLoading}
                      className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all min-h-[36px] ${
                        isFollowing 
                          ? 'bg-surface border border-border text-primary' 
                          : 'bg-primary text-background'
                      }`}
                    >
                      {isFollowLoading ? '...' : (isFollowing ? 'Following' : 'Follow')}
                    </button>
                  )}
                </div>

                {/* Post Title */}
                {currentImage.title && (
                  <h2 className="text-lg md:text-xl font-bold text-primary mb-2.5 leading-snug">
                    {currentImage.title}
                  </h2>
                )}

                {/* Post Description / Body */}
                {currentImage.description && (
                  <div className="text-sm md:text-base text-neutral-200 leading-relaxed mb-4 whitespace-pre-line font-normal">
                    {currentImage.description}
                  </div>
                )}

                {/* Media Content */}
                {!isTextOnly && (
                  <div className="my-3 rounded-2xl overflow-hidden border border-border bg-black/40 relative shadow-lg">
                    {isVideo ? (
                      <VideoPlayer
                        src={currentImage.imageUrl}
                        poster={currentImage.thumbnailUrl}
                        className="w-full max-h-[75vh] object-contain rounded-2xl"
                      />
                    ) : (
                      <div className="relative w-full flex items-center justify-center bg-black/30 min-h-[220px]">
                        {!isMainLoaded && (
                          <div className="absolute inset-0 bg-surface/40 animate-pulse flex items-center justify-center">
                            <Spinner size="md" />
                          </div>
                        )}
                        <img
                          src={currentImage.imageUrl}
                          alt={currentImage.title || 'Post image'}
                          className="w-full max-h-[75vh] object-contain rounded-2xl transition-opacity duration-300"
                          style={{ opacity: isMainLoaded ? 1 : 0 }}
                          onLoad={() => setIsMainLoaded(true)}
                          loading="eager"
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Tags Row */}
                {currentImage.flags && currentImage.flags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 my-3">
                    {currentImage.flags.map(t => (
                      <span key={t} className="px-2.5 py-1 rounded-full bg-surface/70 border border-border/70 text-xs font-medium text-secondary">
                        #{t}
                      </span>
                    ))}
                  </div>
                )}

                {/* Full Date Timestamp */}
                <div className="py-2.5 border-b border-border/80 text-xs text-secondary flex items-center justify-between">
                  <span>{formatFullDate(currentImage.uploadedAt)}</span>
                  {currentImage.location && (
                    <span className="flex items-center gap-1">
                      <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                      </svg>
                      <span>{currentImage.location}</span>
                    </span>
                  )}
                </div>

                {/* Action Counters & Buttons Row (44px min touch targets) */}
                <div className="py-2 border-b border-border flex items-center justify-around">
                  {/* Like Button */}
                  <button
                    type="button"
                    onClick={handleLikeSaveToggle}
                    className="flex items-center gap-2 min-h-[44px] min-w-[44px] px-3 rounded-full hover:bg-surface/60 active:scale-95 transition-all text-secondary"
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
                    <span className={`text-xs font-bold ${isCombinedActive ? 'text-accent' : 'text-secondary'}`}>
                      {likeCount || 0}
                    </span>
                  </button>

                  {/* Comment Count */}
                  <div className="flex items-center gap-2 min-h-[44px] min-w-[44px] px-3 rounded-full text-secondary">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    <span className="text-xs font-bold text-secondary">{currentImage.commentCount || 0}</span>
                  </div>

                  {/* Share Button */}
                  <button
                    type="button"
                    onClick={handleShareClick}
                    className="flex items-center gap-1.5 min-h-[44px] min-w-[44px] px-3 rounded-full hover:bg-surface/60 active:scale-95 transition-all text-secondary"
                    style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
                    aria-label="Share"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                    </svg>
                  </button>

                  {/* Embed Button */}
                  <button
                    type="button"
                    onClick={() => setShowEmbedModal(true)}
                    className="flex items-center gap-1.5 min-h-[44px] min-w-[44px] px-3 rounded-full hover:bg-surface/60 active:scale-95 transition-all text-secondary"
                    style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
                    aria-label="Embed on website"
                    title="Embed code"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                    </svg>
                  </button>

                  {/* Save Button */}
                  <button
                    type="button"
                    onClick={handleLikeSaveToggle}
                    className="flex items-center gap-1.5 min-h-[44px] min-w-[44px] px-3 rounded-full hover:bg-surface/60 active:scale-95 transition-all text-secondary"
                    style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
                    aria-label="Save post"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 ${isCombinedActive ? 'text-accent fill-current' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                    </svg>
                  </button>
                </div>

                {/* Comments Section */}
                <div className="pt-4 pb-6">
                  <h3 className="text-sm font-bold text-secondary uppercase tracking-wider mb-3">
                    Replies ({flatComments.length})
                  </h3>

                  {isLoadingComments ? (
                    <div className="py-8 flex justify-center"><Spinner size="md" /></div>
                  ) : treeComments.length === 0 ? (
                    <div className="py-8 text-center text-xs text-secondary">
                      No replies yet. Be the first to share your thoughts!
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {treeComments.map(comment => renderCommentNode(comment, 0))}
                    </div>
                  )}
                </div>

                {/* Section Title for Recommendations */}
                <div className="pt-6 pb-2 border-t border-border">
                  <h2 className="text-base font-bold text-primary">
                    {currentImage.community_slug ? `More from c/${currentImage.community_slug}` : 'Discover more'}
                  </h2>
                </div>
                {isLoadingRecs && recommendations.length === 0 && (
                  <div className="py-8 flex justify-center">
                    <Spinner size="md" />
                  </div>
                )}
              </div>
            ),
            Footer: () => (
              isLoadingMoreRecs ? (
                <div className="py-6 flex justify-center">
                  <Spinner size="sm" />
                </div>
              ) : null
            )
          }}
          itemContent={(index, suggestedImg) => (
            <div key={suggestedImg.id} className="border-b border-border/60">
              <FeedItem
                image={suggestedImg}
                user={user}
                onImageClick={navigateToPost}
                onViewProfile={onViewProfile}
                onLikeToggle={onLikeToggle}
                onLoginClick={onLoginClick}
                savedImages={savedImages}
                onSaveToggle={onSaveToggle}
              />
            </div>
          )}
        />
      </div>

      {/* Sticky Bottom "Post your reply" Bar for top-level comments */}
      <div 
        className="fixed bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur-md border-t border-border px-3 py-2.5 flex items-center gap-2 max-w-xl mx-auto shadow-2xl"
        style={{ paddingBottom: 'calc(0.6rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <img
          src={user?.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${user?.displayName || 'User'}`}
          alt=""
          className="w-8 h-8 rounded-full object-cover shrink-0 border border-border"
        />
        <input
          type="text"
          value={newCommentText}
          onChange={(e) => setNewCommentText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handlePostComment();
            }
          }}
          placeholder="Post your reply..."
          className="flex-1 bg-surface/90 border border-border rounded-full px-4 py-2 text-xs text-primary focus:outline-none focus:ring-1 focus:ring-accent min-h-[44px]"
        />
        <button
          type="button"
          onClick={handlePostComment}
          disabled={isSubmittingComment || !newCommentText.trim()}
          className="px-4 py-2 rounded-full bg-accent text-primary text-xs font-bold disabled:opacity-40 min-h-[44px] flex items-center justify-center shrink-0 active:scale-95 transition-all shadow-sm"
        >
          {isSubmittingComment ? '...' : 'Reply'}
        </button>
      </div>

      {showEmbedModal && (
        <EmbedModal image={currentImage} onClose={() => setShowEmbedModal(false)} />
      )}
    </div>
  );
};
