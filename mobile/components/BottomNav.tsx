import React from 'react';
import type { User } from 'firebase/auth';
import { ProfileUser, Notification } from '../types';

interface BottomNavProps {
  user: User | null;
  onCreateClick: () => void;
  onLoginClick: () => void;
  activeView: 'home' | 'explore' | 'profile' | 'notifications' | 'api';
  setView: (view: 'home' | 'explore' | 'notifications' | 'api') => void;
  onViewProfile: (user: ProfileUser) => void;
  notifications?: Notification[];
  onNotificationsClick?: () => void;
}

const BottomNav: React.FC<BottomNavProps> = ({ 
  user, 
  onCreateClick, 
  onLoginClick, 
  activeView, 
  setView, 
  onViewProfile,
  notifications,
  onNotificationsClick
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

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#111111]/95 border border-white/10 rounded-[32px] px-4 py-2 flex items-center justify-between gap-2 shadow-2xl z-40 md:hidden w-[240px] backdrop-blur-md select-none">
      {/* Home Button */}
      <button
        onClick={() => setView('home')}
        className={`flex flex-col items-center justify-center py-1.5 px-3 rounded-2xl transition-all duration-200 active:scale-90 focus:outline-none ${
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
        className={`flex flex-col items-center justify-center py-1.5 px-3 rounded-2xl transition-all duration-200 active:scale-90 focus:outline-none ${
          activeView === 'explore' ? 'text-white' : 'text-neutral-400 hover:text-white'
        }`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6.5 w-6.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={activeView === 'explore' ? 3 : 2.25}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <span className="text-[10px] font-bold mt-1 tracking-wide">Search</span>
      </button>

      {/* Profile/Saved Button */}
      <button
        onClick={handleProfileClick}
        className={`flex flex-col items-center justify-center py-1.5 px-3 rounded-2xl transition-all duration-200 active:scale-90 focus:outline-none ${
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
