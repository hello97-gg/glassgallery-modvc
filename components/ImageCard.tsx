
import React, { useState } from 'react';
import type { User } from 'firebase/auth';
import type { ImageMeta, ProfileUser } from '../types';

interface ImageCardProps {
  image: ImageMeta;
  user: User | null;
  onClick: () => void;
  onViewProfile: (user: ProfileUser) => void;
  onLikeToggle: (image: ImageMeta) => void;
  className?: string;
}

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


const ImageCard: React.FC<ImageCardProps> = ({ image, user, onClick, onViewProfile, onLikeToggle, className = '' }) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isLikeAnimating, setIsLikeAnimating] = useState(false);
  const [revealed, setRevealed] = useState(false);
  
  const isFlagged = image.flags?.includes('Flagged');
  const combinedClassName = `block group relative bg-surface rounded-xl overflow-hidden cursor-pointer transition-transform duration-300 hover:scale-[1.03] mb-4 md:mb-6 break-inside-avoid ${className}`;
  const hasLiked = user && image.likedBy?.includes(user.uid);

  const handleProfileClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent the main card's onClick from firing
    onViewProfile({
      uploaderUid: image.uploaderUid,
      uploaderName: image.uploaderName,
      uploaderPhotoURL: image.uploaderPhotoURL,
    });
  };
  
  const handleLikeClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      setIsLikeAnimating(true);
      onLikeToggle(image);
      setTimeout(() => setIsLikeAnimating(false), 400);
  };

  const handleCardClick = (e: React.MouseEvent) => {
    if (isFlagged && !revealed) {
      e.preventDefault();
      e.stopPropagation();
      setRevealed(true);
    } else {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <div
      className={combinedClassName}
      onClick={handleCardClick}
    >
      {/* Invisible anchor link for SEO crawler indexation */}
      <a href={`/image/${image.id}`} className="sr-only" aria-hidden="true" tabIndex={-1}>
        View {image.title || "Image"} Details
      </a>
      {!isLoaded && (
        <div className="absolute inset-0 bg-gradient-to-r from-surface via-border to-surface bg-[length:200%_100%] animate-shimmer" />
      )}
      <img
        src={image.imageUrl}
        alt="User upload"
        className={`w-full h-auto min-h-[150px] object-cover transition-all duration-500 ease-in-out ${isLoaded ? 'opacity-100' : 'opacity-0'} ${isFlagged && !revealed ? 'blur-2xl scale-[1.05]' : ''}`}
        loading="lazy"
        onLoad={() => setIsLoaded(true)}
      />
      {isFlagged && !revealed && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-md z-20 flex flex-col items-center justify-center p-3 text-center transition-all duration-300">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-red-500 mb-2 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
             <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <p className="text-white text-xs font-bold uppercase tracking-wider mb-1">Sensitive Content</p>
          <button 
            onClick={(e) => {
              e.stopPropagation();
              setRevealed(true);
            }}
            className="mt-2 bg-white/20 hover:bg-white/30 text-white border border-white/40 rounded-full px-3 py-1 text-[10px] font-semibold transition-all backdrop-blur-sm"
          >
            Click to Reveal
          </button>
        </div>
      )}
      {/* Hidden on mobile (md:flex) to avoid sticky hover states. Added z-10 to ensure clicks are captured. */}
      <div className={`absolute inset-0 z-10 bg-gradient-to-t from-black/60 to-transparent hidden md:flex items-end justify-between p-3 transition-opacity duration-300 ${isLoaded && (!isFlagged || revealed) ? 'opacity-0 group-hover:opacity-100' : 'opacity-0'}`}>
        <button onClick={handleProfileClick} className="flex items-center space-x-2 group/profile hover:scale-105 transition-transform z-20">
            <img 
                src={image.uploaderPhotoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${image.uploaderName}&backgroundColor=ff5722,e91e63,9c27b0,673ab7,3f51b5,2196f3,03a9f4,00bcd4,009688,4caf50,8bc34a,cddc39,ffeb3b,ffc107,ff9800`}
                className="w-6 h-6 rounded-full border-2 border-surface"
                alt={image.uploaderName}
            />
            <p className="text-white text-xs font-semibold group-hover/profile:underline">{image.uploaderName}</p>
        </button>
        <button onClick={handleLikeClick} className="flex items-center space-x-1.5 text-white bg-black/20 backdrop-blur-sm rounded-full py-1 px-2.5 hover:text-accent hover:scale-105 transition-all z-20">
            <div className={isLikeAnimating ? 'animate-like-bounce' : ''}>
                {hasLiked ? <HeartIconSolid/> : <HeartIconOutline/>}
            </div>
            <span className="text-xs font-semibold">{image.likeCount || 0}</span>
        </button>
      </div>
    </div>
  );
};

export default ImageCard;
