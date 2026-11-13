import React, { useState, useEffect, useCallback } from 'react';
import type { User } from 'firebase/auth';
import { Community } from '../../types';
import { safeJsonFetch } from '../../services/apiClient';

interface CommunityDiscoverPageProps {
  user: User | null;
  onSelectCommunity: (slug: string) => void;
  onCreateCommunityClick: () => void;
}

const CATEGORIES = [
  'All', 'Art & Photography', 'Technology', 'Nature & Travel',
  'Architecture & Design', 'Gaming', 'Anime & Illustration', 'Music & Media'
];

export const CommunityDiscoverPage: React.FC<CommunityDiscoverPageProps> = ({
  user,
  onSelectCommunity,
  onCreateCommunityClick
}) => {
  const [communities, setCommunities] = useState<Community[]>([]);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [filterType, setFilterType] = useState<'all' | 'my'>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCommunities = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (selectedCategory !== 'All') params.set('category', selectedCategory);
      if (filterType === 'my' && user?.uid) {
        params.set('my', 'true');
        params.set('uid', user.uid);
      } else if (user?.uid) {
        params.set('uid', user.uid);
      }

      const data = await safeJsonFetch(`/api/communities?${params.toString()}`);

      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch communities.');
      }

      setCommunities(data.communities || []);
    } catch (err: any) {
      console.error('[DiscoverPage Error]:', err);
      setError(err.message || 'Unable to connect to community services. Please verify your connection.');
    } finally {
      setIsLoading(false);
    }
  }, [search, selectedCategory, filterType, user?.uid]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchCommunities();
    }, 250);
    return () => clearTimeout(timer);
  }, [fetchCommunities]);

  const handleJoinToggle = async (e: React.MouseEvent, comm: Community) => {
    e.stopPropagation();
    if (!user) {
      alert('Please sign in to join communities.');
      return;
    }

    try {
      const isOwner = Boolean(user && (comm.owner_uid === user.uid || comm.userRole === 'owner'));
      if (isOwner) {
        alert('You are the owner of this community.');
        return;
      }

      const isCurrentJoined = Boolean(comm.isJoined || (comm.userRole && comm.userRole !== 'none'));
      const token = await user.getIdToken();
      const action = isCurrentJoined ? 'leave' : 'join';

      const res = await fetch('/api/communities/members', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          uid: user.uid,
          communityId: comm.id,
          community_id: comm.id,
          action
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Action failed.');
      }

      setCommunities(prev => prev.map(c => {
        if (c.id === comm.id) {
          const newIsJoined = action === 'join';
          return {
            ...c,
            isJoined: newIsJoined,
            userRole: newIsJoined ? 'member' : undefined,
            member_count: c.member_count + (newIsJoined ? 1 : -1)
          };
        }
        return c;
      }));
    } catch (err: any) {
      alert(err.message || 'Error updating membership.');
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto px-4 py-6 pb-20">
      {/* Hero Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-primary">Communities</h1>
          <p className="text-xs sm:text-sm text-secondary mt-1">
            Discover and join creative circles, share visuals, and discuss ideas.
          </p>
        </div>

        <button
          onClick={onCreateCommunityClick}
          className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-accent text-surface text-xs font-bold hover:opacity-90 transition-all shadow-md self-start sm:self-auto"
        >
          <span className="text-sm">+</span>
          <span>Create Community</span>
        </button>
      </div>

      {/* Search & Filter Controls */}
      <div className="space-y-4 mb-8">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <span className="absolute inset-y-0 left-3.5 flex items-center text-secondary text-sm pointer-events-none">
              <svg className="w-4 h-4 text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search communities by name or topic..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-surface border border-border text-xs sm:text-sm text-primary placeholder-secondary/60 focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>

          {user && (
            <div className="flex rounded-xl bg-surface p-1 border border-border">
              <button
                onClick={() => setFilterType('all')}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  filterType === 'all'
                    ? 'bg-accent text-surface shadow'
                    : 'text-secondary hover:text-primary'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setFilterType('my')}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  filterType === 'my'
                    ? 'bg-accent text-surface shadow'
                    : 'text-secondary hover:text-primary'
                }`}
              >
                My Communities
              </button>
            </div>
          )}
        </div>

        {/* Categories Bar */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all border ${
                selectedCategory === cat
                  ? 'bg-accent/20 text-accent border-accent/40'
                  : 'bg-surface/60 text-secondary border-border hover:text-primary hover:border-secondary/40'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Loading Skeleton */}
      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-56 rounded-2xl bg-surface/50 border border-border animate-pulse" />
          ))}
        </div>
      )}

      {/* Error state */}
      {!isLoading && error && (
        <div className="p-8 text-center bg-surface/40 border border-border rounded-2xl">
          <p className="text-sm text-red-400 mb-3">{error}</p>
          <button
            onClick={fetchCommunities}
            className="px-4 py-2 bg-surface hover:bg-border/60 rounded-xl text-xs font-semibold text-primary"
          >
            Retry
          </button>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !error && communities.length === 0 && (
        <div className="py-20 text-center bg-surface/30 border border-border/40 rounded-3xl">
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-surface border border-border flex items-center justify-center text-secondary">
            <svg className="w-7 h-7 text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <h3 className="text-base font-bold text-primary mb-1">No communities found</h3>
          <p className="text-xs text-secondary max-w-sm mx-auto mb-6">
            {search.trim() ? `No results matching "${search}". Try searching for something else.` : 'Be the first to start a new community!'}
          </p>
          <button
            onClick={onCreateCommunityClick}
            className="px-5 py-2.5 rounded-xl bg-accent text-surface text-xs font-bold hover:opacity-90 shadow-md"
          >
            Create a Community
          </button>
        </div>
      )}

      {/* Communities Grid */}
      {!isLoading && communities.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {communities.map((comm) => (
            <div
              key={comm.id}
              onClick={() => onSelectCommunity(comm.slug)}
              className="group relative flex flex-col justify-between p-5 rounded-2xl bg-surface/60 hover:bg-surface/90 border border-border hover:border-accent/40 shadow-lg hover:shadow-xl transition-all cursor-pointer overflow-hidden"
            >
              <div>
                {/* Header row: Icon + Names + Badge */}
                <div className="flex items-start gap-3.5 mb-3">
                  <div className="w-12 h-12 rounded-xl bg-surface border border-border flex items-center justify-center overflow-hidden flex-shrink-0 group-hover:scale-105 transition-transform">
                    {comm.icon_url ? (
                      <img src={comm.icon_url} alt={comm.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-accent font-extrabold text-base">
                        {comm.name.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold text-primary truncate group-hover:text-accent transition-colors">
                      {comm.name}
                    </h3>
                    <p className="text-[11px] text-secondary font-mono">c/{comm.slug}</p>
                  </div>

                  <span className="px-2 py-0.5 rounded-md bg-background/80 text-secondary border border-border text-[9px] uppercase font-semibold">
                    {comm.type}
                  </span>
                </div>

                {/* Description */}
                <p className="text-xs text-secondary line-clamp-2 leading-relaxed mb-4">
                  {comm.description || 'A community for visual exploration and discussions.'}
                </p>
              </div>

              {/* Footer: Stats + Join Button */}
              <div className="flex items-center justify-between pt-3 border-t border-border/50 text-xs">
                <div className="flex items-center gap-3 text-secondary text-[11px]">
                  <span>{comm.member_count} members</span>
                  <span>&bull;</span>
                  <span>{comm.post_count} posts</span>
                </div>

                {Boolean(user && (comm.owner_uid === user.uid || comm.userRole === 'owner')) ? (
                  <span className="px-3 py-1 rounded-lg text-xs font-bold bg-accent/15 text-accent border border-accent/30 shadow-sm">
                    Owner
                  </span>
                ) : (
                  <button
                    onClick={(e) => handleJoinToggle(e, comm)}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                      comm.isJoined || (comm.userRole && comm.userRole !== 'none')
                        ? 'bg-background/80 text-secondary border border-border hover:text-red-400'
                        : 'bg-accent text-surface hover:opacity-90 shadow-sm'
                    }`}
                  >
                    {comm.isJoined || (comm.userRole && comm.userRole !== 'none') ? 'Joined' : 'Join'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

