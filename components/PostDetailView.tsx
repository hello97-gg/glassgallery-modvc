import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { User } from 'firebase/auth';
import type { ImageMeta, Comment, ProfileUser } from '../types';
import { getCommentsForImage, addCommentToImage, toggleCommentLike } from '../services/firestoreService';
import { recordWatchInterest } from '../services/interestTracker';
import { isVideoUrl } from '../utils/mediaUtils';
import Spinner from './Spinner';
import { FeedItem } from './InfiniteFeed';

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
}

const PostDetailView: React.FC<PostDetailViewProps> = ({
  image,
  user,
  suggestedImages,
  onClose,
  onViewProfile,
  onLikeToggle,
  onLoginClick,
  onImageClick,
  savedImages,
  onSaveToggle
}) => {
  const [currentImage, setCurrentImage] = useState<ImageMeta>(image);
  const [flatComments, setFlatComments] = useState<Comment[]>([]);
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [newCommentText, setNewCommentText] = useState('');
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const watchLoggedRef = useRef(false);

  const handleVideoTimeUpdate = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = e.currentTarget;
    if (video.duration && !watchLoggedRef.current) {
      const ratio = video.currentTime / video.duration;
      if (ratio >= 0.5) {
        watchLoggedRef.current = true;
        recordWatchInterest(currentImage, ratio);
      }
    }
  };

  const hasLiked = user && currentImage.likedBy?.includes(user.uid);

  // Parse time/date safely to avoid NaNs
  const formatFullDate = (timestamp: any) => {
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

    return date.toLocaleDateString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const loadComments = async () => {
    setIsLoadingComments(true);
    try {
      const data = await getCommentsForImage(currentImage.id);
      setFlatComments(data);
    } catch (err) {
      console.error("Failed to load comments:", err);
    } finally {
      setIsLoadingComments(false);
    }
  };

  useEffect(() => {
    // Scroll to top on load for full page view!
    window.scrollTo({ top: 0, behavior: 'smooth' });
    loadComments();
    setReplyToId(null);
    setReplyText('');
    setNewCommentText('');
    setCurrentImage(image);
  }, [image.id]);

  const treeComments = useMemo(() => {
    const commentMap: Record<string, Comment & { replies: Comment[] }> = {};
    const roots: Comment[] = [];

    flatComments.forEach(comment => {
      commentMap[comment.id] = { ...comment, replies: [] };
    });

    flatComments.forEach(comment => {
      const mappedComment = commentMap[comment.id];
      if (comment.parentId && commentMap[comment.parentId]) {
        commentMap[comment.parentId].replies.push(mappedComment);
      } else {
        roots.push(mappedComment);
      }
    });

    roots.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const sortRepliesRecursive = (c: Comment) => {
      if (c.replies && c.replies.length > 0) {
        c.replies.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        c.replies.forEach(sortRepliesRecursive);
      }
    };
    roots.forEach(sortRepliesRecursive);

    return roots;
  }, [flatComments]);

  const handlePostComment = async () => {
    if (!newCommentText.trim()) return;
    if (!user) {
      onLoginClick();
      return;
    }
    setIsSubmittingComment(true);
    try {
      const newComment = await addCommentToImage(currentImage.id, user, newCommentText);
      setFlatComments(prev => [...prev, newComment]);
      setNewCommentText('');
      setCurrentImage(prev => ({
        ...prev,
        commentCount: (prev.commentCount || 0) + 1
      }));
    } catch (err) {
      console.error("Failed to post comment:", err);
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const handlePostReply = async (parentId: string) => {
    if (!replyText.trim()) return;
    if (!user) {
      onLoginClick();
      return;
    }
    setIsSubmittingComment(true);
    try {
      const newReply = await addCommentToImage(currentImage.id, user, replyText, parentId);
      setFlatComments(prev => [...prev, newReply]);
      setReplyText('');
      setReplyToId(null);
      setCurrentImage(prev => ({
        ...prev,
        commentCount: (prev.commentCount || 0) + 1
      }));
    } catch (err) {
      console.error("Failed to post reply:", err);
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const handleCommentLikeToggle = async (commentId: string) => {
    if (!user) {
      onLoginClick();
      return;
    }

    setFlatComments(prev => prev.map(c => {
      if (c.id === commentId) {
        const isLiked = c.likedBy?.includes(user.uid);
        return {
          ...c,
          likeCount: isLiked ? Math.max(0, (c.likeCount || 0) - 1) : (c.likeCount || 0) + 1,
          likedBy: isLiked ? (c.likedBy || []).filter(uid => uid !== user.uid) : [...(c.likedBy || []), user.uid]
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

  const handleLocalLikeToggle = () => {
    if (!user) {
      onLoginClick();
      return;
    }

    onLikeToggle(currentImage);

    setCurrentImage(prev => {
      const isLiked = prev.likedBy?.includes(user.uid);
      return {
        ...prev,
        likeCount: isLiked ? Math.max(0, (prev.likeCount || 0) - 1) : (prev.likeCount || 0) + 1,
        likedBy: isLiked ? (prev.likedBy || []).filter(uid => uid !== user.uid) : [...(prev.likedBy || []), user.uid]
      };
    });
  };

  const renderCommentNode = (comment: Comment, depth = 0) => {
    const isReplying = replyToId === comment.id;
    const avatarUrl = comment.userPhotoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${comment.userName}`;

    return (
      <div
        key={comment.id}
        className={`flex flex-col gap-2 ${
          depth > 0
            ? `mt-3 pl-3 border-l border-border/50 ml-2.5`
            : 'border-b border-border/40 pb-4 last:border-0 last:pb-0'
        }`}
      >
        <div className="flex gap-3 items-start px-4">
          <img
            src={avatarUrl}
            alt={comment.userName}
            className="w-9 h-9 rounded-full object-cover flex-shrink-0"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="font-bold text-sm text-primary">{comment.userName}</span>
              <span className="text-xs text-secondary">
                @{comment.userName.toLowerCase().replace(/\s+/g, '')}
              </span>
              <span className="text-secondary text-xs">·</span>
              <span className="text-[11px] text-secondary">
                {new Date(comment.createdAt).toLocaleDateString()}
              </span>
            </div>
            <p className="text-[14px] text-primary mt-1 leading-normal break-words">{comment.content}</p>

            <div className="flex items-center mt-2 gap-4">
              <button
                onClick={() => handleCommentLikeToggle(comment.id)}
                className={`flex items-center gap-1.5 text-xs transition-colors ${
                  comment.likedBy?.includes(user?.uid || '')
                    ? 'text-red-500 hover:text-red-600 font-bold'
                    : 'text-secondary hover:text-primary'
                }`}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4 fill-current"
                  viewBox="0 0 24 24"
                >
                  <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                </svg>
                {comment.likeCount || 0}
              </button>

              <button
                onClick={() => {
                  setReplyToId(isReplying ? null : comment.id);
                  setReplyText('');
                }}
                className="text-xs text-secondary hover:text-accent font-semibold transition-colors flex items-center gap-1.5"
              >
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  className="w-4 h-4 fill-current"
                >
                  <g>
                    <path d="M1.751 10c0-4.42 3.584-8 8.005-8h4.366c4.49 0 8.129 3.64 8.129 8.13 0 2.96-1.607 5.68-4.196 7.11l-8.054 4.46v-3.69h-.067c-4.49.1-8.183-3.51-8.183-8.01zm8.005-6c-3.317 0-6.005 2.69-6.005 6 0 3.37 2.77 6.08 6.138 6.01l.351-.01h1.761v2.3l5.087-2.81c1.951-1.08 3.163-3.13 3.163-5.36 0-3.39-2.744-6.13-6.129-6.13H9.756z" />
                  </g>
                </svg>
                Reply
              </button>
            </div>
          </div>
        </div>

        {isReplying && (
          <div className="flex gap-3 items-start pl-12 mt-2 pr-4 animate-fade-in">
            <img
              src={user?.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${user?.displayName || 'User'}`}
              alt="Current user"
              className="w-8 h-8 rounded-full object-cover flex-shrink-0"
            />
            <div className="flex-1 flex flex-col gap-2">
              <textarea
                placeholder={`Post your reply to @${comment.userName.toLowerCase().replace(/\s+/g, '')}...`}
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                rows={2}
                className="w-full bg-transparent border border-border focus:border-accent rounded-xl py-2 px-3 text-sm text-primary placeholder-secondary focus:outline-none focus:ring-1 focus:ring-accent resize-none transition-all"
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => {
                    setReplyToId(null);
                    setReplyText('');
                  }}
                  className="px-3 py-1 text-xs font-bold text-secondary hover:text-primary rounded-full hover:bg-border/30 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handlePostReply(comment.id)}
                  disabled={!replyText.trim() || isSubmittingComment}
                  className="bg-accent hover:opacity-90 disabled:opacity-50 text-surface font-semibold px-4 py-1 rounded-full text-xs transition-all flex items-center gap-1"
                >
                  {isSubmittingComment ? <Spinner /> : 'Reply'}
                </button>
              </div>
            </div>
          </div>
        )}

        {comment.replies &&
          comment.replies.map(reply => renderCommentNode(reply, depth + 1))}
      </div>
    );
  };

  return (
    <div className="w-full flex justify-center bg-background min-h-screen">
       <div className="w-full max-w-2xl border-l border-r border-border min-h-screen pb-20 md:pb-0 bg-background flex flex-col">
          {/* Sticky Header */}
          <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border flex items-center gap-6 px-4 py-3 cursor-pointer" onClick={onClose}>
            <button onClick={onClose} className="text-secondary hover:text-primary transition-colors">
              <svg viewBox="0 0 24 24" aria-hidden="true" className="w-5 h-5 fill-current">
                <g>
                  <path d="M7.414 13l5.086 5.086-1.414 1.414L2.586 11 11.086 2.586 12.5 4l-5.086 5H22v2H7.414z" />
                </g>
              </svg>
            </button>
            <h1 className="text-xl font-bold text-primary">Post</h1>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 overflow-y-visible">
            {/* User Info */}
            <div className="flex items-center gap-3 px-4 pt-4">
              <img
                src={
                  currentImage.uploaderPhotoURL ||
                  `https://api.dicebear.com/7.x/initials/svg?seed=${currentImage.uploaderName}`
                }
                alt={currentImage.uploaderName}
                className="w-12 h-12 rounded-full object-cover cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => {
                  onViewProfile({
                    uploaderUid: currentImage.uploaderUid,
                    uploaderName: currentImage.uploaderName,
                    uploaderPhotoURL: currentImage.uploaderPhotoURL
                  });
                }}
              />
              <div className="flex flex-col min-w-0">
                <span
                  className="font-bold text-[16px] text-primary hover:underline cursor-pointer truncate"
                  onClick={() => {
                    onViewProfile({
                      uploaderUid: currentImage.uploaderUid,
                      uploaderName: currentImage.uploaderName,
                      uploaderPhotoURL: currentImage.uploaderPhotoURL
                    });
                  }}
                >
                  {currentImage.uploaderName}
                </span>
                <span className="text-[14px] text-secondary truncate">
                  @{currentImage.uploaderName.toLowerCase().replace(/\s+/g, '')}
                </span>
              </div>
            </div>

            {/* Text content */}
            <div className="text-[17px] text-primary whitespace-pre-wrap break-words px-4 pt-4 leading-normal">
              {currentImage.title && <h2 className="font-bold text-lg mb-1">{currentImage.title}</h2>}
              {currentImage.description && <p className="text-primary/95">{currentImage.description}</p>}
            </div>

            {/* Image/Video */}
            <div className="rounded-2xl border border-border overflow-hidden max-h-[500px] mx-4 mt-4 bg-black/5">
              {isVideoUrl(currentImage.imageUrl) ? (
                  <video 
                    src={currentImage.imageUrl} 
                    autoPlay 
                    muted 
                    loop 
                    playsInline onTimeUpdate={handleVideoTimeUpdate} 
                    controls
                    className="w-full h-full object-contain max-h-[500px] bg-black/40"
                  />
              ) : (
                  <img
                    src={currentImage.imageUrl}
                    alt={currentImage.title || 'Image Detail'}
                    className="w-full h-full object-contain max-h-[500px] bg-black/40"
                  />
              )}
            </div>

            {/* Meta Details Row (Time, Date, Views) */}
            <div className="py-3 px-4 text-[15px] text-secondary flex flex-wrap gap-1.5 items-center">
              <span>{formatFullDate(currentImage.uploadedAt)}</span>
              <span>·</span>
              <span className="font-bold text-primary">{currentImage.viewCount || 0}</span>
              <span>Views</span>
            </div>

            <div className="h-px bg-border mx-4" />

            {/* Interactions Counters */}
            <div className="py-3 px-4 flex gap-6 text-[15px] text-secondary">
              <span>
                <strong className="text-primary font-bold">{currentImage.commentCount || 0}</strong> Replies
              </span>
              <span>
                <strong className="text-primary font-bold">{currentImage.likeCount || 0}</strong> Likes
              </span>
            </div>

            <div className="h-px bg-border mx-4" />

            {/* Twitter Action Row (Icons) */}
            <div className="py-1 px-4 flex justify-around text-secondary">
              {/* Like */}
              <button
                onClick={handleLocalLikeToggle}
                className={`flex items-center gap-1.5 group transition-colors ${
                  hasLiked ? 'text-red-500' : 'hover:text-red-500'
                }`}
              >
                <div className="w-10 h-10 rounded-full flex items-center justify-center group-hover:bg-red-500/10 transition-colors">
                  {hasLiked ? (
                    <svg viewBox="0 0 24 24" aria-hidden="true" className="w-[22px] h-[22px] fill-current">
                      <g>
                        <path d="M20.884 13.19c-1.351 2.48-4.001 5.12-8.379 7.67l-.503.3-.504-.3c-4.379-2.55-7.029-5.19-8.382-7.67-1.36-2.5-1.41-4.86-.514-6.67.887-1.79 2.647-2.91 4.601-3.01 1.651-.09 3.368.56 4.798 2.01 1.429-1.45 3.146-2.1 4.796-2.01 1.954.1 3.714 1.22 4.601 3.01.896 1.81.846 4.17-.514 6.67z" />
                      </g>
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" aria-hidden="true" className="w-[22px] h-[22px] fill-current">
                      <g>
                        <path d="M16.697 5.5c-1.222-.06-2.679.51-3.89 2.16l-.805 1.09-.806-1.09C9.984 6.01 8.526 5.44 7.304 5.5c-1.243.07-2.349.78-2.91 1.91-.552 1.12-.633 2.78.479 4.82 1.074 1.97 3.257 4.27 7.129 6.61 3.87-2.34 6.052-4.64 7.126-6.61 1.111-2.04 1.03-3.7.477-4.82-.561-1.13-1.666-1.84-2.908-1.91zm4.187 7.69c-1.351 2.48-4.001 5.12-8.379 7.67l-.503.3-.504-.3c-4.379-2.55-7.029-5.19-8.382-7.67-1.36-2.5-1.41-4.86-.514-6.67.887-1.79 2.647-2.91 4.601-3.01 1.651-.09 3.368.56 4.798 2.01 1.429-1.45 3.146-2.1 4.796-2.01 1.954.1 3.714 1.22 4.601 3.01.896 1.81.846 4.17-.514 6.67z" />
                      </g>
                    </svg>
                  )}
                </div>
              </button>
            </div>

            <div className="h-px bg-border mx-4" />

            {/* Add Reply Input Box */}
            <div className="flex gap-3 py-4 items-start px-4">
              <img
                src={
                  user?.photoURL ||
                  `https://api.dicebear.com/7.x/initials/svg?seed=${user?.displayName || 'User'}`
                }
                alt="Current user"
                className="w-10 h-10 rounded-full object-cover flex-shrink-0"
              />
              <div className="flex-1 flex flex-col gap-2">
                <textarea
                  placeholder="Post your reply"
                  value={newCommentText}
                  onChange={e => setNewCommentText(e.target.value)}
                  rows={2}
                  className="w-full bg-transparent border-0 py-2 px-0 text-[17px] text-primary placeholder-secondary focus:outline-none resize-none"
                />
                <div className="flex justify-end">
                  <button
                    onClick={handlePostComment}
                    disabled={!newCommentText.trim() || isSubmittingComment}
                    className="bg-accent hover:opacity-90 disabled:opacity-50 text-surface font-semibold px-4 py-1.5 rounded-full text-[15px] transition-all active:scale-95 flex items-center gap-1 shadow"
                  >
                    {isSubmittingComment ? <Spinner /> : 'Reply'}
                  </button>
                </div>
              </div>
            </div>

            <div className="h-px bg-border" />

            {/* Comments List Section */}
            <div className="pt-2 pb-6 space-y-4">
              {isLoadingComments ? (
                <div className="flex justify-center p-6">
                  <Spinner />
                </div>
              ) : treeComments.length === 0 ? (
                <p className="text-center text-secondary text-[15px] p-4">No replies yet. Be the first to reply!</p>
              ) : (
                treeComments.map(comment => renderCommentNode(comment))
              )}
            </div>

            {/* Discover More Algorithm Suggestions Feed */}
            <div className="border-t-[10px] border-border bg-background pt-2 pb-6">
               <div className="px-4 py-3">
                  <h2 className="text-xl font-bold text-primary">Discover more</h2>
               </div>
               <div className="flex flex-col">
                  {suggestedImages.filter(img => img.id !== currentImage.id).map(suggestedImg => (
                      <FeedItem 
                          key={suggestedImg.id}
                          image={suggestedImg}
                          user={user}
                          onImageClick={onImageClick}
                          onViewProfile={onViewProfile}
                          onLikeToggle={onLikeToggle}
                          onLoginClick={onLoginClick}
                          savedImages={savedImages}
                          onSaveToggle={onSaveToggle}
                      />
                  ))}
               </div>
            </div>
          </div>
       </div>
    </div>
  );
};

export default PostDetailView;
