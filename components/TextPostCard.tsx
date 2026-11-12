import React, { useState } from 'react';
import type { User } from 'firebase/auth';
import type { ImageMeta, ProfileUser } from '../types';
import { observeImpression } from '../services/impressionTracker';

interface TextPostCardProps {
  image: ImageMeta;
  user: User | null;
  onClick: () => void;
  onViewProfile: (user: ProfileUser) => void;
  onLikeToggle: (image: ImageMeta) => void;
  className?: string;
}

const HeartIconSolid = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-accent" viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
  </svg>
);

const HeartIconOutline = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-neutral-400 group-hover:text-accent transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
  </svg>
);

const CommentIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
  </svg>
);

const PinIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-accent" viewBox="0 0 20 20" fill="currentColor">
    <path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 18V4z" />
  </svg>
);

const TextPostCard: React.FC<TextPostCardProps> = ({
  image,
  user,
  onClick,
  onViewProfile,
  onLikeToggle,
  className = ''
}) => {
  const [isLikeAnimating, setIsLikeAnimating] = useState(false);
  const cardContainerRef = React.useRef<HTMLDivElement>(null);

  // Impression view tracking (MRC Standard)
  React.useEffect(() => {
    const el = cardContainerRef.current;
    if (!el) return;
    return observeImpression(el, image.id);
  }, [image.id]);

  const hasLiked = user && image.likedBy && image.likedBy.includes(user.uid);

  const handleLikeClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsLikeAnimating(true);
    setTimeout(() => setIsLikeAnimating(false), 500);
    onLikeToggle(image);
  };

  const handleProfileClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onViewProfile({
      uploaderUid: image.uploaderUid,
      uploaderName: image.uploaderName,
      uploaderPhotoURL: image.uploaderPhotoURL
    });
  };

  return (
    <div
      ref={cardContainerRef}
      className={`group relative overflow-hidden rounded-2xl bg-gradient-to-b from-surface/90 to-surface/60 backdrop-blur-xl border border-white/10 hover:border-accent/40 shadow-lg hover:shadow-accent/5 transition-all duration-300 cursor-pointer p-4 flex flex-col justify-between ${className}`}
      style={{
        contentVisibility: 'auto',
        containIntrinsicSize: '240px 220px',
        transform: 'translateZ(0)',
      }}
      onClick={onClick}
    >
      {/* Top Header: Pinned Tag & Author */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <button
          onClick={handleProfileClick}
          className="flex items-center gap-1.5 group/author hover:opacity-80 transition-opacity min-w-0"
        >
          <img
            src={image.uploaderPhotoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${image.uploaderName}&backgroundColor=ff5722,e91e63,9c27b0,673ab7,3f51b5`}
            className="w-5 h-5 rounded-full border border-white/20 shrink-0 object-cover"
            alt={image.uploaderName}
          />
          <span className="text-[11px] font-semibold text-neutral-300 truncate group-hover/author:text-white">
            @{image.uploaderName.replace(/\s+/g, '').toLowerCase()}
          </span>
        </button>

        {image.is_pinned && (
          <span className="flex items-center gap-1 text-[10px] font-bold text-accent bg-accent/15 px-2 py-0.5 rounded-full shrink-0">
            <PinIcon />
            <span>Pinned</span>
          </span>
        )}
      </div>

      {/* Post Title */}
      {image.title && (
        <h3 className="text-sm font-bold text-white mb-2 line-clamp-2 group-hover:text-accent transition-colors leading-snug">
          {image.title}
        </h3>
      )}

      {/* Post Text Body / Excerpt */}
      {image.description && (
        <div className="relative mb-4">
          <p className="text-xs text-neutral-300 line-clamp-4 leading-relaxed font-normal whitespace-pre-line">
            {image.description}
          </p>
          {/* Subtle text gradient fadeout on 4th line */}
          <div className="absolute bottom-0 inset-x-0 h-4 bg-gradient-to-t from-surface to-transparent pointer-events-none" />
        </div>
      )}

      {/* Tags preview if present */}
      {Array.isArray(image.flags) && image.flags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {image.flags.slice(0, 3).map((tag, i) => (
            <span key={i} className="text-[10px] text-neutral-400 bg-white/5 px-1.5 py-0.5 rounded-md">
              #{tag}
            </span>
          ))}
        </div>
      )}

      {/* Bottom Footer: Likes & Comments */}
      <div className="flex items-center justify-between pt-2.5 border-t border-white/5 text-xs text-neutral-400 mt-auto">
        <div className="flex items-center gap-3">
          {/* Like Button */}
          <button
            onClick={handleLikeClick}
            className="flex items-center gap-1.5 hover:text-accent transition-colors group/like"
          >
            <div className={isLikeAnimating ? 'animate-like-bounce' : ''}>
              {hasLiked ? <HeartIconSolid /> : <HeartIconOutline />}
            </div>
            <span className={`text-[11px] font-semibold ${hasLiked ? 'text-accent' : 'text-neutral-400'}`}>
              {image.likeCount || 0}
            </span>
          </button>

          {/* Comments count */}
          <div className="flex items-center gap-1.5 text-neutral-400">
            <CommentIcon />
            <span className="text-[11px] font-medium">{image.commentCount || 0}</span>
          </div>
        </div>

        {/* Community Pill or empty spacer */}
        {image.community_slug ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              window.history.pushState(null, '', `/c/${image.community_slug}`);
              window.dispatchEvent(new PopStateEvent('popstate'));
            }}
            className="flex items-center gap-1.5 px-2.5 py-1 min-h-[32px] sm:min-h-[26px] rounded-full bg-black/60 hover:bg-black/80 backdrop-blur-md border border-white/20 text-white text-[11px] font-bold transition-all cursor-pointer group/comm"
            title={`c/${image.community_slug}`}
          >
            {image.community_icon_url ? (
              <img src={image.community_icon_url} alt="" className="w-3.5 h-3.5 rounded-full object-cover shrink-0" />
            ) : (
              <span className="w-3.5 h-3.5 rounded-full bg-accent/30 text-accent text-[9px] font-bold flex items-center justify-center shrink-0">
                {image.community_slug[0]?.toUpperCase()}
              </span>
            )}
            <span className="text-[11px] font-bold text-white/95 group-hover/comm:text-accent truncate max-w-[110px]">
              c/{image.community_slug}
            </span>
          </button>
        ) : null}
      </div>
    </div>
  );
};

export default React.memo(TextPostCard);

