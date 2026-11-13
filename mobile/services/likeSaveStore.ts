import { useState, useEffect } from 'react';
import type { ImageMeta, User } from '../types';
import { triggerLikeHaptic } from '../utils/haptics';

export interface LikeSaveState {
  isLiked: boolean;
  isSaved: boolean;
  likeCount: number;
}

// In-memory store keyed by canonical post base ID
const store = new Map<string, LikeSaveState>();
const listeners = new Set<(baseId: string, state: LikeSaveState) => void>();
const inFlightOperations = new Set<string>();

export function getBaseId(id: string): string {
  if (!id) return '';
  return id.split('_loop_')[0].split('_rel_loop_')[0];
}

export function getLikeSaveState(imageId: string): LikeSaveState | undefined {
  const baseId = getBaseId(imageId);
  return store.get(baseId);
}

export function subscribeLikeSave(listener: (baseId: string, state: LikeSaveState) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notifyListeners(baseId: string, state: LikeSaveState) {
  listeners.forEach(fn => {
    try {
      fn(baseId, state);
    } catch (e) {
      console.warn('[LikeSaveStore] Listener error:', e);
    }
  });
}

/**
 * Hydrates store from incoming feed posts.
 * Preserves in-flight updates so network responses don't cause flicker.
 */
export function hydrateLikeSaveFromImages(images: ImageMeta[], userUid?: string) {
  if (!images || !Array.isArray(images)) return;

  // Also read localStorage saved IDs for fallback hydration
  let localSavedSet: Set<string> = new Set();
  try {
    const raw = localStorage.getItem('savedImages');
    if (raw) localSavedSet = new Set(JSON.parse(raw));
  } catch {}

  images.forEach(img => {
    const baseId = getBaseId(img.id);
    if (!baseId || inFlightOperations.has(baseId)) return;

    const existing = store.get(baseId);
    if (existing) return; // Keep existing memory state

    const hasLikedServer = Boolean(img.isLiked || (userUid && (img.likedBy || []).includes(userUid)));
    const hasSavedServer = Boolean(img.isSaved || localSavedSet.has(baseId) || hasLikedServer);
    // Linked state: heart and bookmark always show the SAME state
    const combined = hasLikedServer || hasSavedServer;

    const count = typeof img.likeCount === 'number' ? img.likeCount : (img.likedBy?.length || 0);

    const newState: LikeSaveState = {
      isLiked: combined,
      isSaved: combined,
      likeCount: count
    };

    store.set(baseId, newState);
  });
}

/**
 * Unified handler toggling both like & save together with optimistic updates,
 * atomic rollback on failure, and haptic feedback.
 */
export async function toggleLikeSaveUnified(
  image: ImageMeta,
  user: User | null,
  showToast?: (msg: string) => void
): Promise<LikeSaveState | null> {
  if (!user) {
    showToast?.('Please sign in to like and save posts');
    return null;
  }

  const baseId = getBaseId(image.id);
  if (!baseId) return null;

  if (inFlightOperations.has(baseId)) {
    return store.get(baseId) || null;
  }

  // Current state resolution
  let localSavedSet: Set<string> = new Set();
  try {
    const raw = localStorage.getItem('savedImages');
    if (raw) localSavedSet = new Set(JSON.parse(raw));
  } catch {}

  const currentInStore = store.get(baseId);
  const currentLiked = currentInStore 
    ? currentInStore.isLiked 
    : Boolean(image.isLiked || image.isSaved || localSavedSet.has(baseId) || (image.likedBy || []).includes(user.uid));
  
  const currentCount = currentInStore 
    ? currentInStore.likeCount 
    : (typeof image.likeCount === 'number' ? image.likeCount : (image.likedBy?.length || 0));

  // Target state
  const targetState = !currentLiked;
  const targetCount = targetState ? currentCount + 1 : Math.max(0, currentCount - 1);

  const previousState: LikeSaveState = {
    isLiked: currentLiked,
    isSaved: currentLiked,
    likeCount: currentCount
  };

  const optimisticState: LikeSaveState = {
    isLiked: targetState,
    isSaved: targetState,
    likeCount: targetCount
  };

  // 1. Optimistic update
  store.set(baseId, optimisticState);
  notifyListeners(baseId, optimisticState);

  // 2. Light haptic
  triggerLikeHaptic();

  // 3. Update localStorage saved images
  try {
    if (targetState) {
      localSavedSet.add(baseId);
    } else {
      localSavedSet.delete(baseId);
    }
    localStorage.setItem('savedImages', JSON.stringify(Array.from(localSavedSet)));
  } catch {}

  inFlightOperations.add(baseId);

  try {
    // Call like endpoint (supported on all backend versions)
    const likeRes = await fetch('/api/images?action=like', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageId: baseId,
        userUid: user.uid,
        userName: user.displayName || 'Someone',
        userPhotoURL: user.photoURL || '',
        targetState
      })
    });

    if (!likeRes.ok) {
      throw new Error(`Server returned ${likeRes.status}`);
    }

    // Fire-and-forget server save if available
    fetch('/api/images?action=save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageId: baseId,
        userUid: user.uid,
        userName: user.displayName || 'Someone',
        userPhotoURL: user.photoURL || '',
        targetState
      })
    }).catch(() => {});

    const likeData = await likeRes.json().catch(() => ({}));
    const confirmedCount = typeof likeData.likeCount === 'number' ? likeData.likeCount : targetCount;

    const confirmedState: LikeSaveState = {
      isLiked: targetState,
      isSaved: targetState,
      likeCount: confirmedCount
    };

    store.set(baseId, confirmedState);
    notifyListeners(baseId, confirmedState);
    return confirmedState;
  } catch (err) {
    console.error('[LikeSaveStore] Error during toggleLikeSave, rolling back:', err);
    // Rollback both icons atomically
    store.set(baseId, previousState);
    notifyListeners(baseId, previousState);

    // Revert localStorage
    try {
      if (previousState.isSaved) {
        localSavedSet.add(baseId);
      } else {
        localSavedSet.delete(baseId);
      }
      localStorage.setItem('savedImages', JSON.stringify(Array.from(localSavedSet)));
    } catch {}

    showToast?.('Unable to update like/save. Please try again.');
    return previousState;
  } finally {
    inFlightOperations.delete(baseId);
  }
}

