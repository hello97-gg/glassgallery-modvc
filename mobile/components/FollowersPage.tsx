import React, { useState, useEffect } from 'react';
import type { User } from 'firebase/auth';
import type { ProfileUser } from '../types';
import { getFollowersList, getFollowingList, toggleFollowUser } from '../services/firestoreService';
import Spinner from './Spinner';

interface FollowersPageProps {
  uid: string;
  type: 'followers' | 'following';
  loggedInUser: User | null;
  onBack: () => void;
  onUserClick: (user: ProfileUser) => void;
  onFollowToggleParent?: () => void;
}

const FollowersPage: React.FC<FollowersPageProps> = ({
  uid,
  type,
  loggedInUser,
  onBack,
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
        const userList = type === 'followers'
          ? await getFollowersList(uid)
          : await getFollowingList(uid);

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
    e.stopPropagation();

    if (!loggedInUser) return;

    const targetUid = targetUser.uploaderUid;
    if (pendingUids.has(targetUid)) return;

    setPendingUids(prev => {
      const next = new Set(prev);
      next.add(targetUid);
      return next;
    });

    const isCurrentlyFollowing = followedUids.has(targetUid);

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
      console.error("Failed to toggle follow inside list page:", err);
      const reverted = new Set(followedUids);
      setFollowedUids(reverted);
    } finally {
      setPendingUids(prev => {
        const next = new Set(prev);
        next.delete(targetUid);
        return next;
      });
    }
  };

  const title = type === 'followers' ? 'Followers' : 'Following';

  return (
    <div className="animate-fade-in w-full min-h-screen pb-20 select-none">
      {/* Top Header Navigation */}
      <div className="flex items-center gap-4 py-4 px-2 border-b border-white/5 mb-6">
        <button 
          onClick={onBack} 
          className="p-2 hover:bg-white/5 rounded-full text-secondary hover:text-primary transition-colors duration-150 active:scale-95 flex items-center justify-center"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <h2 className="text-xl font-bold text-primary tracking-tight">{title}</h2>
        </div>
      </div>

      {/* Main List Container */}
      <div className="max-w-2xl mx-auto px-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Spinner />
          </div>
        ) : list.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 bg-surface/50 border border-white/5 rounded-2xl flex items-center justify-center mb-4">
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                className="h-8 w-8 text-neutral-500" 
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
            <p className="text-secondary text-sm font-medium">
              {type === 'followers' ? 'No followers yet.' : 'Not following anyone yet.'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {list.map(userItem => {
              const isMe = loggedInUser?.uid === userItem.uploaderUid;
              const isFollowing = followedUids.has(userItem.uploaderUid);

              return (
                <div 
                  key={userItem.uploaderUid}
                  onClick={() => onUserClick(userItem)}
                  className="flex items-center justify-between p-3 rounded-2xl bg-surface border border-white/5 hover:border-white/10 cursor-pointer transition-all duration-200 hover:scale-[1.01] shadow-sm"
                >
                  {/* User Profile */}
                  <div className="flex items-center gap-3.5">
                    <img 
                      src={userItem.uploaderPhotoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${userItem.uploaderName}`}
                      alt={userItem.uploaderName}
                      className="w-11 h-11 rounded-full border border-white/10 object-cover bg-neutral-900 shadow-inner"
                    />
                    <div>
                      <p className="text-sm font-bold text-primary tracking-tight">{userItem.uploaderName}</p>
                    </div>
                  </div>

                  {/* Follow Button */}
                  {!isMe && loggedInUser && (
                    <button
                      onClick={(e) => handleFollowToggle(userItem, e)}
                      disabled={pendingUids.has(userItem.uploaderUid)}
                      className={`text-xs font-extrabold px-5 py-2.5 rounded-full transition-all duration-200 active:scale-95 ${
                        isFollowing
                          ? 'bg-white/5 text-secondary hover:bg-white/10 border border-white/10'
                          : 'bg-red-600 text-white hover:bg-red-500 shadow-md hover:shadow-red-600/10'
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
  );
};

export default FollowersPage;
