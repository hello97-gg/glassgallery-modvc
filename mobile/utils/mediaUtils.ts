/**
 * Utility to detect whether a given URL or filename represents a video file.
 * Works with both direct file extensions and R2 URLs that may have mangled names.
 */

const VIDEO_EXTENSIONS = /\.(mp4|webm|mov|ogg|avi|mkv|m4v)$/i;
const VIDEO_NAME_PATTERNS = /\b(mp4|webm|mov|ogg|avi|mkv|m4v)\b/i;

/**
 * Checks if an imageUrl points to a video file.
 * Handles R2 URLs where the extension may be embedded inside the sanitized filename
 * (e.g. "1748123456-myclipmp4.jpg" still contains "mp4").
 * Also checks the raw filename for extension matches.
 */
export const isVideoUrl = (url?: string): boolean => {
  if (!url) return false;
  
  // Direct extension check (ideal case)
  if (VIDEO_EXTENSIONS.test(url)) return true;
  
  // R2 URLs: the original filename gets sanitized into the key 
  // e.g. "1748123456-myclipmp4.mp4" or with video content-type
  // Check for video extension patterns anywhere in the URL path
  try {
    const pathname = new URL(url).pathname;
    const filename = pathname.split('/').pop() || '';
    // Check if the filename (before the final forced extension) contains a video format hint
    // e.g. "1748123456-myvideoclipmp4.jpg" — strip trailing forced ext, check for video keywords
    const nameWithoutFinalExt = filename.replace(/\.[^.]+$/, '');
    if (VIDEO_NAME_PATTERNS.test(nameWithoutFinalExt)) return true;
  } catch {
    // If URL parsing fails, do a simple string check
    const lower = url.toLowerCase();
    if (lower.includes('.mp4') || lower.includes('.webm') || lower.includes('.mov') || lower.includes('.ogg')) return true;
  }
  
  return false;
};

/**
 * Determines MIME content type from a filename.
 */
export const getContentTypeFromName = (name: string): string => {
  const lower = name.toLowerCase();
  if (lower.endsWith('.mp4')) return 'video/mp4';
  if (lower.endsWith('.webm')) return 'video/webm';
  if (lower.endsWith('.mov')) return 'video/quicktime';
  if (lower.endsWith('.ogg')) return 'video/ogg';
  if (lower.endsWith('.avi')) return 'video/x-msvideo';
  if (lower.endsWith('.mkv')) return 'video/x-matroska';
  if (lower.endsWith('.m4v')) return 'video/mp4';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  return 'image/jpeg';
};

/**
 * Gets a clean file extension from the original name.
 */
export const getFileExtension = (name: string): string => {
  const match = name.match(/\.([a-zA-Z0-9]+)$/);
  return match ? match[1].toLowerCase() : 'jpg';
};

/**
 * Checks if a filename represents a video.
 */
export const isVideoFile = (name: string): boolean => {
  const ext = getFileExtension(name);
  return ['mp4', 'webm', 'mov', 'ogg', 'avi', 'mkv', 'm4v'].includes(ext);
};

import type { ImageMeta } from '../types';

/**
 * Computes related media items for a given item based on:
 * 1. Tag overlap matching (+10 per tag)
 * 2. Same author (+5)
 * 3. Title & description word similarity (+2..3 per keyword match)
 * 4. Same media type (video vs image) (+2)
 * 5. Popularity engagement (+0.2 per like)
 * 6. Post-specific deterministic hash variation to guarantee distinct recommendations across different posts
 */
export const getRelatedImages = (currentImage: ImageMeta, pool: ImageMeta[], limit: number = 10): ImageMeta[] => {
  if (!currentImage || !pool || pool.length === 0) return [];

  const currentBaseId = currentImage.id.split('_loop_')[0];

  // Filter out candidates that match current image base ID
  const candidates = pool.filter(img => img.id.split('_loop_')[0] !== currentBaseId);

  // Deduplicate by base ID to avoid duplicate cards in recommendation
  const uniqueMap = new Map<string, ImageMeta>();
  candidates.forEach(img => {
      const baseId = img.id.split('_loop_')[0];
      if (!uniqueMap.has(baseId)) {
          uniqueMap.set(baseId, img);
      }
  });
  const uniqueCandidates = Array.from(uniqueMap.values());

  const currentTags = (currentImage.tags || []).map(t => t.toLowerCase());
  const currentTitleWords = (currentImage.title || '').toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const currentDescWords = (currentImage.description || '').toLowerCase().split(/\s+/).filter(w => w.length > 3);

  // Simple deterministic string hash for seeding variation
  const getHash = (str: string) => {
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
          hash = (hash << 5) - hash + str.charCodeAt(i);
          hash |= 0;
      }
      return Math.abs(hash);
  };

  const imageHash = getHash(currentBaseId);

  const scored = uniqueCandidates.map((img) => {
      let score = 0;
      const candidateBaseId = img.id.split('_loop_')[0];

      // 1. Tag matching (+15) — strongest on-topic signal
      const imgTags = (img.tags || []).map(t => t.toLowerCase());
      const tagMatches = imgTags.filter(t => currentTags.includes(t)).length;
      score += tagMatches * 15;

      // 2. Author matching (+12) — "more from this creator"
      if (img.uploaderUid && img.uploaderUid === currentImage.uploaderUid) {
          score += 12;
      }

      // 3. Title/description word matching
      const imgText = `${img.title || ''} ${img.description || ''}`.toLowerCase();
      currentTitleWords.forEach(word => {
          if (imgText.includes(word)) score += 3;
      });
      currentDescWords.forEach(word => {
          if (imgText.includes(word)) score += 2;
      });

      // 4. Media type matching (+2)
      const isCurrentVideo = isVideoUrl(currentImage.imageUrl);
      const isImgVideo = isVideoUrl(img.imageUrl);
      if (isCurrentVideo === isImgVideo) score += 2;

      // 5. Popularity bonus (capped)
      const popularity = (img.likeCount || 0) * 0.2 + (img.viewCount || 0) * 0.05;
      score += Math.min(popularity, 10);

      // 6. Post-specific deterministic hash variation (0-16 pts) — enough to vary lists across
      //    posts without overpowering on-topic tag/author/keyword relevance
      const candidateHash = getHash(candidateBaseId);
      const hashVariation = ((imageHash ^ candidateHash) % 1000) / 62;
      score += hashVariation;

      return { img, score };
  });

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map(s => s.img);
};

