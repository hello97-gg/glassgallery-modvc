import React, { useState } from 'react';
import type { User } from 'firebase/auth';
import type { ImageMeta, ProfileUser } from '../types';

interface InfiniteFeedProps {
  images: ImageMeta[];
  user: User | null;
  onImageClick: (image: ImageMeta) => void;
  onViewProfile: (user: ProfileUser) => void;
  onLikeToggle: (image: ImageMeta) => void;
  onLoginClick: () => void;
  feedTab: 'discover' | 'following';
  setFeedTab: (tab: 'discover' | 'following') => void;
  onCreateClick: () => void;
  savedImages: Set<string>;
  onSaveToggle: (image: ImageMeta) => void;
}

export const FeedItem: React.FC<{
  image: ImageMeta;
  user: any;
  onImageClick: (image: ImageMeta) => void;
  onViewProfile: (user: ProfileUser) => void;
  onLikeToggle: (image: ImageMeta) => void;
  onLoginClick: () => void;
  savedImages: Set<string>;
  onSaveToggle: (image: ImageMeta) => void;
}> = ({ image, user, onImageClick, onViewProfile, onLikeToggle, onLoginClick, savedImages, onSaveToggle }) => {
  const hasLiked = user ? (image.likedBy || []).includes(user.uid) : false;
  const baseId = image.id.split('_loop_')[0];
  const hasSaved = savedImages.has(baseId);

  const formatTimeAgo = (timestamp: any) => {
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
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
    
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + 'y';
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + 'mo';
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + 'd';
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + 'h';
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + 'm';
    return Math.floor(seconds) + 's';
  };

  return (
    <article className="flex gap-3 p-4 border-b border-border hover:bg-surface/30 transition-colors cursor-pointer" onClick={() => onImageClick(image)}>
      {/* Left Column: Avatar */}
      <div className="shrink-0">
         <img 
            src={image.uploaderPhotoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${image.uploaderName}`}
            alt={image.uploaderName}
            className="w-10 h-10 rounded-full object-cover cursor-pointer hover:opacity-80 transition-opacity"
            onClick={(e) => {
               e.stopPropagation();
               onViewProfile({
                  uploaderUid: image.uploaderUid,
                  uploaderName: image.uploaderName,
                  uploaderPhotoURL: image.uploaderPhotoURL
               });
            }}
         />
      </div>

      {/* Right Column: Content */}
      <div className="flex-1 min-w-0 flex flex-col">
          {/* Header */}
          <div className="flex items-baseline gap-1.5 mb-1 truncate">
             <span 
                className="font-bold text-[15px] text-primary hover:underline cursor-pointer truncate"
                onClick={(e) => {
                   e.stopPropagation();
                   onViewProfile({
                      uploaderUid: image.uploaderUid,
                      uploaderName: image.uploaderName,
                      uploaderPhotoURL: image.uploaderPhotoURL
                   });
                }}
             >
                 {image.uploaderName}
             </span>
             <span className="text-[15px] text-secondary truncate">
                 @{image.uploaderName.toLowerCase().replace(/\s+/g, '')}
             </span>
             <span className="text-secondary px-1">·</span>
             <span className="text-[15px] text-secondary hover:underline cursor-pointer whitespace-nowrap">
                 {formatTimeAgo(image.uploadedAt)}
             </span>
          </div>

          {/* Text Content */}
          <div className="text-[15px] text-primary whitespace-pre-wrap break-words mb-3 leading-snug">
             {image.title && <span className="font-semibold block">{image.title}</span>}
             {image.description && <span className="block mt-1">{image.description}</span>}
          </div>

          {/* Image Attachment */}
          <div className="rounded-2xl border border-border overflow-hidden mb-3 max-h-[500px]">
             <img 
               src={image.imageUrl} 
               alt={image.title || 'Post image'} 
               className="w-full h-full object-cover max-h-[500px]"
               loading="lazy"
             />
          </div>

          {/* Action Bar */}
          <div className="flex justify-between items-center text-secondary w-full max-w-md mt-1">
             {/* Reply / Comment */}
             <button 
                className="flex items-center gap-2 group cursor-pointer"
                onClick={(e) => {
                   e.stopPropagation();
                   onImageClick(image);
                }}
             >
                <div className="w-8 h-8 rounded-full flex items-center justify-center group-hover:bg-accent/10 group-hover:text-accent transition-colors">
                    <svg viewBox="0 0 24 24" aria-hidden="true" className="w-[18px] h-[18px] fill-current"><g><path d="M1.751 10c0-4.42 3.584-8 8.005-8h4.366c4.49 0 8.129 3.64 8.129 8.13 0 2.96-1.607 5.68-4.196 7.11l-8.054 4.46v-3.69h-.067c-4.49.1-8.183-3.51-8.183-8.01zm8.005-6c-3.317 0-6.005 2.69-6.005 6 0 3.37 2.77 6.08 6.138 6.01l.351-.01h1.761v2.3l5.087-2.81c1.951-1.08 3.163-3.13 3.163-5.36 0-3.39-2.744-6.13-6.129-6.13H9.756z"></path></g></svg>
                </div>
                <span className="text-[13px] group-hover:text-accent transition-colors">{image.commentCount || 0}</span>
             </button>

             {/* Like */}
             <button 
                className="flex items-center gap-2 group cursor-pointer"
                onClick={(e) => {
                   e.stopPropagation();
                   onLikeToggle(image);
                }}
             >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center group-hover:bg-red-500/10 ${hasLiked ? 'text-red-500' : 'group-hover:text-red-500'} transition-colors`}>
                    {hasLiked ? (
                        <svg viewBox="0 0 24 24" aria-hidden="true" className="w-[18px] h-[18px] fill-current"><g><path d="M20.884 13.19c-1.351 2.48-4.001 5.12-8.379 7.67l-.503.3-.504-.3c-4.379-2.55-7.029-5.19-8.382-7.67-1.36-2.5-1.41-4.86-.514-6.67.887-1.79 2.647-2.91 4.601-3.01 1.651-.09 3.368.56 4.798 2.01 1.429-1.45 3.146-2.1 4.796-2.01 1.954.1 3.714 1.22 4.601 3.01.896 1.81.846 4.17-.514 6.67z"></path></g></svg>
                    ) : (
                        <svg viewBox="0 0 24 24" aria-hidden="true" className="w-[18px] h-[18px] fill-current"><g><path d="M16.697 5.5c-1.222-.06-2.679.51-3.89 2.16l-.805 1.09-.806-1.09C9.984 6.01 8.526 5.44 7.304 5.5c-1.243.07-2.349.78-2.91 1.91-.552 1.12-.633 2.78.479 4.82 1.074 1.97 3.257 4.27 7.129 6.61 3.87-2.34 6.052-4.64 7.126-6.61 1.111-2.04 1.03-3.7.477-4.82-.561-1.13-1.666-1.84-2.908-1.91zm4.187 7.69c-1.351 2.48-4.001 5.12-8.379 7.67l-.503.3-.504-.3c-4.379-2.55-7.029-5.19-8.382-7.67-1.36-2.5-1.41-4.86-.514-6.67.887-1.79 2.647-2.91 4.601-3.01 1.651-.09 3.368.56 4.798 2.01 1.429-1.45 3.146-2.1 4.796-2.01 1.954.1 3.714 1.22 4.601 3.01.896 1.81.846 4.17-.514 6.67z"></path></g></svg>
                    )}
                </div>
                <span className={`text-[13px] transition-colors ${hasLiked ? 'text-red-500' : 'group-hover:text-red-500'}`}>{image.likeCount || 0}</span>
             </button>

             {/* Views/Stats */}
             <div className="flex items-center gap-2 group cursor-pointer">
                <div className="w-8 h-8 rounded-full flex items-center justify-center group-hover:bg-accent/10 group-hover:text-accent transition-colors">
                    <svg viewBox="0 0 24 24" aria-hidden="true" className="w-[18px] h-[18px] fill-current"><g><path d="M8.75 21V3h2v18h-2zM18 21V8.5h2V21h-2zM4 21l.004-10h2L6 21H4zm9.248 0v-7h2v7h-2z"></path></g></svg>
                </div>
                <span className="text-[13px] group-hover:text-accent transition-colors">{image.viewCount || 0}</span>
             </div>

             {/* Bookmark / Save */}
             <button 
                className="flex items-center gap-2 group cursor-pointer"
                onClick={(e) => {
                   e.stopPropagation();
                   onSaveToggle(image);
                }}
             >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${hasSaved ? 'text-blue-500 bg-blue-500/10' : 'group-hover:bg-blue-500/10 group-hover:text-blue-500'}`}>
                    {hasSaved ? (
                         <svg viewBox="0 0 24 24" aria-hidden="true" className="w-[18px] h-[18px] fill-current"><g><path d="M4 4.5C4 3.12 5.119 2 6.5 2h11C18.881 2 20 3.12 20 4.5v18.44l-8-5.71-8 5.71V4.5z"></path></g></svg>
                    ) : (
                         <svg viewBox="0 0 24 24" aria-hidden="true" className="w-[18px] h-[18px] fill-current"><g><path d="M4 4.5C4 3.12 5.119 2 6.5 2h11C18.881 2 20 3.12 20 4.5v18.44l-8-5.71-8 5.71V4.5zM6.5 4c-.276 0-.5.22-.5.5v14.56l6-4.29 6 4.29V4.5c0-.28-.224-.5-.5-.5h-11z"></path></g></svg>
                    )}
                </div>
             </button>

             {/* Share */}
             <button 
                className="flex items-center gap-2 group cursor-pointer"
                onClick={(e) => {
                   e.stopPropagation();
                   const url = `${window.location.origin}/image/${image.id}`;
                   if (navigator.share) {
                       navigator.share({ title: image.title, url });
                   } else {
                       navigator.clipboard.writeText(url);
                       alert("Link copied to clipboard!");
                   }
                }}
             >
                <div className="w-8 h-8 rounded-full flex items-center justify-center group-hover:bg-accent/10 group-hover:text-accent transition-colors">
                    <svg viewBox="0 0 24 24" aria-hidden="true" className="w-[18px] h-[18px] fill-current"><g><path d="M12 2.59l5.7 5.7-1.41 1.42L13 6.41V16h-2V6.41l-3.3 3.3-1.41-1.42L12 2.59zM21 15l-.02 3.51c0 1.38-1.12 2.49-2.5 2.49H5.5C4.11 21 3 19.88 3 18.5V15h2v3.5c0 .28.22.5.5.5h12.98c.28 0 .5-.22.5-.5L19 15h2z"></path></g></svg>
                </div>
             </button>
          </div>
      </div>
    </article>
  );
};

const InfiniteFeed: React.FC<InfiniteFeedProps> = ({ images, user, onImageClick, onViewProfile, onLikeToggle, onLoginClick, feedTab, setFeedTab, onCreateClick, savedImages, onSaveToggle }) => {
  return (
    <div className="w-full flex justify-center bg-background min-h-screen">
       <div className="w-full max-w-2xl border-l border-r border-border min-h-screen pb-20 md:pb-0">
          {/* Top Header Tabs */}
          <div className="sticky top-0 z-10 bg-background/90 backdrop-blur-md border-b border-border">
             <div className="flex">
                <button 
                  className={`flex-1 pt-4 pb-3 text-[15px] font-bold hover:bg-surface/30 transition-colors relative ${feedTab === 'discover' ? 'text-primary' : 'text-secondary font-medium'}`}
                  onClick={() => setFeedTab('discover')}
                >
                  Discover
                  {feedTab === 'discover' && <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-16 h-1 bg-accent rounded-t-full"></div>}
                </button>
                <button 
                  className={`flex-1 pt-4 pb-3 text-[15px] font-bold hover:bg-surface/30 transition-colors relative ${feedTab === 'following' ? 'text-primary' : 'text-secondary font-medium'}`}
                  onClick={() => {
                     if (!user) onLoginClick();
                     else setFeedTab('following');
                  }}
                >
                  Following
                  {feedTab === 'following' && <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-16 h-1 bg-accent rounded-t-full"></div>}
                </button>
             </div>
          </div>

          {/* Create Post Section */}
          <div className="flex gap-4 p-4 border-b border-border hover:bg-surface/30 cursor-text transition-colors" onClick={user ? onCreateClick : onLoginClick}>
             <img 
                 src={user?.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${user?.displayName || 'Guest'}`}
                 alt="User"
                 className="w-10 h-10 rounded-full object-cover shrink-0 cursor-pointer"
             />
             <div className="flex-1 flex flex-col justify-center">
                 <div className="text-[20px] text-secondary/70 font-medium">What is happening?!</div>
             </div>
             <button className="shrink-0 flex items-center justify-center w-9 h-9 rounded-full text-accent hover:bg-accent/10 transition-colors mt-0.5">
                 <svg viewBox="0 0 24 24" className="w-[22px] h-[22px] fill-current"><g><path d="M3 5.5C3 4.119 4.119 3 5.5 3h13C19.881 3 21 4.119 21 5.5v13c0 1.381-1.119 2.5-2.5 2.5h-13C4.119 21 3 19.881 3 18.5v-13zM5.5 5c-.276 0-.5.224-.5.5v9.086l3-3 3 3 5-5 3 3V5.5c0-.276-.224-.5-.5-.5h-13zM19 15.414l-3-3-5 5-3-3-3 3V18.5c0 .276.224.5.5.5h13c.276 0 .5-.224.5-.5v-3.086zM9.75 7C8.784 7 8 7.784 8 8.75s.784 1.75 1.75 1.75 1.75-.784 1.75-1.75S10.716 7 9.75 7z"></path></g></svg>
             </button>
          </div>

          {/* Feed List */}
          <div className="flex flex-col">
             {images.map((image, index) => (
               <FeedItem 
                 key={`${image.id}_${index}`} 
                 image={image} 
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
  );
};

export default InfiniteFeed;
