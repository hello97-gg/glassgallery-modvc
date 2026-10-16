import React from 'react';
import type { User } from 'firebase/auth';
import { ProfileUser, Notification } from '../types';

interface BottomNavProps {
  user: User | null;
  onCreateClick: () => void;
  onLoginClick: () => void;
  activeView: 'home' | 'explore' | 'reels' | 'profile' | 'notifications' | 'api';
  setView: (view: 'home' | 'explore' | 'reels' | 'notifications' | 'api') => void;
  onViewProfile: (user: ProfileUser) => void;
  notifications?: Notification[];
  onNotificationsClick?: () => void;
  visible?: boolean;
}

const BottomNav: React.FC<BottomNavProps> = ({ 
  user, 
  onCreateClick, 
  onLoginClick, 
  activeView, 
  setView, 
  onViewProfile,
  notifications,
  onNotificationsClick,
  visible = true
}) => {

  const handleProfileClick = () => {
    if (user) {
        onViewProfile({
            uploaderUid: user.uid,
            uploaderName: user.displayName || 'User',
            uploaderPhotoURL: user.photoURL || ''
        });
    } else {
        onLoginClick();
    }
  };

  const isNavVisible = visible;

  const btnBaseStyle: React.CSSProperties = {
    WebkitTapHighlightColor: 'transparent',
    outline: 'none',
    touchAction: 'manipulation',
    userSelect: 'none',
  };

  return (
    <div 
      className={`fixed left-1/2 -translate-x-1/2 bg-[#111111]/95 border border-white/10 rounded-[32px] px-3.5 py-2 flex items-center justify-between gap-1 shadow-2xl z-[65] md:hidden w-[295px] backdrop-blur-md select-none transition-all duration-300 ease-out ${
        isNavVisible ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-20 pointer-events-none'
      }`}
      style={{ 
        bottom: 'calc(max(env(safe-area-inset-bottom, 0px), 16px) + 8px)',
        WebkitTapHighlightColor: 'transparent',
        touchAction: 'manipulation',
        userSelect: 'none'
      }}
    >
      {/* Home Button */}
      <button
        onClick={() => setView('home')}
        style={btnBaseStyle}
        className={`flex flex-col items-center justify-center py-1.5 px-2.5 rounded-2xl transition-transform duration-100 ease-out active:scale-[0.94] focus:outline-none ${
          activeView === 'home' ? 'text-white' : 'text-neutral-400 hover:text-white'
        }`}
      >
        {activeView === 'home' ? (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6.5 w-6.5" viewBox="0 0 20 20" fill="currentColor">
            <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6.5 w-6.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.25}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
        )}
        <span className="text-[10px] font-bold mt-1 tracking-wide">Home</span>
      </button>

      {/* Explore/Search Button */}
      <button
        onClick={() => setView('explore')}
        style={btnBaseStyle}
        className={`flex flex-col items-center justify-center py-1.5 px-2.5 rounded-2xl transition-transform duration-100 ease-out active:scale-[0.94] focus:outline-none ${
          activeView === 'explore' ? 'text-white' : 'text-neutral-400 hover:text-white'
        }`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6.5 w-6.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={activeView === 'explore' ? 3 : 2.25}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <span className="text-[10px] font-bold mt-1 tracking-wide">Search</span>
      </button>

      {/* Reels Button */}
      <button
        onClick={() => setView('reels')}
        style={btnBaseStyle}
        className={`flex flex-col items-center justify-center py-1.5 px-2.5 rounded-2xl transition-transform duration-100 ease-out active:scale-[0.94] focus:outline-none ${
          activeView === 'reels' ? 'text-white' : 'text-neutral-400 hover:text-white'
        }`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6.5 w-6.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <rect x="2.5" y="3" width="19" height="18" rx="4" strokeWidth={activeView === 'reels' ? 2.25 : 1.75} />
          <line x1="2.5" y1="8" x2="21.5" y2="8" strokeWidth={activeView === 'reels' ? 2.25 : 1.75} />
          <line x1="7.5" y1="3" x2="5.5" y2="8" strokeWidth={activeView === 'reels' ? 2 : 1.75} strokeLinecap="round" />
          <line x1="13" y1="3" x2="11" y2="8" strokeWidth={activeView === 'reels' ? 2 : 1.75} strokeLinecap="round" />
          <line x1="18.5" y1="3" x2="16.5" y2="8" strokeWidth={activeView === 'reels' ? 2 : 1.75} strokeLinecap="round" />
          <polygon points="10,11.5 15.5,14.5 10,17.5" fill={activeView === 'reels' ? "currentColor" : "none"} strokeWidth={activeView === 'reels' ? 1.5 : 1.75} strokeLinejoin="round" />
        </svg>
        <span className="text-[10px] font-bold mt-1 tracking-wide">Reels</span>
      </button>

      {/* Profile/Saved Button */}
      <button
        onClick={handleProfileClick}
        style={btnBaseStyle}
        className={`flex flex-col items-center justify-center py-1.5 px-3 rounded-2xl transition-transform duration-100 ease-out active:scale-[0.94] focus:outline-none ${
          activeView === 'profile' ? 'text-white' : 'text-neutral-400 hover:text-white'
        }`}
      >
        {user ? (
          <img 
            src={user.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${user.displayName}`}
            alt="Saved avatar" 
            className={`w-6 h-6 rounded-full object-cover transition-all duration-200 ${
              activeView === 'profile' ? 'ring-2 ring-white ring-offset-1 ring-offset-[#111]' : 'opacity-85'
            }`}
          />
        ) : (
          <div className="w-6.5 h-6.5 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6.5 w-6.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.25}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
        )}
        <span className="text-[10px] font-bold mt-1 tracking-wide">Saved</span>
      </button>
    </div>
  );
};

export default BottomNav;
