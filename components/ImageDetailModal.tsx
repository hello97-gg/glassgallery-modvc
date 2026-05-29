
import React, { useState, useRef, useEffect } from 'react';
import type { User } from 'firebase/auth';
import type { ImageMeta, ProfileUser, Comment } from '../types';
import { LICENSES, FLAGS } from '../constants';
import { updateImageDetails, deleteImageFromFirestore, incrementDownloadCount, subscribeToImage, getCommentsForImage, addCommentToImage, toggleCommentLike } from '../services/firestoreService';
import Button from './Button';
import Spinner from './Spinner';
import SEOHead from './SEOHead';

interface ImageDetailModalProps {
  image: ImageMeta;
  user: User | null;
  allImages: ImageMeta[];
  onClose: () => void;
  onViewProfile: (user: ProfileUser) => void;
  onImageUpdate: (updatedImage: ImageMeta) => void;
  onImageDelete: (imageId: string) => void;
  onLikeToggle: (image: ImageMeta) => void;
  onLocationClick?: (location: string) => void;
  onSelectImage?: (image: ImageMeta) => void;
  onLoginClick: () => void;
}

const InfoChip: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <span className="inline-block bg-border text-secondary text-xs font-medium mr-2 px-2.5 py-1 rounded-full">
        {children}
    </span>
);

