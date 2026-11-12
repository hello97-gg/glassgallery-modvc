import React, { useState, useEffect } from 'react';
import type { User } from 'firebase/auth';

interface RecommendedCommunitiesWidgetProps {
  user: User | null;
  onSelectCommunity: (slug: string) => void;
}

export const RecommendedCommunitiesWidget: React.FC<RecommendedCommunitiesWidgetProps> = ({
  user,
  onSelectCommunity
}) => {
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [joinedSet, setJoinedSet] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const url = user?.uid ? `/api/communities/recommended?uid=${user.uid}&limit=4` : '/api/communities/recommended?limit=4';
    fetch(url)
      .then(res => res.json())
      .then(data => {
        if (data.success && Array.isArray(data.recommendations)) {
          setRecommendations(data.recommendations);
        }
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [user?.uid]);

  const handleJoin = async (e: React.MouseEvent, comm: any) => {
    e.stopPropagation();
    if (!user) {
      alert('Please sign in to join communities.');
      return;
    }

    try {
      const token = await user.getIdToken();
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
          action: 'join'
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Join failed.');
      setJoinedSet(prev => new Set(prev).add(comm.id));
    } catch (err: any) {
      alert(err.message || 'Join failed.');
    }
  };

  if (isLoading || recommendations.length === 0) return null;

  return (
    <div className="p-4 rounded-2xl bg-surface/60 border border-border shadow-lg">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-bold text-secondary uppercase tracking-wider">
          Communities for You
        </h3>
        <button
          onClick={() => onSelectCommunity('')}
          className="text-[11px] text-accent hover:underline font-semibold"
        >
          Explore All
        </button>
      </div>

      <div className="space-y-3">
        {recommendations.map(comm => {
          const isOwner = Boolean(user?.uid && (comm.owner_uid === user.uid || comm.userRole === 'owner'));
          const isJoined = Boolean(comm.is_member || isOwner || joinedSet.has(comm.id));
          return (
            <div
              key={comm.id}
              onClick={() => onSelectCommunity(comm.slug)}
              className="group flex items-center justify-between p-2 rounded-xl hover:bg-surface transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-surface border border-border flex items-center justify-center font-bold text-xs text-accent overflow-hidden flex-shrink-0">
                  {comm.icon_url ? (
                    <img src={comm.icon_url} alt={comm.name} className="w-full h-full object-cover" />
                  ) : (
                    comm.name.charAt(0).toUpperCase()
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-primary truncate group-hover:text-accent transition-colors">
                    {comm.name}
                  </p>
                  <p className="text-[10px] text-secondary font-mono truncate">
                    c/{comm.slug} &bull; {comm.member_count} members
                  </p>
                </div>
              </div>

              {isOwner ? (
                <span className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-accent/15 text-accent border border-accent/30 ml-2 flex-shrink-0">
                  Owner
                </span>
              ) : (
                <button
                  onClick={(e) => handleJoin(e, comm)}
                  disabled={isJoined}
                  className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-all ml-2 flex-shrink-0 ${
                    isJoined
                      ? 'bg-background/80 text-secondary border border-border'
                      : 'bg-accent text-surface hover:opacity-90 shadow-sm'
                  }`}
                >
                  {isJoined ? 'Joined' : 'Join'}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

