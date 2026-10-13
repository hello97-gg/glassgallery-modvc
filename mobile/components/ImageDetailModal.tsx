
import React, { useState, useRef, useEffect } from 'react';
import type { User } from 'firebase/auth';
import type { ImageMeta, ProfileUser, Comment } from '../types';
import { LICENSES, FLAGS } from '../constants';
import { updateImageDetails, deleteImageFromFirestore, incrementDownloadCount, subscribeToImage, getCommentsForImage, addCommentToImage, toggleCommentLike, editComment, deleteComment } from '../services/firestoreService';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import Button from './Button';
import Spinner from './Spinner';
import SEOHead from './SEOHead';
import { isVideoUrl } from '../../utils/mediaUtils';
import { getInterestBoost, recordClickInterest } from '../services/interestTracker';

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
  onSelectImage
}) => {
  const [currentImage, setCurrentImage] = useState<ImageMeta>(image);
  const [isEditing, setIsEditing] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [zoomScale, setZoomScale] = useState(1.0);
  const [translateX, setTranslateX] = useState(0);
  const [translateY, setTranslateY] = useState(0);
  
  // Touch gestures tracking references
  const touchStartRef = React.useRef<{ x: number; y: number } | null>(null);
  const initialDistanceRef = React.useRef<number | null>(null);
  const initialScaleRef = React.useRef<number>(1.0);
  const initialTranslateRef = React.useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const lastTapRef = React.useRef<number>(0);
  const isPinchingRef = React.useRef<boolean>(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      isPinchingRef.current = false;
      const now = Date.now();
      if (now - lastTapRef.current < 300) {
        // Double tap toggle
        if (zoomScale > 1.0) {
          setZoomScale(1.0);
          setTranslateX(0);
          setTranslateY(0);
        } else {
          setZoomScale(2.5);
        }
        lastTapRef.current = 0;
        return;
      }
      lastTapRef.current = now;
      
      touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      initialTranslateRef.current = { x: translateX, y: translateY };
    } else if (e.touches.length === 2) {
      isPinchingRef.current = true;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      initialDistanceRef.current = Math.sqrt(dx * dx + dy * dy);
      initialScaleRef.current = zoomScale;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 1 && !isPinchingRef.current && zoomScale > 1.0) {
      if (touchStartRef.current) {
        const dx = e.touches[0].clientX - touchStartRef.current.x;
        const dy = e.touches[0].clientY - touchStartRef.current.y;
        
        // Dynamic bounds based on scale to prevent panning offscreen
        const maxBoundX = (zoomScale - 1) * window.innerWidth * 0.45;
        const maxBoundY = (zoomScale - 1) * window.innerHeight * 0.45;
        
        setTranslateX(Math.max(-maxBoundX, Math.min(maxBoundX, initialTranslateRef.current.x + dx)));
        setTranslateY(Math.max(-maxBoundY, Math.min(maxBoundY, initialTranslateRef.current.y + dy)));
      }
    } else if (e.touches.length === 2 && initialDistanceRef.current !== null) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const currentDistance = Math.sqrt(dx * dx + dy * dy);
      const ratio = currentDistance / initialDistanceRef.current;
      
      const nextScale = Math.max(1.0, Math.min(initialScaleRef.current * ratio, 4.0));
      setZoomScale(nextScale);
      
      if (nextScale <= 1.01) {
        setTranslateX(0);
        setTranslateY(0);
      }
    }
  };

  const handleTouchEnd = () => {
    touchStartRef.current = null;
    initialDistanceRef.current = null;
  };
  
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
  const [shareCopied, setShareCopied] = useState(false);
  const [showHeartAnimation, setShowHeartAnimation] = useState(false);
  const [isLikeBtnAnimating, setIsLikeBtnAnimating] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const isFlagged = currentImage.flags?.includes('Flagged');
  const lastTap = useRef<number>(0);

  const modalRef = useRef<HTMLDivElement>(null);
  const leftPanelRef = useRef<HTMLDivElement>(null);
  const rightPanelRef = useRef<HTMLDivElement>(null);

  const [serverSuggestions, setServerSuggestions] = useState<ImageMeta[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [relatedVisibleCount, setRelatedVisibleCount] = useState(12);
  const [isLoadingMoreRelated, setIsLoadingMoreRelated] = useState(false);

  useEffect(() => {
    // 1. SILENTLY track user click (action='view') in background if user is logged in
    if (user?.uid && currentImage?.id) {
      fetch('/api/images?action=view', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageId: currentImage.id, userUid: user.uid })
      }).catch(err => console.error("View tracking failed:", err));
    }

    // Record user interest locally for client taste model
    recordClickInterest(currentImage);

    // 2. Fetch smart recommendations from dynamic backend
    if (currentImage?.id) {
      setIsLoadingSuggestions(true);
      const url = `/api/images?action=suggestions&imageId=${currentImage.id}${user?.uid ? `&userUid=${user.uid}` : ''}&limit=50`;
      
      fetch(url)
        .then(res => res.json())
        .then(data => {
          if (data.success && data.images) {
            setServerSuggestions(data.images);
          }
        })
        .catch(err => {
          console.error("Failed to fetch suggestions:", err);
        })
        .finally(() => {
          setIsLoadingSuggestions(false);
        });
    }
  }, [currentImage.id, user?.uid]);

  // Reset infinite scroll count when image changes
  useEffect(() => {
    setRelatedVisibleCount(12);
  }, [currentImage.id]);

  // User Data & Taste Algorithm + Image Similarity Match Engine
  const rankedCandidates = React.useMemo(() => {
    if (!currentImage?.id) return [];
    const targetBaseId = currentImage.id.split('_loop_')[0].split('_rel_loop_')[0];

    // Build map of server suggestions for quick rank lookup
    const serverRankMap = new Map<string, number>();
    serverSuggestions.forEach((s, idx) => {
      const base = s.id.split('_loop_')[0].split('_rel_loop_')[0];
      if (!serverRankMap.has(base)) serverRankMap.set(base, idx);
    });

    // Deduplicate candidate pool across server suggestions and all loaded images
    const seenBaseIds = new Set<string>();
    seenBaseIds.add(targetBaseId);

    const candidateList: ImageMeta[] = [];
    serverSuggestions.forEach(s => {
      const base = s.id.split('_loop_')[0].split('_rel_loop_')[0];
      if (!seenBaseIds.has(base)) {
        seenBaseIds.add(base);
        candidateList.push(s);
      }
    });

    allImages.forEach(img => {
      const base = img.id.split('_loop_')[0].split('_rel_loop_')[0];
      if (!seenBaseIds.has(base)) {
        seenBaseIds.add(base);
        candidateList.push(img);
      }
    });

    const targetFlags = (currentImage.flags || []).map(f => f.toLowerCase());
    const targetConcepts = ((currentImage as any).aiConcepts || []).map((c: string) => c.toLowerCase());
    const targetKeywords = `${currentImage.title || ''} ${currentImage.description || ''} ${currentImage.location || ''}`
      .toLowerCase()
      .split(/[\s,.-]+/)
      .filter(w => w.length > 3 && !['with', 'from', 'that', 'this', 'have', 'more', 'image', 'photo', 'glass'].includes(w));

    const scored = candidateList.map(cand => {
      const candBase = cand.id.split('_loop_')[0].split('_rel_loop_')[0];
      let score = 0;

      // 1. Tag / Flag overlap (primary thematic match)
      const candFlags = (cand.flags || []).map(f => f.toLowerCase());
      const sharedFlags = candFlags.filter(f => targetFlags.includes(f) && f !== 'flagged');
      score += sharedFlags.length * 600;

      // 2. AI Concepts overlap
      const candConcepts = ((cand as any).aiConcepts || []).map((c: string) => c.toLowerCase());
      const sharedConcepts = candConcepts.filter((c: string) => targetConcepts.includes(c));
      score += sharedConcepts.length * 550;

      // 3. Keyword / semantic title & description similarity
      if (targetKeywords.length > 0) {
        const candText = `${cand.title || ''} ${cand.description || ''} ${cand.location || ''}`.toLowerCase();
        let wordMatches = 0;
        for (const word of targetKeywords) {
          if (candText.includes(word)) wordMatches++;
        }
        score += Math.min(wordMatches * 220, 1100);
      }

      // 4. Same creator match
      if (cand.uploaderUid && cand.uploaderUid === currentImage.uploaderUid) {
        score += 850;
      }

      // 5. Location similarity
      if (currentImage.location && cand.location && currentImage.location.toLowerCase() === cand.location.toLowerCase()) {
        score += 500;
      }

      // 6. User Taste Profile & Data algorithm (localStorage click/search/interest history)
      score += getInterestBoost(cand);

      // 7. Liked by user
      if (user?.uid && cand.likedBy?.includes(user.uid)) {
        score += 300;
      }

      // 8. Server suggestion placement boost
      if (serverRankMap.has(candBase)) {
        const rank = serverRankMap.get(candBase)!;
        score += Math.max(1200 - (rank * 25), 300);
      }

      // 9. Popularity & Engagement tiebreaker
      score += Math.min((cand.likeCount || 0) * 10 + (cand.downloadCount || 0) * 4, 400);

      // 10. Subtle deterministic jitter for natural organic layout
      score += (Math.sin((candBase.charCodeAt(0) || 1) * 7) * 35);

      return { item: cand, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.map(s => s.item);
  }, [currentImage, serverSuggestions, allImages, user?.uid]);

  // Infinitely scrollable display generator: seamlessly loops the ranked pool with unique keys
  const displayRelated = React.useMemo(() => {
    if (!rankedCandidates || rankedCandidates.length === 0) return [];
    const results: ImageMeta[] = [];
    for (let i = 0; i < relatedVisibleCount; i++) {
      const original = rankedCandidates[i % rankedCandidates.length];
      const loop = Math.floor(i / rankedCandidates.length);
      results.push({
        ...original,
        id: loop === 0 ? original.id : `${original.id}_rel_loop_${loop}_${i}`
      });
    }
    return results;
  }, [rankedCandidates, relatedVisibleCount]);

  const loadMoreRelated = React.useCallback(() => {
    if (isLoadingMoreRelated || rankedCandidates.length === 0) return;
    setIsLoadingMoreRelated(true);
    setRelatedVisibleCount(prev => prev + 10);
    requestAnimationFrame(() => {
      setIsLoadingMoreRelated(false);
    });
  }, [isLoadingMoreRelated, rankedCandidates.length]);

  // Smooth Infinite Scroll Listener for both mobile (modalRef) and desktop (rightPanelRef)
  useEffect(() => {
    let ticking = false;
    const handleInfiniteScroll = (e: Event) => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const target = e.target as HTMLElement;
        if (target) {
          const distanceToBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
          if (distanceToBottom <= 650) {
            loadMoreRelated();
          }
        }
        ticking = false;
      });
    };

    const modalEl = modalRef.current;
    const rightEl = rightPanelRef.current;

    modalEl?.addEventListener('scroll', handleInfiniteScroll, { passive: true });
    rightEl?.addEventListener('scroll', handleInfiniteScroll, { passive: true });

    return () => {
      modalEl?.removeEventListener('scroll', handleInfiniteScroll);
      rightEl?.removeEventListener('scroll', handleInfiniteScroll);
    };
  }, [loadMoreRelated]);

  const handleSelectRelated = (img: ImageMeta) => {
    recordClickInterest(img);
    if (onSelectImage) {
      onSelectImage(img);
    }
    setRelatedVisibleCount(12);
    if (modalRef.current) {
      modalRef.current.scrollTo({ top: 0, behavior: 'instant' });
    }
    if (leftPanelRef.current) {
      leftPanelRef.current.scrollTo({ top: 0, behavior: 'instant' });
    }
    if (rightPanelRef.current) {
      rightPanelRef.current.scrollTo({ top: 0, behavior: 'instant' });
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
    setTranslateX(0);
    setTranslateY(0);
    setIsFullscreen(false);
  }, [image]);

  // Sync fullscreen state and sub-state to global window properties so App.tsx's single
  // backButton listener can check them and close fullscreen/sub-state before closing the modal.
  useEffect(() => {
    (window as any).__glassGalleryFullscreen = isFullscreen;
    (window as any).__glassGalleryCloseFullscreen = () => setIsFullscreen(false);
    return () => {
      (window as any).__glassGalleryFullscreen = false;
      (window as any).__glassGalleryCloseFullscreen = null;
    };
  }, [isFullscreen]);

  // Comments & Discussion State
  const [flatComments, setFlatComments] = useState<Comment[]>([]);
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [newCommentText, setNewCommentText] = useState('');
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [collapsedComments, setCollapsedComments] = useState<Set<string>>(new Set());
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editCommentText, setEditCommentText] = useState('');
  const [deleteConfirmCommentId, setDeleteConfirmCommentId] = useState<string | null>(null);
  const [isDeletingComment, setIsDeletingComment] = useState(false);
  const [isCommentsSectionHidden, setIsCommentsSectionHidden] = useState(false);

  // Swipe Down to Dismiss Gesture
  const headerTouchStartYRef = useRef<number | null>(null);

  // Sub-state Back Button sync with App.tsx
  useEffect(() => {
    const hasSubState = Boolean(deleteConfirmCommentId || replyToId || editingCommentId);
    (window as any).__glassGalleryModalHasSubState = hasSubState;
    (window as any).__glassGalleryModalCloseSubState = () => {
      setDeleteConfirmCommentId(null);
      setReplyToId(null);
      setEditingCommentId(null);
    };
    return () => {
      (window as any).__glassGalleryModalHasSubState = false;
      (window as any).__glassGalleryModalCloseSubState = null;
    };
  }, [deleteConfirmCommentId, replyToId, editingCommentId]);

  // Load comments when currentImage changes
  const loadComments = async (idToLoad: string) => {
    if (!idToLoad) return;
    setIsLoadingComments(true);
    try {
      const data = await getCommentsForImage(idToLoad);
      setFlatComments(data);
    } catch (err) {
      console.error("Failed to load comments:", err);
    } finally {
      setIsLoadingComments(false);
    }
  };

  useEffect(() => {
    loadComments(currentImage.id);
    setReplyToId(null);
    setReplyText('');
    setNewCommentText('');
    setEditingCommentId(null);
  }, [currentImage.id]);

  const handlePostComment = async () => {
    if (!user || !newCommentText.trim() || isSubmittingComment) return;
    setIsSubmittingComment(true);
    try {
      const newComment = await addCommentToImage(currentImage.id, user, newCommentText.trim());
      setFlatComments(prev => [newComment, ...prev]);
      setNewCommentText('');
      if (navigator.vibrate) navigator.vibrate(10);
    } catch (err) {
      console.error("Failed to post comment:", err);
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const handlePostReply = async (parentId: string) => {
    if (!user || !replyText.trim() || isSubmittingComment) return;
    setIsSubmittingComment(true);
    try {
      const newComment = await addCommentToImage(currentImage.id, user, replyText.trim(), parentId);
      setFlatComments(prev => [...prev, newComment]);
      setReplyText('');
      setReplyToId(null);
      if (navigator.vibrate) navigator.vibrate(10);
    } catch (err) {
      console.error("Failed to post reply:", err);
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const handleCommentLikeToggle = async (commentId: string) => {
    if (!user) return;
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
      if (navigator.vibrate) navigator.vibrate(10);
    } catch (err) {
      console.error("Failed to toggle comment like:", err);
    }
  };

  const handleEditCommentSubmit = async (commentId: string) => {
    if (!user || !editCommentText.trim() || isSubmittingComment) return;
    setIsSubmittingComment(true);
    try {
      await editComment(commentId, user.uid, editCommentText.trim());
      setFlatComments(prev => prev.map(c => c.id === commentId ? { ...c, content: editCommentText.trim() } : c));
      setEditingCommentId(null);
      setEditCommentText('');
      if (navigator.vibrate) navigator.vibrate(10);
    } catch (err) {
      console.error("Failed to edit comment:", err);
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!user) return;
    setIsDeletingComment(true);
    try {
      await deleteComment(commentId, user.uid);
      setFlatComments(prev => prev.filter(c => c.id !== commentId));
      setDeleteConfirmCommentId(null);
      if (navigator.vibrate) navigator.vibrate([15, 50, 15]);
    } catch (err) {
      console.error("Failed to delete comment:", err);
    } finally {
      setIsDeletingComment(false);
    }
  };

  // Build recursive comment tree
  const buildCommentTree = (comments: Comment[]): Comment[] => {
    const map = new Map<string, Comment>();
    const roots: Comment[] = [];
    comments.forEach(c => map.set(c.id, { ...c, replies: [] }));
    comments.forEach(c => {
      const node = map.get(c.id)!;
      if (c.parentId && map.has(c.parentId)) {
        map.get(c.parentId)!.replies!.push(node);
      } else {
        roots.push(node);
      }
    });
    return roots;
  };

  const treeComments = buildCommentTree(flatComments);

  // Render individual comment item
  const renderCommentNode = (comment: Comment, depth = 0): React.ReactNode => {
    const isReplying = replyToId === comment.id;
    const isCollapsed = collapsedComments.has(comment.id);
    const hasReplies = comment.replies && comment.replies.length > 0;
    const isAuthor = user?.uid === comment.userUid;
    const canDelete = isAuthor || user?.uid === currentImage.uploaderUid;

    if (isCollapsed) {
      return (
        <div 
          key={comment.id}
          onClick={() => setCollapsedComments(prev => { const n = new Set(prev); n.delete(comment.id); return n; })}
          className="py-1 px-2.5 rounded-lg bg-surface/40 border border-border/40 text-xs text-secondary flex items-center gap-1.5 cursor-pointer my-1 active:scale-[0.99] transition-transform"
        >
          <span className="font-mono text-accent text-[11px] font-bold">[+]</span>
          <span>Thread by {comment.userName} ({comment.replies?.length || 0} replies)</span>
        </div>
      );
    }

    return (
      <div 
        key={comment.id} 
        className={`flex flex-col gap-2 transform-gpu will-change-transform ${depth > 0 ? 'mt-2 pl-3 border-l-2 border-border/40 ml-2' : 'border-b border-border/30 pb-3 last:border-0 last:pb-0'}`}
      >
        <div className="flex gap-2.5 items-start">
          <img 
            src={comment.userPhotoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${comment.userName}`} 
            alt={comment.userName} 
            className="w-7 h-7 rounded-full object-cover flex-shrink-0 border border-border/60" 
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-xs text-primary leading-tight">{comment.userName}</span>
              <span className="text-[10px] text-secondary">
                {new Date(comment.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </span>
              {hasReplies && (
                <button
                  onClick={() => setCollapsedComments(prev => new Set(prev).add(comment.id))}
                  className="text-secondary/50 hover:text-secondary text-[10px] px-1 font-mono ml-auto"
                >
                  [-]
                </button>
              )}
            </div>

            {editingCommentId === comment.id ? (
              <div className="mt-1.5 flex flex-col gap-1.5">
                <textarea
                  value={editCommentText}
                  onChange={(e) => setEditCommentText(e.target.value)}
                  className="w-full bg-background border border-border focus:border-accent rounded-xl px-2.5 py-1.5 text-xs text-primary resize-none focus:outline-none"
                  rows={2}
                  autoFocus
                />
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => { setEditingCommentId(null); setEditCommentText(''); }}
                    className="text-[10px] text-secondary hover:text-primary px-2.5 py-1 font-medium"
                    disabled={isSubmittingComment}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleEditCommentSubmit(comment.id)}
                    disabled={!editCommentText.trim() || isSubmittingComment}
                    className="bg-accent text-surface px-3 py-1 rounded-full text-[10px] font-bold"
                  >
                    {isSubmittingComment ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-primary/90 mt-0.5 leading-relaxed break-words whitespace-pre-wrap">{comment.content}</p>
            )}

            {/* Comment Action Bar */}
            <div className="flex items-center mt-1.5 gap-3">
              <button
                onClick={() => handleCommentLikeToggle(comment.id)}
                className={`flex items-center gap-1 text-[10px] font-bold active:scale-95 transition-transform ${comment.likedBy?.includes(user?.uid || '') ? 'text-red-400' : 'text-secondary'}`}
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
                  className="text-[10px] font-bold text-accent hover:underline flex items-center gap-1 active:scale-95 transition-transform"
                >
                  Reply
                </button>
              )}

              {isAuthor && (
                <button
                  onClick={() => {
                    setEditingCommentId(comment.id);
                    setEditCommentText(comment.content);
                  }}
                  className="text-[10px] font-bold text-secondary hover:text-primary flex items-center gap-1 active:scale-95 transition-transform"
                >
                  Edit
                </button>
              )}

              {canDelete && (
                <button
                  onClick={() => setDeleteConfirmCommentId(comment.id)}
                  className="text-[10px] font-bold text-secondary/70 hover:text-red-400 p-1 rounded ml-auto flex items-center gap-1 active:scale-95 transition-transform"
                  title="Delete comment"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Delete
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Inline Reply Composer */}
        {isReplying && user && (
          <div className="mt-2 pl-8 flex flex-col gap-2">
            <div className="flex items-center justify-between text-[10px] text-accent font-semibold">
              <span>Replying to {comment.userName}</span>
              <button onClick={() => setReplyToId(null)} className="text-secondary hover:text-primary">&times; Cancel</button>
            </div>
            <textarea
              placeholder={`Write a reply...`}
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              rows={2}
              className="w-full bg-background border border-border/80 focus:border-accent rounded-xl py-2 px-3 text-xs text-primary resize-none focus:outline-none"
              autoFocus
            />
            <div className="flex justify-end">
              <button
                onClick={() => handlePostReply(comment.id)}
                disabled={!replyText.trim() || isSubmittingComment}
                className="bg-accent disabled:opacity-50 text-surface font-semibold px-3.5 py-1.5 rounded-full text-xs active:scale-95 transition-all shadow-sm flex items-center gap-1.5"
              >
                {isSubmittingComment ? <Spinner /> : 'Reply'}
              </button>
            </div>
          </div>
        )}

        {/* Nested Child Replies */}
        {hasReplies && (
          <div className="flex flex-col gap-2">
            {comment.replies!.map(child => renderCommentNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

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
    const origin = 'https://gg.modvc.org';
    const shareUrl = `${origin}/image/${currentImage.id}`;

    if (Capacitor.isNativePlatform()) {
      try {
        await Share.share({
          title: currentImage.title || 'Glass Gallery Artwork',
          text: `Check out this beautiful glass art by ${currentImage.uploaderName} on Glass Gallery!`,
          url: shareUrl,
          dialogTitle: 'Share Artwork'
        });
      } catch (err) {
        console.log("Capacitor share failed or was cancelled", err);
      }
    } else if (navigator.share) {
      const shareData = {
          title: currentImage.title || 'Glass Gallery Image',
          text: `Check out this beautiful glass art by ${currentImage.uploaderName} on Glass Gallery!`,
          url: shareUrl
      };
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
    <div className="fixed inset-0 z-[60] flex md:items-center md:justify-center p-0 md:p-4 bg-background md:bg-black/80 md:backdrop-blur-md animate-fade-in" onClick={onClose}>
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
        className="bg-background md:bg-surface border-0 md:border border-border w-full md:max-w-6xl h-full md:h-[92vh] flex flex-col md:flex-row overflow-y-auto md:overflow-hidden relative shadow-none md:shadow-2xl md:rounded-none md:rounded-3xl" 
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left Column: Pin details panel */}
        <div 
          ref={leftPanelRef}
          className="w-full md:w-[45%] flex flex-col md:h-full border-b border-border/20 md:border-b-0 md:border-r border-border md:overflow-y-auto [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-secondary/50 bg-background/5"
        >
          {/* Action Bar Header with Pull-Down Gesture indicator */}
          <div 
            onTouchStart={(e) => { headerTouchStartYRef.current = e.touches[0].clientY; }}
            onTouchEnd={(e) => {
              if (headerTouchStartYRef.current !== null) {
                const deltaY = e.changedTouches[0].clientY - headerTouchStartYRef.current;
                headerTouchStartYRef.current = null;
                if (deltaY > 60) {
                  if (navigator.vibrate) navigator.vibrate(10);
                  onClose();
                }
              }
            }}
            className="sticky top-0 z-30 bg-surface/90 backdrop-blur-md px-4 py-2.5 flex items-center justify-between border-b border-border/40 flex-shrink-0 touch-pan-y"
          >
            <button 
              onClick={onClose} 
              className="p-2 rounded-full hover:bg-border/70 text-secondary hover:text-primary transition-all flex items-center justify-center active:scale-95" 
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

              {/* Credit/Attribution button */}
              <button 
                onClick={() => setShowAttribution(true)} 
                className="bg-red-600 hover:bg-red-700 text-white font-semibold px-4 py-1.5 rounded-full text-xs transition-all shadow-md active:scale-95 ml-1"
              >
                Credit
              </button>
            </div>
          </div>

          {/* Main Image Container - Fullbleed cover on mobile, contained on desktop */}
          <div className="bg-background flex-shrink-0 flex items-center justify-center p-0 md:p-4 relative group select-none min-h-[300px] w-full">
            <img 
              src={currentImage.imageUrl} 
              alt={currentImage.title || 'Pinterest Pin'} 
              className={`w-full h-[60vh] md:h-auto md:max-h-[48vh] object-cover md:object-contain md:rounded-2xl shadow-md md:shadow-lg transition-transform duration-300 hover:scale-[1.01] ${isFlagged && !revealed ? 'blur-3xl scale-[1.03]' : 'cursor-zoom-in'}`}
              onClick={isFlagged && !revealed ? undefined : handleImageTap}
            />
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
          <div className="p-6 flex flex-col space-y-4">
            {/* Title & Description at the very top of details */}
            {(currentImage.title || currentImage.description) && (
               <div className="mb-2">
                    {currentImage.title && <h1 className="text-2xl font-bold text-primary mb-1">{currentImage.title}</h1>}
                    {currentImage.description && <p className="text-primary/80 text-sm whitespace-pre-wrap leading-relaxed">{currentImage.description}</p>}
               </div>
            )}

            {/* Pinterest Creator Row with Prominent Red Save Button */}
            <div className="flex items-center justify-between gap-4 py-3.5 border-t border-b border-border/40 my-1">
              <button 
                onClick={handleProfileClick} 
                className="flex items-center gap-3 text-left group/creator"
              >
                <img 
                  src={currentImage.uploaderPhotoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${currentImage.uploaderName}`} 
                  alt={currentImage.uploaderName} 
                  className="w-11 h-11 rounded-full object-cover border border-border shadow-sm group-hover/creator:scale-105 transition-transform" 
                />
                <div>
                  <p className="font-semibold text-sm leading-tight text-primary">{currentImage.uploaderName}</p>
                  <p className="text-xs text-secondary mt-0.5">
                    {currentImage.likeCount || 0} saves
                  </p>
                </div>
              </button>

              {/* Iconic Pinterest Big Red Save Button */}
              <button 
                onClick={handleLikeClick} 
                className={`px-6 py-2.5 rounded-full font-bold transition-all text-sm active:scale-95 shadow-md flex items-center justify-center gap-1.5 ${hasLiked ? 'bg-neutral-800 text-white hover:bg-neutral-700' : 'bg-[#E60023] hover:bg-[#AD0018] text-white'}`}
              >
                {hasLiked ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4.5 w-4.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : null}
                <span>{hasLiked ? 'Saved' : 'Save'}</span>
              </button>
            </div>

            {/* Additional details (location, tags, downloads, license) */}
            <div className="space-y-4 pt-1">
              {renderDetails()}
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
            {/* Comments & Community Discussion Section */}
            <div className="pt-4 border-t border-border/40 mt-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-primary flex items-center gap-2">
                  <span>Comments</span>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-border/60 text-secondary font-medium">
                    {flatComments.length}
                  </span>
                </h3>

                {flatComments.length > 0 && (
                  <button
                    onClick={() => setIsCommentsSectionHidden(prev => !prev)}
                    className="text-xs text-secondary hover:text-primary flex items-center gap-1 active:scale-95 transition-transform"
                  >
                    {isCommentsSectionHidden ? "Show comments" : "Hide comments"}
                  </button>
                )}
              </div>

              {/* Comment Composer */}
              {user ? (
                <div className="flex gap-2.5 items-start mb-4">
                  <img
                    src={user.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${user.displayName || 'User'}`}
                    alt="Current user"
                    className="w-7 h-7 rounded-full object-cover flex-shrink-0 border border-border"
                  />
                  <div className="flex-1 flex flex-col gap-2">
                    <textarea
                      placeholder="Share your thoughts..."
                      value={newCommentText}
                      onChange={(e) => setNewCommentText(e.target.value)}
                      rows={2}
                      className="w-full bg-background border border-border/80 focus:border-accent/60 rounded-xl py-2 px-3 text-xs text-primary placeholder-secondary focus:outline-none resize-none"
                    />
                    <div className="flex justify-end">
                      <button
                        onClick={handlePostComment}
                        disabled={!newCommentText.trim() || isSubmittingComment}
                        className="bg-accent hover:opacity-90 disabled:opacity-50 text-surface font-semibold px-3.5 py-1.5 rounded-full text-xs active:scale-95 transition-all shadow-md flex items-center gap-1.5"
                      >
                        {isSubmittingComment ? <Spinner /> : 'Comment'}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-surface/50 border border-border/60 rounded-xl text-center mb-4">
                  <p className="text-xs text-secondary">Log in to like and join the conversation!</p>
                </div>
              )}

              {/* Comments Stream */}
              {isCommentsSectionHidden ? (
                <div 
                  onClick={() => setIsCommentsSectionHidden(false)}
                  className="py-3 px-4 bg-background/50 border border-dashed border-border rounded-xl text-center cursor-pointer hover:border-accent/40 transition-colors my-2 active:scale-[0.99]"
                >
                  <p className="text-xs text-secondary flex items-center justify-center gap-1.5">
                    <span>Comments hidden</span>
                    <span className="text-accent font-semibold underline">Tap to view ({flatComments.length})</span>
                  </p>
                </div>
              ) : isLoadingComments ? (
                <div className="flex justify-center py-6">
                  <Spinner />
                </div>
              ) : treeComments.length > 0 ? (
                <div className="space-y-3 pt-1">
                  {treeComments.map(comment => renderCommentNode(comment))}
                </div>
              ) : (
                <p className="text-xs text-secondary text-center py-6 italic">No comments yet. Be the first to share your thoughts!</p>
              )}
            </div>

            {/* Native Delete Confirmation Bottom Sheet */}
            {deleteConfirmCommentId && (
              <div 
                className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in"
                onClick={() => setDeleteConfirmCommentId(null)}
              >
                <div 
                  className="w-full max-w-sm bg-surface border border-border rounded-3xl p-6 shadow-2xl transform-gpu animate-slide-up flex flex-col gap-4"
                  onClick={e => e.stopPropagation()}
                >
                  <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500 flex items-center justify-center mx-auto">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </div>
                  <div className="text-center">
                    <h3 className="text-base font-bold text-primary">Delete this comment?</h3>
                    <p className="text-xs text-secondary mt-1">
                      This comment will be permanently removed from the discussion.
                    </p>
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={() => setDeleteConfirmCommentId(null)}
                      className="flex-1 py-3 px-4 rounded-xl bg-neutral-800 text-secondary hover:text-primary font-semibold text-xs active:scale-95 transition-all"
                      disabled={isDeletingComment}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => deleteConfirmCommentId && handleDeleteComment(deleteConfirmCommentId)}
                      className="flex-1 py-3 px-4 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs active:scale-95 transition-all shadow-md flex items-center justify-center gap-1.5"
                      disabled={isDeletingComment}
                    >
                      {isDeletingComment ? <Spinner /> : "Yes, Delete"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: "More Like This" Masonry Feed */}
        <div 
          ref={rightPanelRef}
          className="w-full md:w-[55%] flex flex-col md:h-full bg-background overflow-visible md:overflow-y-auto [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-secondary/50 px-3 sm:px-4 md:p-8 pt-4 md:pt-8"
        >
          {/* Normal non-sticky heading that scrolls away with content on flat black background */}
          <div className="flex items-center mb-5 pt-2 flex-shrink-0">
            <h3 className="text-lg font-bold text-primary flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
              More like this
            </h3>
          </div>

          {isLoadingSuggestions && displayRelated.length === 0 ? (
            <div className="columns-2 sm:columns-3 gap-4 animate-pulse">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="break-inside-avoid mb-4 h-[180px] rounded-2xl bg-border/40 border border-border/20 backdrop-blur-md" />
              ))}
            </div>
          ) : displayRelated.length > 0 ? (
            <>
              <div className="columns-2 gap-4 animate-fade-in">
                {displayRelated.map(img => (
                  <div 
                    key={img.id}
                    onClick={() => handleSelectRelated(img)}
                    className="break-inside-avoid mb-6 group cursor-pointer flex flex-col bg-transparent overflow-hidden transition-all duration-300 hover:scale-[1.02] transform-gpu will-change-transform"
                  >
                    {/* Pinterest Pin Rounded Image Container with organic aspect height */}
                    <div className="relative overflow-hidden w-full rounded-2xl bg-neutral-900/10 dark:bg-white/5 shadow-sm group-hover:shadow-md transition-all duration-300">
                      {isVideoUrl(img.imageUrl) ? (
                        <video 
                          src={img.imageUrl} 
                          muted 
                          autoPlay 
                          loop 
                          playsInline 
                          className="w-full h-auto object-contain pointer-events-none transition-transform duration-500 group-hover:scale-[1.02]" 
                        />
                      ) : (
                        <img 
                          src={img.imageUrl} 
                          alt={img.title || 'Related photo'} 
                          className="w-full h-auto object-contain transition-transform duration-500 group-hover:scale-[1.02]" 
                          loading="lazy"
                        />
                      )}
                    </div>
                    {/* Pinterest Minimalist Metadata Row */}
                    <div className="pt-2 px-1 flex flex-col gap-1">
                      <p className="text-xs font-semibold text-primary truncate leading-tight group-hover:text-accent transition-colors">
                        {img.title || 'Untitled'}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <img 
                          src={img.uploaderPhotoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${img.uploaderName}`} 
                          alt={img.uploaderName} 
                          className="w-4 h-4 rounded-full object-cover shadow-sm" 
                        />
                        <p className="text-[10px] font-medium text-secondary truncate">
                          {img.uploaderName}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Seamless Infinite Scroll Loading Indicator */}
              <div className="w-full py-8 flex flex-col items-center justify-center text-secondary/60 gap-2">
                <div className="w-5 h-5 border-2 border-accent/40 border-t-accent rounded-full animate-spin" />
                <span className="text-[11px] font-medium tracking-wide">Loading more recommendations...</span>
              </div>
            </>
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

      {/* Fullscreen Lightbox Theater Overlay */}
      {isFullscreen && (
        <div 
          className="fixed inset-0 z-[80] bg-black/95 backdrop-blur-xl flex items-center justify-center overflow-hidden animate-fade-in select-none"
          onClick={() => setIsFullscreen(false)}
        >
          {/* Ambient Glassmorphic Backdrop */}
          <div 
            className="absolute inset-0 bg-cover bg-center blur-3xl opacity-35 scale-105 pointer-events-none transition-all duration-700" 
            style={{ backgroundImage: `url(${currentImage.imageUrl})` }}
          />

          {/* Top Bar Actions with auto-fade on zoom */}
          <div 
            className={`absolute top-6 left-6 right-6 z-[90] flex items-center justify-between pointer-events-none transition-opacity duration-200 ${
              zoomScale > 1.05 ? 'opacity-0' : 'opacity-100'
            }`}
          >
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

          {/* Centered Image Container with smooth touch gesture support (Pinch-to-zoom & pan) */}
          <div 
            className="relative z-10 flex items-center justify-center w-full h-full overflow-visible touch-none"
            onClick={(e) => e.stopPropagation()}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <img 
              src={currentImage.imageUrl} 
              alt={currentImage.title} 
              className="max-w-full max-h-full object-contain select-none pointer-events-none transition-shadow duration-300"
              style={{ 
                transform: `translate(${translateX}px, ${translateY}px) scale(${zoomScale})`,
                transition: touchStartRef.current || initialDistanceRef.current ? 'none' : 'transform 0.25s cubic-bezier(0.25, 0.46, 0.45, 0.94)'
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default ImageDetailModal;