/**
 * React hook to reactively track and toggle like & save for an image.
 */
export function useLikeSave(image: ImageMeta, user?: User | null, showToast?: (msg: string) => void) {
  const baseId = getBaseId(image.id);

  // Initial state computation
  const computeInitial = (): LikeSaveState => {
    const existing = store.get(baseId);
    if (existing) return existing;

    let localSaved = false;
    try {
      const raw = localStorage.getItem('savedImages');
      if (raw) localSaved = new Set(JSON.parse(raw)).has(baseId);
    } catch {}

    const hasLiked = Boolean(image.isLiked || (user && (image.likedBy || []).includes(user.uid)));
    const hasSaved = Boolean(image.isSaved || localSaved || hasLiked);
    const combined = hasLiked || hasSaved;
    const count = typeof image.likeCount === 'number' ? image.likeCount : (image.likedBy?.length || 0);

    const initial: LikeSaveState = {
      isLiked: combined,
      isSaved: combined,
      likeCount: count
    };
    store.set(baseId, initial);
    return initial;
  };

  const [state, setState] = useState<LikeSaveState>(computeInitial);

  useEffect(() => {
    // When baseId changes (e.g. reused component)
    setState(computeInitial());

    const unsubscribe = subscribeLikeSave((updatedId, newState) => {
      if (updatedId === baseId) {
        setState(newState);
      }
    });
    return unsubscribe;
  }, [baseId, user?.uid]);

  const toggle = async () => {
    return toggleLikeSaveUnified(image, user || null, showToast);
  };

  return {
    isLiked: state.isLiked,
    isSaved: state.isSaved,
    likeCount: state.likeCount,
    toggle
  };
}

