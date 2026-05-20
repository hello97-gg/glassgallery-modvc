import React, { useState, useEffect } from 'react';
import type { User } from 'firebase/auth';
import type { ProfileUser } from '../types';
import { getFollowersList, getFollowingList, toggleFollowUser } from '../services/firestoreService';
import Spinner from './Spinner';
import Button from './Button';

interface FollowersModalProps {
  uid: string;
  type: 'followers' | 'following';
  title: string;
  loggedInUser: User | null;
  onClose: () => void;
  onUserClick: (user: ProfileUser) => void;
  onFollowToggleParent?: () => void;
}

const FollowersModal: React.FC<FollowersModalProps> = ({
  uid,
  type,
  title,
  loggedInUser,
  onClose,
  onUserClick,
  onFollowToggleParent
}) => {
  const [list, setList] = useState<ProfileUser[]>([]);
  const [followedUids, setFollowedUids] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [pendingUids, setPendingUids] = useState<Set<string>>(new Set());

  useEffect(() => {
    let mounted = true;

    const fetchData = async () => {
      setIsLoading(true);
      try {
        // 1. Fetch the followers or following list
        const userList = type === 'followers'
          ? await getFollowersList(uid)
          : await getFollowingList(uid);

        // 2. Fetch logged-in user's following list to establish follows mappings (only if logged in)
        const myFollowing = loggedInUser
          ? await getFollowingList(loggedInUser.uid)
          : [];

        if (mounted) {
          setList(userList);
          setFollowedUids(new Set(myFollowing.map(u => u.uploaderUid)));
        }
      } catch (err) {
        console.error("Failed to load list details:", err);
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      mounted = false;
    };
  }, [uid, type, loggedInUser]);

  const handleFollowToggle = async (targetUser: ProfileUser, e: React.MouseEvent) => {
    e.stopPropagation(); // prevent modal click/navigation

    if (!loggedInUser) return;

    const targetUid = targetUser.uploaderUid;
    if (pendingUids.has(targetUid)) return; // Guard against race conditions!

    // Mark as pending
    setPendingUids(prev => {
      const next = new Set(prev);
      next.add(targetUid);
      return next;
    });

    const isCurrentlyFollowing = followedUids.has(targetUid);

    // Optimistic UI updates
    const nextFollowedUids = new Set(followedUids);
    if (isCurrentlyFollowing) {
      nextFollowedUids.delete(targetUid);
    } else {
      nextFollowedUids.add(targetUid);
    }
    setFollowedUids(nextFollowedUids);

    try {
      await toggleFollowUser(
        loggedInUser.uid,
        targetUid,
        loggedInUser.displayName || 'Someone',
        loggedInUser.photoURL || ''
      );
      if (onFollowToggleParent) {
        onFollowToggleParent();
      }
    } catch (err) {
      console.error("Failed to toggle follow inside list modal:", err);
      // Revert state if failed
      const reverted = new Set(followedUids);
      setFollowedUids(reverted);
    } finally {
      // Clear pending state
      setPendingUids(prev => {
        const next = new Set(prev);
        next.delete(targetUid);
        return next;
      });
    }
  };

  return (
    <div 
      className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in" 
      onClick={onClose}
    >
      <div 
        className="bg-surface border border-border rounded-2xl shadow-2xl w-full max-w-md max-h-[75vh] overflow-hidden flex flex-col animate-scale-up" 
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-border flex justify-between items-center flex-shrink-0">
          <h2 className="text-lg font-bold text-primary capitalize">{title}</h2>
          <button 
            onClick={onClose} 
            className="text-secondary hover:text-primary transition-colors text-2xl leading-none focus:outline-none"
          >
            &times;
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-grow p-4 overflow-y-auto min-h-[200px] flex flex-col justify-between">
          {isLoading ? (
            <div className="flex-grow flex items-center justify-center py-10">
              <Spinner />
            </div>
          ) : list.length === 0 ? (
            <div className="flex-grow flex flex-col items-center justify-center py-12 text-center">
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                className="h-10 w-10 text-secondary mb-3 opacity-60" 
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              <p className="text-secondary text-sm">
                {type === 'followers' ? 'No followers yet.' : 'Not following anyone yet.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {list.map(userItem => {
                const isMe = loggedInUser?.uid === userItem.uploaderUid;
                const isFollowing = followedUids.has(userItem.uploaderUid);

                return (
                  <div 
                    key={userItem.uploaderUid}
                    onClick={() => {
                      onUserClick(userItem);
                      onClose();
                    }}
                    className="flex items-center justify-between p-2 rounded-xl hover:bg-surface/50 border border-transparent hover:border-border/40 cursor-pointer transition-all duration-200"
                  >
                    {/* User profile details */}
                    <div className="flex items-center gap-3">
                      <img 
                        src={userItem.uploaderPhotoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${userItem.uploaderName}`}
                        alt={userItem.uploaderName}
                        className="w-10 h-10 rounded-full border border-border object-cover bg-surface"
                      />
                      <div>
                        <p className="text-sm font-semibold text-primary">{userItem.uploaderName}</p>
                      </div>
                    </div>

                    {/* Action buttons (only show if not current user) */}
                    {!isMe && loggedInUser && (
                      <button
                        onClick={(e) => handleFollowToggle(userItem, e)}
                        disabled={pendingUids.has(userItem.uploaderUid)}
                        className={`text-xs font-bold px-4 py-2 rounded-full cursor-pointer transition-all duration-200 ${
                          isFollowing
                            ? 'bg-border/60 text-secondary hover:bg-border/90 border border-border/80'
                            : 'bg-red-600 text-white hover:bg-red-500 hover:scale-[1.03] shadow-md hover:shadow-red-600/10'
                        } ${pendingUids.has(userItem.uploaderUid) ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        {pendingUids.has(userItem.uploaderUid) ? '...' : (isFollowing ? 'Following' : 'Follow')}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FollowersModal;
