// Client-side interest tracker for search intent + anonymous personalization
// Zero API cost — uses localStorage only

import type { ImageMeta } from '../types';

const STORAGE_KEY = 'gg_user_interests';
const MAX_INTERESTS = 30;
const CACHE_KEY = 'gg_personalized_cache_ts';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

interface InterestMap {
  [key: string]: number;
}

// --- Search Intent Tracking ---

export const recordSearchInterest = (query: string): void => {
  if (!query || query.trim().length < 3) return;
  const interests = getInterests();
  const key = query.toLowerCase().trim();
  interests[key] = (interests[key] || 0) + 1;
  saveInterests(interests);
};

export const recordClickInterest = (image: ImageMeta): void => {
  const interests = getInterests();
  // Extract tags and aiConcepts from clicked image
  const tags = image.flags || [];
  const concepts = (image as any).aiConcepts || [];
  tags.forEach((tag: string) => {
    const key = tag.toLowerCase();
    interests[key] = (interests[key] || 0) + 1;
  });
  concepts.forEach((concept: string) => {
    const key = concept.toLowerCase();
    interests[key] = (interests[key] || 0) + 0.5;
  });
  saveInterests(interests);
};

export const recordLikeInterest = (image: ImageMeta): void => {
  const interests = getInterests();
  const tags = image.flags || [];
  const concepts = (image as any).aiConcepts || [];
  // Likes are the strongest explicit signal (3x tags, 1.5x concepts)
  tags.forEach((tag: string) => {
    const key = tag.toLowerCase();
    interests[key] = (interests[key] || 0) + 3;
  });
  concepts.forEach((concept: string) => {
    const key = concept.toLowerCase();
    interests[key] = (interests[key] || 0) + 1.5;
  });
  saveInterests(interests);
};

export const recordWatchInterest = (image: ImageMeta, ratio: number): void => {
  if (ratio < 0.3) return; // Only count watch if they stayed for at least 30%
  const interests = getInterests();
  const tags = image.flags || [];
  const concepts = (image as any).aiConcepts || [];
  
  // Strong signal if watched > 50% (+2.5 weight), medium signal otherwise (+1 weight)
  const weightMultiplier = ratio >= 0.5 ? 2.5 : 1.0;

  tags.forEach((tag: string) => {
    const key = tag.toLowerCase();
    interests[key] = (interests[key] || 0) + weightMultiplier;
  });
  concepts.forEach((concept: string) => {
    const key = concept.toLowerCase();
    interests[key] = (interests[key] || 0) + (weightMultiplier * 0.5);
  });
  saveInterests(interests);
};

// --- Interest Querying ---

export const getInterests = (): InterestMap => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
};

// Calculate a personalization boost score for an image based on local interests
export const getInterestBoost = (image: ImageMeta): number => {
  const interests = getInterests();
  if (Object.keys(interests).length === 0) return 0;

  let score = 0;
  // Exact tag/concept matches are the highest-confidence signal — weight them above raw text hits.
  const tagSet = new Set((image.flags || []).map(t => t.toLowerCase()));
  const conceptSet = new Set(((image as any).aiConcepts || []).map((c: string) => c.toLowerCase()));
  const allText = `${image.title || ''} ${image.description || ''} ${(image.flags || []).join(' ')} ${((image as any).aiConcepts || []).join(' ')} ${image.location || ''}`.toLowerCase();

  for (const [term, weight] of Object.entries(interests)) {
    if (tagSet.has(term) || conceptSet.has(term)) {
      // Direct tag/concept match — aggressive boost
      score += Math.min(weight * 300, 1600);
    } else if (allText.includes(term)) {
      // Softer text/metadata match
      score += Math.min(weight * 150, 800);
    }
  }
  return Math.min(score, 4000); // Cap total boost
};

// --- Cache Management (Cost Optimization) ---

// Check if we should skip the personalized_feed API call (called within last 5 min)
export const shouldFetchPersonalizedFeed = (): boolean => {
  try {
    const lastFetch = parseInt(localStorage.getItem(CACHE_KEY) || '0');
    return (Date.now() - lastFetch) > CACHE_TTL;
  } catch {
    return true;
  }
};

export const markPersonalizedFeedFetched = (): void => {
  try {
    localStorage.setItem(CACHE_KEY, Date.now().toString());
  } catch {}
};

// --- Internal ---

const saveInterests = (interests: InterestMap): void => {
  try {
    // Keep only top N interests by weight
    const sorted = Object.entries(interests)
      .sort(([, a], [, b]) => b - a)
      .slice(0, MAX_INTERESTS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(sorted)));
  } catch {}
};
