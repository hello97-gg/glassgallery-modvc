
import React from 'react';
import type { User } from 'firebase/auth';
import { ProfileUser, Notification } from '../types';

interface BottomNavProps {
  user: User | null;
  onCreateClick: () => void;
  onLoginClick: () => void;
  activeView: 'home' | 'discover' | 'explore' | 'profile' | 'notifications' | 'api' | 'app' | 'legal' | 'post';
  setView: (view: 'home' | 'discover' | 'explore' | 'notifications' | 'api' | 'app') => void;
  onViewProfile: (user: ProfileUser) => void;
  notifications: Notification[];
  onNotificationsClick: () => void;
}

const NavItem: React.FC<{
  children: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
}> = ({ children, onClick, active }) => (
  <button
    onClick={onClick}
    className={`flex flex-col items-center justify-center flex-1 h-16 transition-colors duration-200 focus:outline-none relative ${active ? 'text-primary' : 'text-secondary hover:text-primary'}`}
    aria-current={active ? 'page' : undefined}
  >
    {children}
  </button>
);

const BottomNav: React.FC<BottomNavProps> = ({ user, onCreateClick, onLoginClick, activeView, setView, onViewProfile, notifications, onNotificationsClick }) => {

  const unreadCount = notifications.filter(n => !n.read).length;

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
  }

  return (
    <footer className="fixed bottom-0 left-0 right-0 h-16 bg-surface border-t border-border flex justify-around items-center z-40 md:hidden">
      <NavItem onClick={() => setView('home')} active={activeView === 'home'}>
        {activeView === 'home' ? (
             <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" viewBox="0 0 20 20" fill="currentColor">
                <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
            </svg>
        ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
        )}
      </NavItem>
      <NavItem onClick={() => setView('discover')} active={activeView === 'discover'}>
        <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
        </svg>
      </NavItem>
      <NavItem onClick={() => setView('explore')} active={activeView === 'explore'}>
         <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </NavItem>
      <NavItem onClick={() => setView('app')} active={activeView === 'app'}>
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
          <path d="M6 18c0 .55.45 1 1 1h1v3.5c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5V19h2v3.5c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5V19h1c.55 0 1-.45 1-1V8H6v10zM3.5 8C2.67 8 2 8.67 2 9.5v6c0 .83.67 1.5 1.5 1.5S5 16.33 5 15.5v-6C5 8.67 4.33 8 3.5 8zm17 0c-.83 0-1.5.67-1.5 1.5v6c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5v-6c0-.83-.67-1.5-1.5-1.5zm-4.97-4.84l1.3-1.3c.2-.2.2-.51 0-.71-.2-.2-.51-.2-.71 0l-1.48 1.48C13.85 2.23 12.95 2 12 2c-.96 0-1.86.23-2.66.63L7.85.99c-.2-.2-.51-.2-.71 0-.2.2-.2.51 0 .71l1.31 1.31C6.97 4.26 6 6.01 6 8h12c0-1.99-.97-3.75-2.47-4.84zM10 5.5c-.41 0-.75-.34-.75-.75s.34-.75.75-.75.75.34.75.75-.34.75-.75.75zm4 0c-.41 0-.75-.34-.75-.75s.34-.75.75-.75.75.34.75.75-.34.75-.75.75z" />
        </svg>
      </NavItem>
      <NavItem onClick={onCreateClick}>
        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-accent" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clipRule="evenodd" />
        </svg>
      </NavItem>
       {user && (
          <NavItem onClick={onNotificationsClick}>
             <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
             {unreadCount > 0 && (
                <span className="absolute top-2 right-1/2 mr-[-24px] flex items-center justify-center w-5 h-5 text-xs font-bold text-primary bg-red-500 rounded-full">{unreadCount}</span>
             )}
          </NavItem>
      )}
      <NavItem onClick={handleProfileClick} active={activeView === 'profile'}>
        {user ? (
            <img 
                src={user.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${user.displayName}&backgroundColor=ff5722,e91e63,9c27b0,673ab7,3f51b5,2196f3,03a9f4,00bcd4,009688,4caf50,8bc34a,cddc39,ffeb3b,ffc107,ff9800`}
                alt="User Avatar" 
                className={`w-7 h-7 rounded-full ${activeView === 'profile' ? 'ring-2 ring-offset-2 ring-offset-surface ring-primary' : ''}`}
            />
        ) : (
            <div className={`w-7 h-7 rounded-full flex items-center justify-center`}>
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="currentColor" viewBox="0 0 16 16"><path d="M3 14s-1 0-1-1 1-4 6-4 6 3 6 4-1 1-1 1H3zm5-6a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/></svg>
            </div>
        )}
      </NavItem>
    </footer>
  );
};

export default BottomNav;
