import React from 'react';
import type { Notification, ImageMeta, ProfileUser } from '../types';

interface NotificationsPageProps {
  notifications: Notification[];
  onImageClick: (image: Partial<ImageMeta>) => void;
  onViewProfile?: (user: ProfileUser) => void;
  onMarkAsRead?: (notificationIds: string[]) => void;
  onBack: () => void;
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
  if (interval > 1) return Math.floor(interval) + "m";
  return "just now";
};

const getSafeDate = (n: Notification): Date => {
  if (!n || !n.createdAt) return new Date();
  if (typeof n.createdAt.toDate === 'function') {
    try {
      return n.createdAt.toDate();
    } catch (e) {
      console.warn("toDate failed on notification timestamp", e);
    }
  }
  if (n.createdAt instanceof Date) {
    return n.createdAt;
  }
  if (typeof n.createdAt === 'string' || typeof n.createdAt === 'number') {
    return new Date(n.createdAt);
  }
  if (n.createdAt && typeof n.createdAt === 'object') {
    const seconds = (n.createdAt as any).seconds;
    if (typeof seconds === 'number') {
      return new Date(seconds * 1000);
    }
  }
  return new Date();
};

const NotificationsPage: React.FC<NotificationsPageProps> = ({ 
  notifications, 
  onImageClick, 
  onViewProfile, 
  onMarkAsRead,
  onBack 
}) => {

  const handleMarkAllRead = () => {
    const unreadIds = notifications.filter(n => !n.read).map(n => n.id);
    if (onMarkAsRead && unreadIds.length > 0) {
      onMarkAsRead(unreadIds);
    }
  };

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.read && onMarkAsRead) {
      onMarkAsRead([notification.id]);
    }
    if (notification.type === 'follow' && onViewProfile && notification.actorUid) {
      onViewProfile({
        uploaderUid: notification.actorUid,
        uploaderName: notification.actorName,
        uploaderPhotoURL: notification.actorPhotoURL || ''
      });
    } else if (notification.imageId) {
      onImageClick({ id: notification.imageId, imageUrl: notification.imageUrl });
    }
  };

  // Group notifications chronologically
  const grouped = React.useMemo(() => {
    const now = new Date().getTime();
    const oneDay = 24 * 60 * 60 * 1000;
    const oneWeek = 7 * oneDay;

    const today: Notification[] = [];
    const thisWeek: Notification[] = [];
    const earlier: Notification[] = [];

    notifications.forEach(n => {
      const time = getSafeDate(n).getTime();
      const diff = now - time;

      if (diff < oneDay) {
        today.push(n);
      } else if (diff < oneWeek) {
        thisWeek.push(n);
      } else {
        earlier.push(n);
      }
    });

    return { today, thisWeek, earlier };
  }, [notifications]);

  const renderSection = (title: string, items: Notification[]) => {
    if (items.length === 0) return null;
    return (
      <div className="space-y-3 mb-8">
        <h3 className="text-neutral-400 text-xs font-black uppercase tracking-widest pl-1">{title}</h3>
        <div className="space-y-3">
          {items.map(n => {
            const hasUnreadHighlight = !n.read;
            return (
              <div
                key={n.id}
                onClick={() => handleNotificationClick(n)}
                className={`group p-4 flex items-center gap-4 rounded-3xl cursor-pointer select-none transition-all duration-200 active:scale-[0.98] border border-white/5 ${
                  hasUnreadHighlight 
                    ? 'bg-red-500/[0.04] hover:bg-red-500/[0.07] border-l-[3px] border-l-red-600' 
                    : 'bg-neutral-900/40 hover:bg-neutral-900/60'
                }`}
              >
                {/* Avatar Icon */}
                {n.type === 'flagged' ? (
                  <div className="w-11 h-11 rounded-full bg-red-950/40 text-red-500 flex items-center justify-center flex-shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5.5 w-5.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                ) : (
                  <img 
                    onClick={(e) => {
                      if (n.actorUid && onViewProfile) {
                        e.stopPropagation();
                        onViewProfile({
                          uploaderUid: n.actorUid,
                          uploaderName: n.actorName,
                          uploaderPhotoURL: n.actorPhotoURL || ''
                        });
                      }
                    }}
                    src={n.actorPhotoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${n.actorName}`} 
                    alt={n.actorName} 
                    className="w-11 h-11 rounded-full flex-shrink-0 object-cover hover:ring-2 hover:ring-red-600 hover:ring-offset-2 hover:ring-offset-background transition-all" 
                  />
                )}

                {/* Message Context */}
                <div className="flex-grow min-w-0">
                  <div className="text-sm text-white">
                    {n.type === 'flagged' ? (
                      <span>Your image was <span className="text-red-500 font-bold">flagged</span> for safety review.</span>
                    ) : n.type === 'follow' ? (
                      <span><span className="font-bold hover:underline" onClick={(e) => {
                        if (n.actorUid && onViewProfile) {
                          e.stopPropagation();
                          onViewProfile({
                            uploaderUid: n.actorUid,
                            uploaderName: n.actorName,
                            uploaderPhotoURL: n.actorPhotoURL || ''
                          });
                        }
                      }}>{n.actorName}</span> followed you.</span>
                    ) : (
                      <span><span className="font-bold hover:underline" onClick={(e) => {
                        if (n.actorUid && onViewProfile) {
                          e.stopPropagation();
                          onViewProfile({
                            uploaderUid: n.actorUid,
                            uploaderName: n.actorName,
                            uploaderPhotoURL: n.actorPhotoURL || ''
                          });
                        }
                      }}>{n.actorName}</span> liked your glass art.</span>
                    )}
                  </div>
                  <span className="text-[11px] text-neutral-500 font-medium block mt-0.5">{timeAgo(getSafeDate(n))}</span>
                </div>

                {/* Thumbnail Image */}
                {n.type !== 'follow' && n.imageUrl ? (
                  <div className="w-12 h-12 rounded-2xl overflow-hidden flex-shrink-0 border border-white/10 group-hover:scale-105 transition-transform duration-250">
                    <img src={n.imageUrl} alt="preview thumbnail" className="w-full h-full object-cover" />
                  </div>
                ) : null}

                {/* Red Unread Dot Indicator */}
                {hasUnreadHighlight && (
                  <span className="w-2 h-2 rounded-full bg-red-600 flex-shrink-0 self-center" />
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="w-full max-w-xl mx-auto py-2 animate-fade-in">
      {/* Navigation Header */}
      <div className="flex items-center justify-between mb-8 select-none">
        <div className="flex items-center gap-3">
          <button 
            onClick={onBack}
            className="p-2.5 bg-white/5 hover:bg-white/10 text-white rounded-full transition-all duration-150 active:scale-90 border border-white/5"
            title="Go Back"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-white">Inbox</h1>
            <p className="text-neutral-400 text-xs">Stay updated on your interactions</p>
          </div>
        </div>

        {notifications.some(n => !n.read) && (
          <button 
            onClick={handleMarkAllRead}
            className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white text-xs font-bold rounded-2xl transition-all duration-150 border border-white/5 active:scale-95 cursor-pointer"
          >
            Mark all read
          </button>
        )}
      </div>

      {/* Main Feed Content */}
      <div className="space-y-2">
        {notifications.length > 0 ? (
          <>
            {renderSection("Today", grouped.today)}
            {renderSection("This Week", grouped.thisWeek)}
            {renderSection("Earlier", grouped.earlier)}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center select-none bg-neutral-900/20 border border-white/5 rounded-[32px] p-6">
            <div className="w-16 h-16 rounded-full bg-neutral-900 flex items-center justify-center mb-4 border border-white/5">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </div>
            <h2 className="text-white font-bold text-lg mb-1">Your inbox is clear</h2>
            <p className="text-neutral-500 text-xs max-w-xs">When people follow you, like your glass art, or interact, you'll see them grouped here.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default NotificationsPage;
