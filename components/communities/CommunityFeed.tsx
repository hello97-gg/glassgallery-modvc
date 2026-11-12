import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Virtuoso } from 'react-virtuoso';
import type { User } from 'firebase/auth';
import { ImageMeta, FeedSortMode, ProfileUser } from '../../types';
import { CommunityPostCard } from './CommunityPostCard';
import { deleteImageFromFirestore } from '../../services/firestoreService';

interface CommunityFeedProps {
  communityId: string;
  communitySlug: string;
  communityIconUrl?: string;
  user: User | null;
  onPostClick: (post: ImageMeta) => void;
  onCreatePostClick?: (communityId?: string, defaultType?: 'media' | 'text') => void;
  onViewProfile?: (user: ProfileUser) => void;
  onLikeToggle?: (post: ImageMeta) => void;
  onSaveToggle?: (post: ImageMeta) => void;
  savedImages?: Set<string>;
  isMod?: boolean;
}

export const CommunityFeed: React.FC<CommunityFeedProps> = ({
  communityId,
  communitySlug,
  communityIconUrl,
  user,
  onPostClick,
  onCreatePostClick,
  onViewProfile,
  onLikeToggle,
  onSaveToggle,
  savedImages = new Set(),
  isMod = false
}) => {
  const [sort, setSort] = useState<FeedSortMode>('hot');
  const [posts, setPosts] = useState<ImageMeta[]>([]);
  const [pinnedPosts, setPinnedPosts] = useState<ImageMeta[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isFetchingRef = useRef(false);

  const fetchPosts = useCallback(async (selectedSort: FeedSortMode, nextCursor: string | null = null) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    try {
      const isInitial = !nextCursor;
      if (isInitial) {
        setIsLoading(true);
        setError(null);
      } else {
        setIsLoadingMore(true);
      }

      const params = new URLSearchParams({
        communityId: communityId,
        community_id: communityId,
        sort: selectedSort,
        limit: '15'
      });
      if (nextCursor) params.set('cursor', nextCursor);
      if (user?.uid) params.set('uid', user.uid);

      const res = await fetch(`/api/communities/posts?${params.toString()}`);
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to load community feed.');
      }

      const mapPost = (p: any, forcedPinned?: boolean): ImageMeta => ({
        id: p.id,
        imageUrl: p.imageUrl || '',
        thumbnailUrl: p.thumbnailUrl || p.imageUrl || '',
        uploaderUid: p.uploaderUid,
        uploaderName: p.uploaderName || 'Anonymous',
        uploaderPhotoURL: p.uploaderPhotoURL || '',
        title: p.title || '',
        description: p.description || '',
        license: p.license || 'CC0',
        licenseUrl: p.licenseUrl || '',
        flags: typeof p.flags === 'string' ? JSON.parse(p.flags || '[]') : (p.flags || []),
        originalWorkUrl: p.originalWorkUrl || '',
        uploadedAt: p.uploadedAt,
        likeCount: p.likeCount || 0,
        downloadCount: p.downloadCount || 0,
        commentCount: p.commentCount || 0,
        viewCount: p.viewCount || 0,
        location: p.location || '',
        aiConcepts: typeof p.aiConcepts === 'string' ? JSON.parse(p.aiConcepts || '[]') : (p.aiConcepts || []),
        isLiked: p.isLiked,
        likedBy: p.likedBy || (p.isLiked && user ? [user.uid] : []),
        community_id: p.community_id || communityId,
        community_slug: p.community_slug || communitySlug,
        community_name: p.community_name || '',
        community_icon_url: p.community_icon_url || communityIconUrl,
        is_pinned: forcedPinned !== undefined ? forcedPinned : (p.is_pinned === 1 || Boolean(p.is_pinned)),
        is_locked: p.is_locked === 1 || Boolean(p.is_locked),
        mod_status: p.mod_status || 'approved'
      });

      const formatted: ImageMeta[] = (data.posts || []).map((p: any) => mapPost(p));

      if (isInitial) {
        const formattedPinned: ImageMeta[] = (data.pinned || []).map((p: any) => mapPost(p, true));
        setPinnedPosts(formattedPinned);
        setPosts(formatted);
      } else {
        setPosts(prev => {
          const existingIds = new Set(prev.map(item => item.id));
          const newUnique = formatted.filter(item => !existingIds.has(item.id));
          return [...prev, ...newUnique];
        });
      }

      setCursor(data.nextCursor || null);
      setHasMore(Boolean(data.hasMore && data.nextCursor));
    } catch (err: any) {
      console.error('[CommunityFeed Error]:', err);
      setError(err.message || 'Error loading posts.');
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
      isFetchingRef.current = false;
    }
  }, [communityId, communitySlug, communityIconUrl, user?.uid]);

  useEffect(() => {
    fetchPosts(sort);
  }, [communityId, sort, fetchPosts]);

  const handleSortChange = (newSort: FeedSortMode) => {
    if (newSort === sort) return;
    setSort(newSort);
    setCursor(null);
  };

  const handleLocalLikeToggle = (image: ImageMeta) => {
    setPosts(prev => prev.map(p => {
      if (p.id === image.id) {
        const wasLiked = user && p.likedBy && p.likedBy.includes(user.uid);
        return {
          ...p,
          likeCount: (p.likeCount || 0) + (wasLiked ? -1 : 1),
          likedBy: wasLiked
            ? (p.likedBy || []).filter(u => u !== user?.uid)
            : [...(p.likedBy || []), user?.uid || 'guest']
        };
      }
      return p;
    }));

    setPinnedPosts(prev => prev.map(p => {
      if (p.id === image.id) {
        const wasLiked = user && p.likedBy && p.likedBy.includes(user.uid);
        return {
          ...p,
          likeCount: (p.likeCount || 0) + (wasLiked ? -1 : 1),
          likedBy: wasLiked
            ? (p.likedBy || []).filter(u => u !== user?.uid)
            : [...(p.likedBy || []), user?.uid || 'guest']
        };
      }
      return p;
    }));

    if (onLikeToggle) {
      onLikeToggle(image);
    }
  };

  // Mod Action Handlers
  const handlePinToggle = async (post: ImageMeta) => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const action = post.is_pinned ? 'unpin' : 'pin';
      const res = await fetch('/api/communities/moderation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          action,
          communityId,
          postId: post.id
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to update pin state.');
      }
      fetchPosts(sort);
    } catch (err: any) {
      alert(err.message || 'Pin action failed.');
    }
  };

  const handleLockToggle = async (post: ImageMeta) => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const action = post.is_locked ? 'unlock' : 'lock';
      const res = await fetch('/api/communities/moderation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          action,
          communityId,
          postId: post.id
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to update lock state.');
      }
      setPosts(prev => prev.map(p => p.id === post.id ? { ...p, is_locked: !p.is_locked } : p));
      setPinnedPosts(prev => prev.map(p => p.id === post.id ? { ...p, is_locked: !p.is_locked } : p));
    } catch (err: any) {
      alert(err.message || 'Lock action failed.');
    }
  };

  const handleDeletePost = async (post: ImageMeta) => {
    if (!user) return;
    if (!confirm('Are you sure you want to delete this post?')) return;
    try {
      if (user.uid === post.uploaderUid) {
        await deleteImageFromFirestore(post.id);
      } else {
        const token = await user.getIdToken();
        const res = await fetch('/api/communities/moderation', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            action: 'remove_post',
            communityId,
            postId: post.id
          })
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Failed to delete post.');
        }
      }
      setPosts(prev => prev.filter(p => p.id !== post.id));
      setPinnedPosts(prev => prev.filter(p => p.id !== post.id));
    } catch (err: any) {
      alert(err.message || 'Delete action failed.');
    }
  };

  const handlePostUpdated = (updated: ImageMeta) => {
    setPosts(prev => prev.map(p => p.id === updated.id ? { ...p, ...updated } : p));
    setPinnedPosts(prev => prev.map(p => p.id === updated.id ? { ...p, ...updated } : p));
  };

  const allDisplayPosts = [...pinnedPosts, ...posts];

  return (
    <div className="w-full">
      {/* 1. Reddit-style "Create Post" Bar */}
      {onCreatePostClick && (
        <div
          onClick={() => onCreatePostClick(communityId, 'text')}
          className="w-full mb-3 p-3 rounded-2xl bg-surface/50 hover:bg-surface/75 border border-border shadow-sm flex items-center gap-3 cursor-pointer transition-all"
        >
          {/* Current User Avatar */}
          <div className="w-9 h-9 rounded-full overflow-hidden bg-accent/20 border border-border/80 shrink-0 flex items-center justify-center">
            {user?.photoURL ? (
              <img src={user.photoURL} alt={user.displayName || 'User'} className="w-full h-full object-cover" />
            ) : (
              <span className="text-xs font-bold text-accent">
                {(user?.displayName || 'U').charAt(0).toUpperCase()}
              </span>
            )}
          </div>

          {/* Fake Input Placeholder */}
          <div className="flex-1 bg-background/50 hover:bg-background/80 border border-border/70 rounded-xl px-4 py-2 text-xs text-secondary transition-colors">
            Create post
          </div>

          {/* Image Shortcut */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCreatePostClick(communityId, 'media');
            }}
            className="p-2 rounded-xl text-secondary hover:text-primary hover:bg-surface border border-transparent hover:border-border transition-all"
            title="Create image or video post"
            aria-label="Create media post"
          >
            <svg className="w-5 h-5 fill-none stroke-current" viewBox="0 0 24 24" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </button>

          {/* Text Shortcut */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCreatePostClick(communityId, 'text');
            }}
            className="p-2 rounded-xl text-secondary hover:text-primary hover:bg-surface border border-transparent hover:border-border transition-all"
            title="Create text post"
            aria-label="Create text post"
          >
            <svg className="w-5 h-5 fill-none stroke-current" viewBox="0 0 24 24" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
        </div>
      )}

      {/* 2. Sticky Sort Bar (Reddit-style Pills) */}
      <div className="sticky top-0 z-20 backdrop-blur-xl bg-background/85 py-2.5 mb-3 border-b border-border/40 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {([
            { id: 'hot', label: 'Hot', icon: (
              <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.527.82-1.109 2.072-1.723 3.65C7.79 8.23 6.945 10.39 6.27 12.162c-.67 1.76-1.07 3.018-1.07 3.838a6.5 6.5 0 1013 0c0-1.89-.92-3.69-2.22-4.99-.95-.95-2.07-1.85-3.585-3.457zM11 15a2 2 0 11-4 0 2 2 0 014 0z" clipRule="evenodd" />
              </svg>
            )},
            { id: 'new', label: 'New', icon: (
              <svg className="w-3.5 h-3.5 fill-none stroke-current" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )},
            { id: 'top', label: 'Top', icon: (
              <svg className="w-3.5 h-3.5 fill-none stroke-current" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            )},
            { id: 'rising', label: 'Rising', icon: (
              <svg className="w-3.5 h-3.5 fill-none stroke-current" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
              </svg>
            )}
          ] as const).map(({ id, label, icon }) => (
            <button
              key={id}
              onClick={() => handleSortChange(id as FeedSortMode)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 ${
                sort === id
                  ? 'bg-accent text-surface shadow-sm'
                  : 'text-secondary hover:text-primary hover:bg-surface/60'
              }`}
            >
              {icon}
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 3. Loading Skeletons */}
      {isLoading && (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="w-full rounded-2xl bg-surface/40 border border-border/40 p-5 animate-pulse space-y-3.5"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-6 h-6 rounded-full bg-surface" />
                <div className="w-24 h-4 bg-surface rounded" />
                <div className="w-16 h-3 bg-surface/60 rounded" />
              </div>
              <div className="w-3/4 h-5 bg-surface rounded" />
              <div className="w-full h-48 bg-surface/50 rounded-xl" />
              <div className="flex gap-2 pt-2">
                <div className="w-16 h-8 bg-surface/60 rounded-full" />
                <div className="w-16 h-8 bg-surface/60 rounded-full" />
                <div className="w-16 h-8 bg-surface/60 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 4. Error State */}
      {!isLoading && error && (
        <div className="p-6 text-center bg-surface/40 border border-border rounded-2xl my-6">
          <p className="text-sm text-red-400 mb-3">{error}</p>
          <button
            onClick={() => fetchPosts(sort)}
            className="px-4 py-2 bg-surface hover:bg-border/60 rounded-xl text-xs font-semibold text-primary transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* 5. Empty State */}
      {!isLoading && !error && allDisplayPosts.length === 0 && (
        <div className="py-16 px-4 text-center bg-surface/30 border border-border/40 rounded-2xl my-2">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-surface flex items-center justify-center text-secondary border border-border">
            <svg className="w-7 h-7 text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <h3 className="text-base font-bold text-primary mb-1">No posts in this community yet</h3>
          <p className="text-xs text-secondary max-w-sm mx-auto mb-5 leading-relaxed">
            Be the first to share an aesthetic image, showcase your visual work, or start a discussion.
          </p>
          {onCreatePostClick && (
            <button
              onClick={() => onCreatePostClick(communityId, 'text')}
              className="px-5 py-2.5 rounded-xl bg-accent text-surface text-xs font-bold hover:opacity-90 transition-all shadow-md inline-flex items-center gap-1.5"
            >
              <span>+</span>
              <span>Create the First Post</span>
            </button>
          )}
        </div>
      )}

      {/* 6. Single-Column Vertical Feed List (react-virtuoso) */}
      {!isLoading && allDisplayPosts.length > 0 && (
        <div className="w-full">
          <Virtuoso
            useWindowScroll
            data={allDisplayPosts}
            endReached={() => {
              if (hasMore && !isLoadingMore && cursor) {
                fetchPosts(sort, cursor);
              }
            }}
            itemContent={(_, post) => (
              <div key={post.id} className="pb-3.5">
                <CommunityPostCard
                  post={post}
                  user={user}
                  communitySlug={communitySlug}
                  communityIconUrl={communityIconUrl}
                  onPostClick={onPostClick}
                  onViewProfile={onViewProfile}
                  onLikeToggle={handleLocalLikeToggle}
                  onSaveToggle={onSaveToggle}
                  isSaved={savedImages.has(post.id)}
                  isMod={isMod}
                  onPinToggle={handlePinToggle}
                  onLockToggle={handleLockToggle}
                  onDeletePost={handleDeletePost}
                  onPostUpdated={handlePostUpdated}
                />
              </div>
            )}
            components={{
              Footer: () => (
                isLoadingMore ? (
                  <div className="py-6 flex justify-center items-center">
                    <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : null
              )
            }}
          />
        </div>
      )}
    </div>
  );
};

export default React.memo(CommunityFeed);