const AttributionModal: React.FC<{ image: ImageMeta, onClose: () => void }> = ({ image, onClose }) => {
  const [copied, setCopied] = useState(false);

  const hasOriginalWork = !!image.originalWorkUrl;
  let attributionText = '';
  let copyText = '';
  let shoutoutText = '';

  if (hasOriginalWork) {
      let sourceText = 'the original source';
      try {
          const hostname = new URL(image.originalWorkUrl!).hostname;
          sourceText = hostname.replace(/^www\./, '');
      } catch (e) { /* Fallback is fine */ }
      
      shoutoutText = `Give credit to the original creator by copying the source link below.`;
      attributionText = `Image from ${sourceText}`;
      copyText = `Image source: ${image.originalWorkUrl}`;

  } else {
      shoutoutText = `Give a shoutout to ${image.uploaderName} on social or copy the text below to attribute.`;
      attributionText = `Photo by ${image.uploaderName} on Glass Gallery`;
      copyText = `Photo by ${image.uploaderName} on Glass Gallery (${image.imageUrl})`;
  }


  const handleCopy = () => {
    navigator.clipboard.writeText(copyText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-surface border border-border rounded-2xl shadow-lg w-full max-w-md flex flex-col items-start p-6 relative animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-4 right-4 text-3xl font-light text-secondary hover:text-primary">&times;</button>
        <div className="flex items-start gap-4 w-full">
          <img src={image.imageUrl} alt="thumbnail" className="w-20 h-20 object-cover rounded-lg flex-shrink-0" />
          <div className="flex-grow">
            <h2 className="text-xl font-bold text-primary">Say thanks!</h2>
            <p className="text-sm text-secondary mt-1">{shoutoutText}</p>
          </div>
        </div>
        
        <div className="w-full mt-4 p-3 bg-background border border-border rounded-lg text-sm text-primary relative flex justify-between items-center">
          <span className="pr-10">{attributionText}</span>
          <button onClick={handleCopy} className="p-1.5 text-secondary hover:text-primary bg-border rounded-md flex-shrink-0">
            {copied ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M7 9a2 2 0 012-2h6a2 2 0 012 2v6a2 2 0 01-2 2H9a2 2 0 01-2-2V9z" />
                <path d="M5 3a2 2 0 00-2 2v6a2 2 0 002 2V5h6a2 2 0 00-2-2H5z" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

// --- Embed Modal: "Add to your site" with ready-to-copy embed codes ---
const EmbedModal: React.FC<{ image: ImageMeta, onClose: () => void }> = ({ image, onClose }) => {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://gg.modvc.org';
  const embedUrl = `${origin}/api/images?action=render&imageId=${image.id}`;
  const pageUrl = `${origin}/image/${image.id}`;
  const title = image.title || 'Glass Gallery Image';

  const snippets = [
    {
      label: 'HTML Embed',
      icon: '</>',
      code: `<a href="${pageUrl}" target="_blank" rel="noopener">
  <img src="${embedUrl}" alt="${title}" style="max-width:100%;border-radius:12px" />
</a>`,
    },
    {
      label: 'Markdown',
      icon: 'MD',
      code: `[![${title}](${embedUrl})](${pageUrl})`,
    },
    {
      label: 'BB Code',
      icon: 'BB',
      code: `[url=${pageUrl}][img]${embedUrl}[/img][/url]`,
    },
    {
      label: 'Direct Image URL',
      icon: '🔗',
      code: embedUrl,
    },
    {
      label: 'JSON Metadata API',
      icon: '{}',
      code: `${origin}/api/images?action=render&imageId=${image.id}&format=json`,
    },
  ];

  const handleCopy = (code: string, idx: number) => {
    navigator.clipboard.writeText(code);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-surface border border-border rounded-2xl shadow-lg w-full max-w-lg flex flex-col items-start relative animate-fade-in overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="w-full flex items-center justify-between px-6 pt-5 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center text-accent">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-primary">Add to your site</h2>
              <p className="text-xs text-secondary">Copy embed code to display this image on your website</p>
            </div>
          </div>
          <button onClick={onClose} className="text-2xl font-light text-secondary hover:text-primary transition-colors">&times;</button>
        </div>

        {/* Image Preview */}
        <div className="px-6 pb-3 w-full">
          <div className="flex items-center gap-3 p-3 bg-background rounded-xl border border-border">
            <img src={image.imageUrl} alt={title} className="w-14 h-14 object-cover rounded-lg flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-primary truncate">{title}</p>
              <p className="text-xs text-secondary">by {image.uploaderName}</p>
            </div>
          </div>
        </div>

        {/* Embed Codes */}
        <div className="w-full px-6 pb-5 space-y-3 max-h-[50vh] overflow-y-auto">
          {snippets.map((snippet, idx) => (
            <div key={idx} className="group">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold text-secondary flex items-center gap-2">
                  <span className="w-6 h-6 rounded bg-border flex items-center justify-center text-[10px] font-mono text-primary">
                    {snippet.icon}
                  </span>
                  {snippet.label}
                </span>
                <button
                  onClick={() => handleCopy(snippet.code, idx)}
                  className={`text-xs font-semibold px-3 py-1 rounded-full transition-all ${
                    copiedIdx === idx
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-accent/10 text-accent hover:bg-accent/20'
                  }`}
                >
                  {copiedIdx === idx ? '✓ Copied!' : 'Copy'}
                </button>
              </div>
              <pre className="p-3 bg-black/30 border border-border rounded-lg text-xs font-mono text-gray-300 whitespace-pre-wrap break-all overflow-x-auto max-h-24">
                <code>{snippet.code}</code>
              </pre>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const HeartIconSolid = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-accent" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
    </svg>
);
const HeartIconOutline = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
    </svg>
);


const ImageDetailModal: React.FC<ImageDetailModalProps> = ({ 
  image, 
  user, 
  allImages, 
  onClose, 
  onViewProfile, 
  onImageUpdate, 
  onImageDelete, 
  onLikeToggle, 
  onLocationClick,
  onSelectImage,
  onLoginClick
}) => {
  const [currentImage, setCurrentImage] = useState<ImageMeta>(image);
  const [isEditing, setIsEditing] = useState(false);

  // Comments states
  const [flatComments, setFlatComments] = useState<Comment[]>([]);
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [newCommentText, setNewCommentText] = useState('');
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);

  // Load comments
  const loadComments = async () => {
    if (!currentImage?.id) return;
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

  const handleCommentLikeToggle = async (commentId: string) => {
    if (!user) {
      onLoginClick();
      return;
    }
    
    // Optimistic UI update
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
      // Optional: rollback on error, but for comments a silent fail is usually fine.
    }
  };

  useEffect(() => {
    loadComments();
    setReplyToId(null);
    setReplyText('');
    setNewCommentText('');
  }, [currentImage.id]);

  const treeComments = React.useMemo(() => {
    const commentMap: Record<string, Comment & { replies: Comment[] }> = {};
    const roots: Comment[] = [];

    // Initialize map
    flatComments.forEach(comment => {
      commentMap[comment.id] = { ...comment, replies: [] };
    });

    // Build hierarchy
    flatComments.forEach(comment => {
      const mappedComment = commentMap[comment.id];
      if (comment.parentId && commentMap[comment.parentId]) {
        commentMap[comment.parentId].replies.push(mappedComment);
      } else {
        roots.push(mappedComment);
      }
    });

    // Sort root comments: newest first (descending)
    roots.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Recursively sort replies: oldest first (ascending)
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
    if (!newCommentText.trim() || !user || !currentImage?.id) return;
    setIsSubmittingComment(true);
    try {
      const newComment = await addCommentToImage(currentImage.id, user, newCommentText);
      setFlatComments(prev => [...prev, newComment]);
      setNewCommentText('');
    } catch (err) {
      console.error("Failed to post comment:", err);
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const handlePostReply = async (parentId: string) => {
    if (!replyText.trim() || !user || !currentImage?.id) return;
    setIsSubmittingComment(true);
    try {
      const newReply = await addCommentToImage(currentImage.id, user, replyText, parentId);
      setFlatComments(prev => [...prev, newReply]);
      setReplyText('');
      setReplyToId(null);
    } catch (err) {
      console.error("Failed to post reply:", err);
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const renderCommentNode = (comment: Comment, depth = 0) => {
    const isReplying = replyToId === comment.id;
    const hasReplies = comment.replies && comment.replies.length > 0;
    const avatarUrl = comment.userPhotoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${comment.userName}`;

    return (
      <div 
        key={comment.id} 
        className={`flex flex-col gap-1.5 ${
          depth > 0 
            ? `mt-2.5 pl-3 ${depth < 4 ? 'border-l border-border/40 ml-1.5' : 'ml-0'}` 
            : 'border-b border-border/20 pb-3 last:border-0 last:pb-0'
        }`}
      >
        <div className="flex gap-2.5 items-start">
          <img
            src={avatarUrl}
            alt={comment.userName}
            className="w-7 h-7 rounded-full object-cover flex-shrink-0"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="font-bold text-xs text-primary">{comment.userName}</span>
              <span className="text-[9px] text-secondary">
                {new Date(comment.createdAt).toLocaleDateString()}
              </span>
            </div>
            <p className="text-xs text-primary/90 mt-0.5 leading-relaxed break-words">{comment.content}</p>
            
            <div className="flex items-center mt-1 gap-3">
              <button
                onClick={() => handleCommentLikeToggle(comment.id)}
                className={`flex items-center gap-1 text-[10px] font-bold transition-colors ${comment.likedBy?.includes(user?.uid || '') ? 'text-red-500 hover:text-red-600' : 'text-secondary hover:text-primary'}`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill={comment.likedBy?.includes(user?.uid || '') ? "currentColor" : "none"} stroke="currentColor">
                  <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
                </svg>
                {comment.likeCount || 0}
              </button>
              {user && (
                <button
                  onClick={() => {
                    if (isReplying) {
                      setReplyToId(null);
                      setReplyText('');
                    } else {
                      setReplyToId(comment.id);
                      setReplyText('');
                    }
                  }}
                  className="text-[10px] font-bold text-accent hover:underline flex items-center gap-1 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                  </svg>
                  Reply
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Reply Input Form */}
        {isReplying && user && (
          <div className="flex gap-2 items-start ml-9 mt-1 animate-fade-in">
            <img
              src={user.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${user.displayName || 'User'}`}
              alt="Current user"
              className="w-6 h-6 rounded-full object-cover flex-shrink-0"
            />
            <div className="flex-1 flex flex-col gap-1.5">
              <textarea
                placeholder={`Reply to ${comment.userName}...`}
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                rows={1}
                className="w-full bg-background border border-border/80 focus:border-accent/60 rounded-xl py-1.5 px-3 text-xs text-primary placeholder-secondary focus:outline-none focus:ring-1 focus:ring-accent/40 resize-none transition-all"
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => {
                    setReplyToId(null);
                    setReplyText('');
                  }}
                  className="px-2.5 py-0.5 text-[9px] font-bold text-secondary hover:text-primary rounded-full hover:bg-border/30 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handlePostReply(comment.id)}
                  disabled={!replyText.trim() || isSubmittingComment}
                  className="bg-accent hover:opacity-90 disabled:opacity-50 text-surface font-semibold px-2.5 py-0.5 rounded-full text-[9px] transition-all shadow-sm active:scale-95 flex items-center gap-1"
                >
                  {isSubmittingComment ? <Spinner /> : 'Reply'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Nested child replies recursive rendering */}
        {hasReplies && (
          <div className="flex flex-col gap-0.5">
            {comment.replies!.map(reply => renderCommentNode(reply, depth + 1))}
          </div>
        )}
      </div>
    );
  };
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [zoomScale, setZoomScale] = useState(1.0);
  
  const [editedTitle, setEditedTitle] = useState(image.title || '');
  const [editedDescription, setEditedDescription] = useState(image.description || '');
  const [editedLocation, setEditedLocation] = useState(image.location || '');
  const [editedLicense, setEditedLicense] = useState(image.license);
  const [editedLicenseUrl, setEditedLicenseUrl] = useState(image.licenseUrl || '');
  const [editedFlags, setEditedFlags] = useState<string[]>(image.flags || []);
  
  const dynamicTags = React.useMemo(() => {
    const tagsSet = new Set<string>();
    const DEFAULT_FLAGS = [
      'AI Generated',
      'Natural',
      'Photography',
      'Abstract',
      'Minimalist',
      'Fantasy',
      'Sci-Fi',
      'Minecraft',
      'Games'
    ];
    DEFAULT_FLAGS.forEach(flag => tagsSet.add(flag));
    
    allImages.forEach(img => {
      if (Array.isArray(img.flags)) {
        img.flags.forEach(flag => {
          if (flag && flag !== 'Flagged') {
            tagsSet.add(flag);
          }
        });
      }
    });

    editedFlags.forEach(flag => {
      if (flag && flag !== 'Flagged') {
        tagsSet.add(flag);
      }
    });

    return Array.from(tagsSet);
  }, [allImages, editedFlags]);

  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAttribution, setShowAttribution] = useState(false);
  const [showEmbedModal, setShowEmbedModal] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [showHeartAnimation, setShowHeartAnimation] = useState(false);
  const [isLikeBtnAnimating, setIsLikeBtnAnimating] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const isFlagged = currentImage.flags?.includes('Flagged');
  const lastTap = useRef<number>(0);

  const modalRef = useRef<HTMLDivElement>(null);
  const leftPanelRef = useRef<HTMLDivElement>(null);
  const rightPanelRef = useRef<HTMLDivElement>(null);

  const [suggestions, setSuggestions] = useState<ImageMeta[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);

  useEffect(() => {
    // 1. SILENTLY track user click (action='view') in background if user is logged in
    if (user?.uid && currentImage?.id) {
      fetch('/api/images?action=view', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageId: currentImage.id, userUid: user.uid })
      }).catch(err => console.error("View tracking failed:", err));
    }

    // 2. Fetch smart recommendations from dynamic backend
    if (currentImage?.id) {
      setIsLoadingSuggestions(true);
      const url = `/api/images?action=suggestions&imageId=${currentImage.id}${user?.uid ? `&userUid=${user.uid}` : ''}`;
      
      fetch(url)
        .then(res => res.json())
        .then(data => {
          if (data.success && data.images) {
            setSuggestions(data.images);
          } else {
            // Fallback to tags client-side matching if API fails
            const clientFallback = allImages
              .filter(img => img.id !== currentImage.id)
              .slice(0, 12);
            setSuggestions(clientFallback);
          }
        })
        .catch(err => {
          console.error("Failed to fetch suggestions:", err);
          const clientFallback = allImages
            .filter(img => img.id !== currentImage.id)
            .slice(0, 12);
          setSuggestions(clientFallback);
        })
        .finally(() => {
          setIsLoadingSuggestions(false);
        });
    }
  }, [currentImage.id, user?.uid]);

  const displayRelated = suggestions;

  const handleSelectRelated = (img: ImageMeta) => {
    if (onSelectImage) {
      onSelectImage(img);
    }
    if (leftPanelRef.current) {
      leftPanelRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
    if (rightPanelRef.current) {
      rightPanelRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  useEffect(() => {
    const unsubscribe = subscribeToImage(image.id, (updatedImage) => {
        if (updatedImage) setCurrentImage(updatedImage);
    });
    return () => unsubscribe();
  }, [image.id]);
  
  useEffect(() => {
    setCurrentImage(image);
    setEditedTitle(image.title || '');
    setEditedDescription(image.description || '');
    setEditedLocation(image.location || '');
    setEditedLicense(image.license);
    setEditedLicenseUrl(image.licenseUrl || '');
    setEditedFlags(image.flags || []);
    setRevealed(false);
    setZoomScale(1.0);
    setIsFullscreen(false);
  }, [image]);

  const isOwner = user?.uid === currentImage.uploaderUid;
  const hasLiked = user && currentImage.likedBy?.includes(user.uid);
  
  const handleProfileClick = () => {
    onViewProfile({
      uploaderUid: currentImage.uploaderUid,
      uploaderName: currentImage.uploaderName,
      uploaderPhotoURL: currentImage.uploaderPhotoURL,
    });
  };

  const handleLocationClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (currentImage.location && onLocationClick) {
          onLocationClick(currentImage.location);
      }
  }

  const handleEditToggle = () => {
    if (isEditing) {
      // Cancel
      setEditedTitle(currentImage.title || '');
      setEditedDescription(currentImage.description || '');
      setEditedLocation(currentImage.location || '');
      setEditedLicense(currentImage.license);
      setEditedLicenseUrl(currentImage.licenseUrl || '');
      setEditedFlags(currentImage.flags || []);
      setError(null);
    } else {
      setEditedTitle(currentImage.title || '');
      setEditedDescription(currentImage.description || '');
      setEditedLocation(currentImage.location || '');
      setEditedLicense(currentImage.license);
      setEditedLicenseUrl(currentImage.licenseUrl || '');
      setEditedFlags(currentImage.flags || []);
    }
    setIsEditing(!isEditing);
  };

  const handleFlagToggle = (flag: string) => {
    setEditedFlags(prev =>
      prev.includes(flag) ? prev.filter(f => f !== flag) : [...prev, flag]
    );
  };

  const handleSave = async () => {
    if (editedFlags.length === 0) {
      setError("Please select at least one tag.");
      return;
    }
    setError(null);
    setIsSaving(true);
    try {
      const updates = {
        title: editedTitle,
        description: editedDescription,
        location: editedLocation,
        license: editedLicense,
        flags: editedFlags,
        licenseUrl: editedLicense === 'Other' ? editedLicenseUrl : '',
      };
      await updateImageDetails(currentImage.id, updates);
      onImageUpdate({ ...currentImage, ...updates });
      setIsEditing(false);
    } catch (err) {
      console.error("Failed to save changes:", err);
      setError("Failed to save changes. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };
  
  const handleDeleteClick = () => {
      setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = async () => {
      setIsDeleting(true);
      try {
          onImageDelete(currentImage.id);
      } catch (error) {
          console.error("Delete failed", error);
          setIsDeleting(false);
          setShowDeleteConfirm(false);
      }
  };

  const handleDownload = async () => {
    incrementDownloadCount(currentImage.id);
    setCurrentImage(prev => ({ ...prev, downloadCount: (prev.downloadCount || 0) + 1 }));
    onImageUpdate({ ...currentImage, downloadCount: (currentImage.downloadCount || 0) + 1 });

    const filename = currentImage.imageUrl.split('/').pop()?.split('?')[0] || 'download.jpg';
    
    // Use the proxy endpoint to avoid CORS issues.
    // The proxy must return Content-Disposition: attachment for this to work as a download.
    const proxyUrl = `/api/downloadProxy?url=${encodeURIComponent(currentImage.imageUrl)}&filename=${encodeURIComponent(filename)}`;
    
    // Create a temporary link and click it. 
    // This uses the browser's native download capability via the proxy headers,
    // avoiding the need for client-side blob processing (which can hit CORS limits).
    const a = document.createElement('a');
    a.href = proxyUrl;
    a.download = filename; // This attribute is a hint, the server header takes precedence
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    setShowAttribution(true);
  };

  const handleShare = async () => {
    const origin = window.location.origin;
    const shareUrl = `${origin}/api/share?id=${currentImage.id}`;
    const shareData = {
        title: currentImage.title || 'Glass Gallery Image',
        text: `Check out this image by ${currentImage.uploaderName} on Glass Gallery!`,
        url: shareUrl
    };

    if (navigator.share) {
        try { await navigator.share(shareData); } catch (err) { console.log("Share cancelled", err); }
    } else {
        try {
            await navigator.clipboard.writeText(shareUrl);
            setShareCopied(true);
            setTimeout(() => setShareCopied(false), 2000);
        } catch (err) { console.error("Failed to copy", err); }
    }
  };

  const handleLikeClick = () => {
      setIsLikeBtnAnimating(true);
      onLikeToggle(currentImage);
      setTimeout(() => setIsLikeBtnAnimating(false), 400);
  };

  const handleImageTap = (e: React.MouseEvent) => {
      e.stopPropagation();
      const now = Date.now();
      const DOUBLE_TAP_DELAY = 300;
      if (now - lastTap.current < DOUBLE_TAP_DELAY) {
          // Double Tap: Like image
          if (!hasLiked) {
              onLikeToggle(currentImage);
          }
          setShowHeartAnimation(true);
          setIsLikeBtnAnimating(true);
          setTimeout(() => setShowHeartAnimation(false), 800);
          setTimeout(() => setIsLikeBtnAnimating(false), 400);
      } else {
          // Single Tap: Launch fullscreen theater mode after ensuring it's not a double-tap
          setTimeout(() => {
              if (Date.now() - lastTap.current >= DOUBLE_TAP_DELAY) {
                  setIsFullscreen(true);
              }
          }, DOUBLE_TAP_DELAY);
      }
      lastTap.current = now;
  };

  const renderDetails = () => {
    if (isEditing) {
      return (
        <div className="space-y-4">
          <div>
             <label htmlFor="title-edit" className="font-semibold mb-2 text-secondary text-sm block">Title</label>
             <input type="text" id="title-edit" value={editedTitle} onChange={(e) => setEditedTitle(e.target.value)} className="mt-1 block w-full bg-background border border-border rounded-md shadow-sm py-2 px-3 text-primary focus:outline-none focus:ring-accent focus:border-accent text-sm" />
          </div>
          <div>
             <label htmlFor="loc-edit" className="font-semibold mb-2 text-secondary text-sm block">Location</label>
             <input type="text" id="loc-edit" value={editedLocation} onChange={(e) => setEditedLocation(e.target.value)} className="mt-1 block w-full bg-background border border-border rounded-md shadow-sm py-2 px-3 text-primary focus:outline-none focus:ring-accent focus:border-accent text-sm" />
          </div>
          <div>
             <label htmlFor="desc-edit" className="font-semibold mb-2 text-secondary text-sm block">Description</label>
             <textarea id="desc-edit" value={editedDescription} onChange={(e) => setEditedDescription(e.target.value)} rows={3} className="mt-1 block w-full bg-background border border-border rounded-md shadow-sm py-2 px-3 text-primary focus:outline-none focus:ring-accent focus:border-accent text-sm" />
          </div>
          {/* ... License and Tags inputs same as before ... */}
          <div>
            <label htmlFor="license-edit" className="font-semibold mb-2 text-secondary text-sm block">License</label>
            <select id="license-edit" value={editedLicense} onChange={(e) => setEditedLicense(e.target.value)} className="mt-1 block w-full pl-3 pr-10 py-2 bg-background border border-border rounded-md focus:outline-none focus:ring-accent focus:border-accent sm:text-sm text-primary">
              {LICENSES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </div>
           {editedLicense === 'Other' && (
            <div>
              <label htmlFor="licenseUrl-edit" className="font-semibold mb-2 text-secondary text-sm block">License URL</label>
              <input type="url" id="licenseUrl-edit" value={editedLicenseUrl} onChange={(e) => setEditedLicenseUrl(e.target.value)} className="mt-1 block w-full bg-background border border-border rounded-md shadow-sm py-2 px-3 text-primary focus:outline-none focus:ring-accent focus:border-accent" placeholder="https://creativecommons.org/licenses/..." required/>
            </div>
          )}
          <div>
            <label className="font-semibold mb-2 text-secondary text-sm block">Tags</label>
            <div className="mt-2 flex flex-wrap gap-2">
              {dynamicTags.map(flag => (
                <button key={flag} type="button" onClick={() => handleFlagToggle(flag)} className={`px-3 py-1 text-sm rounded-full transition-colors ${editedFlags.includes(flag) ? 'bg-accent text-primary' : 'bg-border text-secondary hover:bg-border/80'}`}>
                  {flag}
                </button>
              ))}
            </div>
          </div>
          {error && <p className="text-sm text-red-500 mt-2">{error}</p>}
        </div>
      );
    }

    const licenseInfo = LICENSES.find(l => l.value === currentImage.license);
    const licenseName = licenseInfo?.label || currentImage.license;
    const licenseExplanationUrl = licenseInfo?.url;

    return (
      <div className="space-y-4">
         {(currentImage.title || currentImage.description) && (
            <div className="mb-2">
                 {currentImage.title && <h1 className="text-2xl font-bold text-primary mb-2">{currentImage.title}</h1>}
                 {currentImage.description && <p className="text-primary/80 text-sm whitespace-pre-wrap leading-relaxed">{currentImage.description}</p>}
            </div>
         )}
         
         {currentImage.location && (
            <div>
                <h4 className="font-semibold mb-1 text-secondary text-sm">Location</h4>
                <button 
                    onClick={handleLocationClick} 
                    className={`flex items-center gap-1 text-sm font-medium ${onLocationClick ? 'text-accent hover:underline cursor-pointer' : 'text-primary cursor-default'}`}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    {currentImage.location}
                </button>
            </div>
         )}

        <div className="flex gap-6">
             <div>
                <h4 className="font-semibold mb-1 text-secondary text-sm">Downloads</h4>
                <InfoChip>{(currentImage.downloadCount || 0).toLocaleString()}</InfoChip>
            </div>
            <div>
              <h4 className="font-semibold mb-1 text-secondary text-sm">License</h4>
              {currentImage.license === 'Other' && currentImage.licenseUrl ? (
                 <a href={currentImage.licenseUrl} target="_blank" rel="noopener noreferrer" className="inline-block bg-border text-accent hover:underline text-xs font-medium px-2.5 py-1 rounded-full">
                    {licenseName}
                 </a>
              ) : licenseExplanationUrl ? (
                 <a href={licenseExplanationUrl} target="_blank" rel="noopener noreferrer" className="inline-block bg-border text-secondary hover:text-primary hover:underline text-xs font-medium px-2.5 py-1 rounded-full transition-colors">
                    {licenseName}
                 </a>
              ) : (
                <InfoChip>{licenseName}</InfoChip>
              )}
            </div>
        </div>

        {currentImage.originalWorkUrl && (
           <div>
             <h4 className="font-semibold mb-1 text-secondary text-sm">Original Source</h4>
             <a href={currentImage.originalWorkUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-accent hover:underline truncate block">
               {currentImage.originalWorkUrl}
             </a>
           </div>
        )}

        {currentImage.flags && currentImage.flags.length > 0 && (
          <div>
            <h4 className="font-semibold mb-2 text-secondary text-sm">Tags</h4>
            <div className="flex flex-wrap gap-2">
              {currentImage.flags.map(flag => <InfoChip key={flag}>{flag}</InfoChip>)}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in" onClick={onClose}>
      <SEOHead 
        title={currentImage.title || `Image by ${currentImage.uploaderName}`}
        description={currentImage.description || `Check out this amazing image.`}
        imageUrl={currentImage.imageUrl}
        url={window.location.href}
        type="article"
        author={currentImage.uploaderName}
      />

      <div 
        ref={modalRef}
        className="bg-surface border border-border rounded-3xl shadow-2xl w-full max-w-6xl h-[92vh] flex flex-col md:flex-row overflow-hidden relative" 
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left Column: Pin details panel (Scrollable) */}
        <div 
          ref={leftPanelRef}
          className="w-full md:w-[45%] flex flex-col h-full border-b md:border-b-0 md:border-r border-border overflow-y-auto [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-secondary/50 bg-background/5"
        >
          {/* Action Bar Header */}
          <div className="sticky top-0 z-30 bg-surface/90 backdrop-blur-md px-4 py-3 flex items-center justify-between border-b border-border/40 flex-shrink-0">
            <button 
              onClick={onClose} 
              className="p-2 rounded-full hover:bg-border/70 text-secondary hover:text-primary transition-all flex items-center justify-center" 
              title="Close Modal"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>
            <div className="flex items-center gap-2">
              {/* Like/Heart Button */}
              <button 
                onClick={handleLikeClick} 
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full font-semibold transition-all text-sm ${hasLiked ? 'bg-red-500/20 text-red-500' : 'bg-border/60 hover:bg-border text-secondary hover:text-primary'}`}
              >
                <div className={isLikeBtnAnimating ? 'animate-like-bounce' : ''}>
                  {hasLiked ? <HeartIconSolid /> : <HeartIconOutline />}
                </div>
                <span>{currentImage.likeCount || 0}</span>
              </button>

              {/* Share Button */}
              <button 
                onClick={handleShare} 
                title="Share Image" 
                className="p-2 rounded-full hover:bg-border/60 text-secondary hover:text-primary transition-all"
              >
                {shareCopied ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-500" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                  </svg>
                )}
              </button>

              {/* Download Button */}
              <button 
                onClick={handleDownload} 
                title="Download Image" 
                className="p-2 rounded-full hover:bg-border/60 text-secondary hover:text-primary transition-all"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              </button>

              {/* Embed / Add to site button */}
              <button 
                onClick={() => setShowEmbedModal(true)} 
                title="Embed this image on your site" 
                className="p-2 rounded-full hover:bg-border/60 text-secondary hover:text-primary transition-all"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
              </button>

              {/* Credit/Attribution button */}
              <button 
                onClick={() => setShowAttribution(true)} 
                className="bg-red-600 hover:bg-red-700 text-white font-semibold px-4 py-1.5 rounded-full text-xs transition-all shadow-md active:scale-95 ml-1"
              >
                Credit
              </button>
            </div>
          </div>

          {/* Main Image Container */}
          <div className="bg-background flex-shrink-0 flex items-center justify-center p-4 relative group select-none min-h-[300px]">
            <img 
              src={currentImage.imageUrl} 
              alt={currentImage.title || 'Pinterest Pin'} 
              className={`max-w-full max-h-[48vh] object-contain rounded-2xl shadow-lg transition-transform duration-300 hover:scale-[1.01] ${isFlagged && !revealed ? 'blur-3xl scale-[1.03]' : 'cursor-zoom-in'}`}
              onClick={isFlagged && !revealed ? undefined : handleImageTap}
            />
            {(!isFlagged || revealed) && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsFullscreen(true);
                }}
                className="absolute bottom-6 right-6 opacity-0 group-hover:opacity-100 transition-all duration-300 bg-black/70 hover:bg-black/90 backdrop-blur-md border border-white/20 text-white rounded-full px-4 py-2.5 text-xs font-bold flex items-center gap-1.5 shadow-lg active:scale-95 z-20 cursor-pointer"
                title="View Fullscreen"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-5h-4m4 0v4m0-4l-5 5M4 20v-4m0 4h4m-4 0l5-5m11 5h-4m4 0v-4m0 4l-5-5" />
                </svg>
                View Fullscreen
              </button>
            )}
            {isFlagged && !revealed && (
              <div className="absolute inset-0 bg-black/75 backdrop-blur-lg z-20 flex flex-col items-center justify-center p-6 text-center rounded-2xl transition-all duration-300">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-red-500 mb-3 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                   <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <h4 className="text-white text-base font-bold uppercase tracking-wider mb-2">Sensitive Content Warning</h4>
                <p className="text-white/80 text-sm max-w-xs mb-4">This image has been flagged by automated content safety moderation.</p>
                <button 
                  onClick={() => setRevealed(true)}
                  className="bg-red-600 hover:bg-red-700 text-white font-semibold px-6 py-2.5 rounded-full text-sm transition-all shadow-md active:scale-95"
                >
                  Reveal Image
                </button>
              </div>
            )}
            {showHeartAnimation && !isFlagged && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20 animate-like-bounce">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-28 w-28 text-white drop-shadow-2xl opacity-90" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
                </svg>
              </div>
            )}
          </div>

          {/* Details Pane */}
          <div className="p-6 flex flex-col space-y-5">
            {/* Pinterest Mobile App Promo Banner */}
            {(!((window as any).Capacitor?.isNativePlatform?.()) && (window.innerWidth <= 768 || /android|iphone|ipad|ipod|mobi/i.test(navigator.userAgent))) && (
              <div className="bg-gradient-to-r from-red-600 to-rose-500 rounded-2xl p-4 text-white shadow-lg flex items-center justify-between gap-3 mb-2 animate-fade-in">
                <div className="flex-1">
                  <h4 className="font-bold text-sm">Glass Gallery App</h4>
                  <p className="text-[11px] text-white/90 leading-tight">Get the full experience with high-speed uploads, native GPS coordinates, and offline browsing!</p>
                </div>
                <a 
                  href="intent://open#Intent;scheme=glassgallery;package=org.modvc.glassgallery;S.browser_fallback_url=https://cdn.modvc.org/GlassGallery.apk;end" 
                  className="px-4 py-2 bg-white text-red-600 hover:bg-white/90 text-xs font-bold rounded-full transition-all flex-shrink-0 shadow-md active:scale-95"
                >
                  Open App
                </a>
              </div>
            )}

            {/* Uploader Profile Row */}
            <button 
              onClick={handleProfileClick} 
              className="flex items-center gap-3 hover:bg-border/50 p-2 -m-2 rounded-xl transition-colors text-left w-full"
            >
              <img 
                src={currentImage.uploaderPhotoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${currentImage.uploaderName}`} 
                alt={currentImage.uploaderName} 
                className="w-10 h-10 rounded-full object-cover" 
              />
              <div>
                <p className="font-semibold text-sm">{currentImage.uploaderName}</p>
                <p className="text-xs text-secondary">
                  Uploaded on {
                    currentImage.uploadedAt
                      ? new Date(currentImage.uploadedAt.toDate ? currentImage.uploadedAt.toDate() : currentImage.uploadedAt).toLocaleDateString()
                      : 'Unknown Date'
                  }
                </p>
              </div>
            </button>

            {/* Title & Description Stack */}
            <div className="space-y-4 pt-1">
              {renderDetails()}
            </div>

            {/* Comments Section */}
            <div className="pt-6 border-t border-border/50 mt-6">
              <h3 className="text-sm font-bold text-primary mb-4 flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                {flatComments.length} Comments
              </h3>
              
              {/* Comment Input */}
              {user ? (
                <div className="flex gap-2.5 items-start mb-5">
                  <img 
                    src={user.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${user.displayName || 'User'}`} 
                    alt="Current user" 
                    className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                  />
                  <div className="flex-1 flex flex-col gap-2">
                    <textarea
                      placeholder="Share your thoughts..."
                      value={newCommentText}
                      onChange={(e) => setNewCommentText(e.target.value)}
                      rows={2}
                      className="w-full bg-background border border-border/80 focus:border-accent/60 rounded-xl py-2 px-3 text-xs text-primary placeholder-secondary focus:outline-none focus:ring-1 focus:ring-accent/40 resize-none transition-all"
                    />
                    <div className="flex justify-end">
                      <button
                        onClick={handlePostComment}
                        disabled={!newCommentText.trim() || isSubmittingComment}
                        className="bg-accent hover:opacity-90 disabled:opacity-50 text-surface font-semibold px-3.5 py-1.5 rounded-full text-xs transition-all shadow-md active:scale-95 flex items-center gap-1.5"
                      >
                        {isSubmittingComment ? <Spinner /> : 'Comment'}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2.5 items-start mb-5 cursor-pointer group" onClick={onLoginClick}>
                  <div className="w-8 h-8 rounded-full bg-border/50 flex-shrink-0 flex items-center justify-center text-secondary group-hover:text-primary transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                  </div>
                  <div className="flex-1 flex flex-col gap-2">
                    <div className="w-full bg-background border border-border/80 group-hover:border-accent/60 rounded-xl py-2 px-3 text-xs text-secondary transition-all flex items-center">
                      Add a comment...
                    </div>
                  </div>
                </div>
              )}

              {/* Comments Scrollable Feed */}
              {isLoadingComments ? (
                <div className="flex justify-center py-6">
                  <Spinner />
                </div>
              ) : treeComments.length > 0 ? (
                <div className="space-y-4 max-h-[300px] overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-secondary/30">
                  {treeComments.map(comment => renderCommentNode(comment))}
                </div>
              ) : (
                <p className="text-xs text-secondary text-center py-6 italic">Be the first to share your thoughts!</p>
              )}
            </div>

            {/* Owner Operations (Delete / Edit) */}
            {isOwner && (
              <div className="pt-4 border-t border-border flex justify-end items-center gap-3 mt-4">
                {isEditing ? (
                  <>
                    <Button onClick={handleEditToggle} variant="secondary" disabled={isSaving}>
                      Cancel
                    </Button>
                    <Button onClick={handleSave} disabled={isSaving}>
                      {isSaving ? <Spinner/> : 'Save'}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button 
                      onClick={handleDeleteClick} 
                      variant="secondary" 
                      className="!bg-red-900/50 !text-red-400 hover:!bg-red-800/50" 
                      disabled={isDeleting}
                    >
                      {isDeleting ? <Spinner/> : 'Delete'}
                    </Button>
                    <Button onClick={handleEditToggle} variant="secondary">
                      Edit
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: "More Like This" Masonry Feed (Scrollable) */}
        <div 
          ref={rightPanelRef}
          className="w-full md:w-[55%] flex flex-col h-full bg-surface overflow-y-auto [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-secondary/50 p-6 md:p-8"
        >
          <div className="flex items-center justify-between mb-6 sticky top-0 bg-surface z-20 pb-4 border-b border-border/40 flex-shrink-0">
            <h3 className="text-lg font-bold text-primary flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
              More like this
            </h3>
            <span className="text-xs text-secondary font-medium">{displayRelated.length} related pins</span>
          </div>

          {isLoadingSuggestions ? (
            <div className="columns-2 sm:columns-3 gap-4 animate-pulse">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="break-inside-avoid mb-4 h-[180px] rounded-2xl bg-border/40 border border-border/20 backdrop-blur-md" />
              ))}
            </div>
          ) : displayRelated.length > 0 ? (
            <div className="columns-2 gap-4 animate-fade-in">
              {displayRelated.map(img => (
                <div 
                  key={img.id}
                  onClick={() => handleSelectRelated(img)}
                  className="break-inside-avoid mb-5 group cursor-pointer flex flex-col bg-surface border border-border/50 hover:border-accent/40 rounded-2xl shadow-sm overflow-hidden transition-all duration-300 hover:scale-[1.03] hover:shadow-md"
                >
                  <div className="relative overflow-hidden w-full bg-background/20">
                    <img src={img.imageUrl} alt={img.title || 'Related photo'} className="w-full object-cover max-h-[240px] transition-transform duration-500 group-hover:scale-105" />
                  </div>
                  <div className="p-3 flex flex-col gap-1.5 bg-surface">
                    <p className="text-xs font-bold text-primary truncate leading-tight group-hover:text-accent transition-colors">{img.title || 'Untitled'}</p>
                    <div className="flex items-center gap-1.5">
                      <img 
                        src={img.uploaderPhotoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${img.uploaderName}`} 
                        alt={img.uploaderName} 
                        className="w-4 h-4 rounded-full object-cover" 
                      />
                      <p className="text-[10px] font-medium text-secondary truncate">by {img.uploaderName}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex-grow flex flex-col items-center justify-center py-12 text-secondary">
              <p className="text-sm">No related images found.</p>
            </div>
          )}
        </div>

        {/* Delete Confirmation Overlay */}
        {showDeleteConfirm && (
          <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-surface border border-border rounded-xl p-6 max-w-sm w-full shadow-2xl transform scale-100 animate-fade-in text-center">
              <div className="w-12 h-12 rounded-full bg-red-900/30 text-red-500 flex items-center justify-center mx-auto mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-primary mb-2">Delete Image</h3>
              <p className="text-secondary text-sm mb-6">
                Are you sure you want to permanently delete this image? This action cannot be undone.
              </p>
              <div className="flex gap-3 justify-center">
                <Button variant="secondary" onClick={() => setShowDeleteConfirm(false)} disabled={isDeleting}>
                  Cancel
                </Button>
                <Button onClick={handleConfirmDelete} className="!bg-red-600 hover:!bg-red-700 text-white" disabled={isDeleting}>
                  {isDeleting ? <Spinner /> : 'Delete Forever'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
       {showAttribution && <AttributionModal image={currentImage} onClose={() => setShowAttribution(false)} />}
       {showEmbedModal && <EmbedModal image={currentImage} onClose={() => setShowEmbedModal(false)} />}

      {/* Fullscreen Lightbox Theater Overlay */}
      {isFullscreen && (
        <div 
          className="fixed inset-0 z-[80] bg-black/95 backdrop-blur-xl flex items-center justify-center p-4 animate-fade-in select-none"
          onClick={() => setIsFullscreen(false)}
        >
          {/* Ambient Glassmorphic Backdrop */}
          <div 
            className="absolute inset-0 bg-cover bg-center blur-3xl opacity-35 scale-105 pointer-events-none transition-all duration-700" 
            style={{ backgroundImage: `url(${currentImage.imageUrl})` }}
          />

          {/* Top Bar Actions */}
          <div className="absolute top-6 left-6 right-6 z-[90] flex items-center justify-between pointer-events-none">
            {/* Close Button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsFullscreen(false);
              }}
              className="pointer-events-auto w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 text-white flex items-center justify-center shadow-2xl transition-all active:scale-95 cursor-pointer hover:scale-105"
              title="Close Fullscreen"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Quick social actions on fullscreen */}
            <div className="flex items-center gap-3 pointer-events-auto">
              {/* Share */}
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  handleShare();
                }}
                className="px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 text-white font-semibold text-sm transition-all flex items-center gap-1.5 shadow-lg cursor-pointer hover:scale-105 active:scale-95"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
                {shareCopied ? 'Copied' : 'Share'}
              </button>

              {/* Profile */}
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  handleProfileClick();
                }}
                className="px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 text-white font-semibold text-sm transition-all flex items-center gap-1.5 shadow-lg cursor-pointer hover:scale-105 active:scale-95"
              >
                <img 
                  src={currentImage.uploaderPhotoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${currentImage.uploaderName}`} 
                  alt={currentImage.uploaderName} 
                  className="w-5 h-5 rounded-full object-cover" 
                />
                Profile
              </button>

              {/* Like/Save */}
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  handleLikeClick();
                }}
                className={`px-5 py-2 rounded-full font-bold text-sm transition-all flex items-center gap-1.5 shadow-lg cursor-pointer hover:scale-105 active:scale-95 ${hasLiked ? 'bg-red-600 text-white' : 'bg-accent text-surface hover:opacity-90'}`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4.5 w-4.5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
                </svg>
                {hasLiked ? 'Saved' : 'Save'}
              </button>
            </div>
          </div>

          {/* Centered Image Container */}
          <div 
            className="relative z-10 flex items-center justify-center w-full h-full max-w-[90vw] max-h-[85vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <img 
              src={currentImage.imageUrl} 
              alt={currentImage.title} 
              className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl transition-all duration-300 select-none pointer-events-none"
              style={{ transform: `scale(${zoomScale})` }}
            />
          </div>

          {/* Zoom Controls bottom-right */}
          <div className="absolute bottom-6 right-6 z-[90] flex flex-col gap-3 pointer-events-auto">
            {/* Zoom In */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setZoomScale(prev => Math.min(prev + 0.25, 3.0));
              }}
              className="w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 text-white flex items-center justify-center shadow-lg transition-all active:scale-95 cursor-pointer hover:scale-105"
              title="Zoom In"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </button>

            {/* Zoom Out */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setZoomScale(prev => Math.max(prev - 0.25, 1.0));
              }}
              className="w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 text-white flex items-center justify-center shadow-lg transition-all active:scale-95 cursor-pointer hover:scale-105"
              title="Zoom Out"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ImageDetailModal;
