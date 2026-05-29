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
