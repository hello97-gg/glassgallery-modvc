import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { Notification, ImageMeta, ProfileUser } from '../types';
import { markNotificationsAsRead } from '../services/firestoreService';
import Button from './Button';

interface NotificationProps {
  notifications: Notification[];
  onImageClick: (image: Partial<ImageMeta>) => void;
  onClose: () => void;
  onViewProfile?: (user: ProfileUser) => void;
  onMarkAsRead?: (notificationIds: string[]) => void;
}

const timeAgo = (date: Date): string => {
  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
  let interval = seconds / 31536000;
  if (interval > 1) return Math.floor(interval) + "y";
  interval = seconds / 2592000;
  if (interval > 1) return Math.floor(interval) + "m";
  interval = seconds / 86400;
  if (interval > 1) return Math.floor(interval) + "d";
  interval = seconds / 3600;
  if (interval > 1) return Math.floor(interval) + "h";
  interval = seconds / 60;
  if (interval > 1) return Math.floor(interval) + "min";
  return Math.floor(seconds) + "s";
};

// Reusable component for the list of notifications
const NotificationsList: React.FC<NotificationProps> = ({ notifications, onClose, onImageClick, onViewProfile, onMarkAsRead }) => {
    const handleMarkAllRead = () => {
        const unreadIds = notifications.filter(n => !n.read).map(n => n.id);
        if (onMarkAsRead) {
            onMarkAsRead(unreadIds);
        } else {
            markNotificationsAsRead(unreadIds);
        }
    };

    const handleNotificationClick = (notification: Notification) => {
        if (!notification.read) {
            if (onMarkAsRead) {
                onMarkAsRead([notification.id]);
            } else {
                markNotificationsAsRead([notification.id]);
            }
        }
        if (notification.type === 'follow' && onViewProfile && notification.actorUid) {
            onViewProfile({
                uploaderUid: notification.actorUid,
                uploaderName: notification.actorName,
                uploaderPhotoURL: notification.actorPhotoURL || ''
            });
        } else if (notification.type.startsWith('community_') || notification.type === 'join_request_approved') {
            if (notification.actorUid && notification.actorUid.startsWith('c/')) {
                const slug = notification.actorUid.replace(/^c\//, '');
                window.history.pushState({}, '', `/c/${slug}`);
                window.dispatchEvent(new PopStateEvent('popstate'));
            } else if (notification.imageId) {
                onImageClick({ id: notification.imageId, imageUrl: notification.imageUrl });
            }
        } else {
            onImageClick({ id: notification.imageId, imageUrl: notification.imageUrl });
        }
        onClose();
    };
    
    return (
      <div className="w-full max-w-sm bg-surface border border-border rounded-lg shadow-xl z-20 overflow-hidden flex flex-col max-h-[70vh]">
        <div className="p-3 border-b border-border flex justify-between items-center flex-shrink-0 bg-surface">
          <h3 className="font-semibold text-primary">Notifications</h3>
          {notifications.some(n => !n.read) && (
            <Button onClick={handleMarkAllRead} variant="secondary" size="sm">Mark all as read</Button>
          )}
        </div>
        <div className="flex-grow overflow-y-auto [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-secondary/50">
          {notifications.length > 0 ? (
            notifications.map(n => (
              <div
                key={n.id}
                onClick={() => handleNotificationClick(n)}
                className={`p-3 flex items-start gap-3 border-b border-border last:border-b-0 cursor-pointer transition-all duration-300 ${n.read ? 'hover:bg-border/50 opacity-60' : 'bg-accent/10 hover:bg-accent/20'}`}
              >
                {n.type === 'flagged' ? (
                  <div className="w-8 h-8 rounded-full bg-red-950/40 text-red-500 flex items-center justify-center flex-shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                ) : n.type === 'community_ban' ? (
                  <div className="w-8 h-8 rounded-full bg-red-950/40 text-red-400 flex items-center justify-center flex-shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                    </svg>
                  </div>
                ) : n.type === 'community_post_pending' || n.type === 'community_mod_queue' ? (
                  <div className="w-8 h-8 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center flex-shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                ) : (
                  <img src={n.actorPhotoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${n.actorName}`} alt={n.actorName} className="w-8 h-8 rounded-full flex-shrink-0 object-cover" />
                )}
                <div className="flex-grow text-sm">
                  {n.type === 'flagged' ? (
                    <p className="text-primary">Your image was <span className="text-red-500 font-semibold">flagged</span> for content safety review.</p>
                  ) : n.type === 'follow' ? (
                    <p className="text-primary"><span className="font-semibold">{n.actorName}</span> followed you.</p>
                  ) : n.type === 'comment' ? (
                    <p className="text-primary"><span className="font-semibold">{n.actorName}</span> commented on your image.</p>
                  ) : n.type === 'reply' ? (
                    <p className="text-primary"><span className="font-semibold">{n.actorName}</span> replied to your comment.</p>
                  ) : n.type === 'community_post_pending' ? (
                    <p className="text-primary">Your post in <span className="font-semibold text-accent">{n.actorName}</span> is pending moderator approval.</p>
                  ) : n.type === 'community_mod_queue' ? (
                    <p className="text-primary"><span className="font-semibold">{n.actorName}</span> submitted a post awaiting review in mod queue.</p>
                  ) : n.type === 'community_post_approved' ? (
                    <p className="text-primary">Your post in <span className="font-semibold text-accent">{n.actorName}</span> was <span className="text-emerald-400 font-semibold">approved</span>.</p>
                  ) : n.type === 'community_post_removed' ? (
                    <p className="text-primary">Your post in <span className="font-semibold text-accent">{n.actorName}</span> was <span className="text-red-400 font-semibold">removed</span> by a moderator.</p>
                  ) : n.type === 'community_ban' ? (
                    <p className="text-primary">You were <span className="text-red-400 font-semibold">banned</span> from <span className="font-semibold text-accent">{n.actorName}</span>.</p>
                  ) : n.type === 'join_request_approved' ? (
                    <p className="text-primary">Your request to join <span className="font-semibold text-accent">{n.actorName}</span> was <span className="text-emerald-400 font-semibold">approved</span>.</p>
                  ) : n.type === 'community_invite' ? (
                    <p className="text-primary">You were invited to join <span className="font-semibold text-accent">{n.actorName}</span>.</p>
                  ) : (
                    <p className="text-primary"><span className="font-semibold">{n.actorName}</span> liked your image.</p>
                  )}
                  <p className="text-xs text-secondary">{timeAgo(n.createdAt.toDate())} ago</p>
                </div>
                {n.type !== 'follow' && n.imageUrl && n.imageUrl !== 'text://post' && !n.imageUrl.startsWith('text://') ? (
                  <img src={n.imageUrl} alt="notification thumbnail" className="w-10 h-10 rounded object-cover flex-shrink-0" />
                ) : null}
              </div>
            ))
          ) : (
            <p className="p-8 text-center text-sm text-secondary">You have no notifications yet.</p>
          )}
        </div>
      </div>
    )
}

// For desktop sidebar popover
const NotificationsPanel: React.FC<NotificationProps> = ({ notifications, onClose, onImageClick, onViewProfile, onMarkAsRead }) => {
    return (
        <div className="absolute left-full top-0 ml-4 w-96 animate-fade-in z-40">
           <NotificationsList notifications={notifications} onClose={onClose} onImageClick={onImageClick} onViewProfile={onViewProfile} onMarkAsRead={onMarkAsRead} />
        </div>
    );
};

// For mobile full-screen modal
export const MobileNotificationsModal: React.FC<NotificationProps> = ({ notifications, onClose, onImageClick, onViewProfile, onMarkAsRead }) => {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm md:hidden animate-fade-in" onClick={onClose}>
            <div className="w-full flex justify-center" onClick={(e) => e.stopPropagation()}>
                <NotificationsList notifications={notifications} onClose={onClose} onImageClick={onImageClick} onViewProfile={onViewProfile} onMarkAsRead={onMarkAsRead} />
            </div>
        </div>
    )
}

// The bell icon component itself
export const NotificationBell: React.FC<{
  notifications: Notification[];
  onImageClick: (image: Partial<ImageMeta>) => void;
  isSidebar?: boolean;
  onViewProfile?: (user: ProfileUser) => void;
}> = ({ notifications, onImageClick, isSidebar = false, onViewProfile }) => {
    const [isOpen, setIsOpen] = useState(false);
    const unreadCount = useMemo(() => notifications.filter(n => !n.read).length, [notifications]);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (ref.current && !ref.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);
    
    const BellIcon = () => (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
    );

    if (isSidebar) {
        return (
            <div className="relative" ref={ref}>
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className="relative flex items-center w-full p-3 my-3 rounded-lg transition-all duration-200 group-hover:space-x-4 text-secondary hover:text-primary hover:bg-surface/80"
                    aria-label="Notifications"
                >
                     <div className="flex-shrink-0 w-6 h-6 flex items-center justify-center relative">
                        <BellIcon />
                        {unreadCount > 0 && (
                             <span className="absolute top-0 right-0 block h-2 w-2 rounded-full bg-red-500 ring-2 ring-background"></span>
                        )}
                     </div>
                     <span className="text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap">Notifications</span>
                </button>
                {isOpen && <NotificationsPanel notifications={notifications} onClose={() => setIsOpen(false)} onImageClick={onImageClick} onViewProfile={onViewProfile} />}
            </div>
        );
    }
    
    return null;
};
