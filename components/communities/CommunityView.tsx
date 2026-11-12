import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { User } from 'firebase/auth';
import { Community, ImageMeta, ProfileUser } from '../../types';
import { CommunityFeed } from './CommunityFeed';
import { ModDashboardModal } from './ModDashboardModal';

interface CommunityViewProps {
  slug: string;
  user: User | null;
  onPostClick: (post: ImageMeta) => void;
  onCreatePostClick: (communityId?: string, defaultType?: 'media' | 'text') => void;
  onViewProfile?: (user: ProfileUser) => void;
  onLikeToggle?: (post: ImageMeta) => void;
  onSaveToggle?: (post: ImageMeta) => void;
  savedImages?: Set<string>;
  refreshTrigger?: number;
}

// Deterministic aesthetic dark gradient based on community name
function getCommunityGradient(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h1 = Math.abs(hash) % 360;
  const h2 = (h1 + 40) % 360;
  return `linear-gradient(135deg, hsl(${h1}, 45%, 16%) 0%, hsl(${h2}, 55%, 9%) 100%)`;
}

export const CommunityView: React.FC<CommunityViewProps> = ({
  slug,
  user,
  onPostClick,
  onCreatePostClick,
  onViewProfile,
  onLikeToggle,
  onSaveToggle,
  savedImages = new Set(),
  refreshTrigger = 0
}) => {
  const [community, setCommunity] = useState<Community | null>(null);
  const [rules, setRules] = useState<any[]>([]);
  const [moderators, setModerators] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'feed' | 'about' | 'rules' | 'members'>('feed');
  const [expandedRuleIndex, setExpandedRuleIndex] = useState<number | null>(null);
  const [isModDashboardOpen, setIsModDashboardOpen] = useState(false);
  const [initialModTab, setInitialModTab] = useState<'settings' | 'rules' | 'team' | 'reports' | 'bans' | 'automod' | 'modlog'>('settings');
  const [isLoading, setIsLoading] = useState(true);
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCommunityDetails = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const url = user?.uid ? `/api/communities/${slug}?uid=${user.uid}` : `/api/communities/${slug}`;
      const res = await fetch(url);
      const data = await res.json();

      if (!res.ok || !data.success || !data.community) {
        throw new Error(data.error || 'Community not found.');
      }

      setCommunity(data.community);
      setRules(data.rules || []);
      setModerators(data.moderators || []);
    } catch (err: any) {
      console.error('[CommunityView Error]:', err);
      setError(err.message || 'Failed to load community.');
    } finally {
      setIsLoading(false);
    }
  }, [slug, user?.uid]);

  useEffect(() => {
    fetchCommunityDetails();
  }, [fetchCommunityDetails, refreshTrigger]);

  const isOwner = Boolean(user && community && (community.owner_uid === user.uid || community.userRole === 'owner'));
  const isMod = Boolean(isOwner || (community && community.userRole === 'moderator'));
  const isMember = Boolean(isOwner || (community && (community.isJoined || (community.userRole && community.userRole !== 'none'))));

  const [pendingModQueueCount, setPendingModQueueCount] = useState<number>(0);

  useEffect(() => {
    if (!isMod || !community || !user) return;
    const checkModQueue = async () => {
      try {
        const res = await fetch(`/api/communities/posts?community_id=${community.id}&uid=${user.uid}&mod_status=pending_approval&limit=50`);
        const data = await res.json();
        if (data.success && Array.isArray(data.posts)) {
          setPendingModQueueCount(data.posts.length);
        }
      } catch {}
    };
    checkModQueue();
  }, [isMod, community?.id, user?.uid, refreshTrigger]);

  const bannerGradient = useMemo(() => {
    return community ? getCommunityGradient(community.name) : 'linear-gradient(135deg, #1f1b24 0%, #121016 100%)';
  }, [community?.name]);

  const handleJoinToggle = async () => {
    if (!user || !community) return;
    if (isOwner) {
      alert('As the community owner, you are permanently a member.');
      return;
    }

    setIsJoining(true);

    try {
      const token = await user.getIdToken();
      const action = isMember ? 'leave' : 'join';

      const res = await fetch('/api/communities/members', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          uid: user.uid,
          communityId: community.id,
          action
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || `Failed to ${action} community.`);
      }

      const nextIsMember = action === 'join';
      setCommunity(prev => {
        if (!prev) return null;
        return {
          ...prev,
          isJoined: nextIsMember,
          userRole: nextIsMember ? 'member' : undefined,
          member_count: Math.max(0, (prev.member_count || 0) + (nextIsMember ? 1 : -1))
        };
      });
    } catch (err: any) {
      alert(err.message || 'Membership action failed.');
    } finally {
      setIsJoining(false);
    }
  };

  const handleShareCommunity = () => {
    if (!community) return;
    const url = `${window.location.origin}/c/${community.slug}`;
    if (navigator.share) {
      navigator.share({
        title: `c/${community.slug} - ${community.name}`,
        text: community.description || `Check out c/${community.slug} on Glass Gallery!`,
        url
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url).then(() => {
        alert('Community link copied to clipboard!');
      });
    }
  };

  const openModTab = (tab: 'settings' | 'rules' | 'team' | 'queue' | 'reports' | 'bans' | 'automod' | 'modlog') => {
    setInitialModTab(tab as any);
    setIsModDashboardOpen(true);
  };

  if (isLoading) {
    return (
      <div className="w-full max-w-6xl mx-auto px-4 py-6">
        <div className="w-full h-44 md:h-56 rounded-3xl bg-surface/50 border border-border animate-pulse mb-6" />
        <div className="flex items-center gap-4 mb-8">
          <div className="w-24 h-24 rounded-full bg-surface border border-border animate-pulse shrink-0" />
          <div className="space-y-2 flex-1">
            <div className="w-48 h-7 bg-surface rounded-lg animate-pulse" />
            <div className="w-32 h-4 bg-surface/60 rounded-lg animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !community) {
    return (
      <div className="w-full max-w-xl mx-auto text-center py-20 px-4">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-surface border border-border flex items-center justify-center text-secondary">
          <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-primary mb-2">Community Not Found</h2>
        <p className="text-sm text-secondary mb-6">{error || 'This community does not exist or may be private.'}</p>
        <button
          onClick={() => window.history.back()}
          className="px-5 py-2.5 bg-surface hover:bg-border/60 border border-border rounded-xl text-xs font-semibold text-primary transition-all"
        >
          Go Back
        </button>
      </div>
    );
  }

  // --- Right Sidebar Component (Desktop sticky & Mobile collapsible/tab) ---
  const renderSidebarContent = () => (
    <div className="space-y-4">
      {/* About Community Card */}
      <div className="p-5 rounded-2xl bg-surface/60 backdrop-blur-md border border-border shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold text-secondary uppercase tracking-wider">About Community</h3>
          {isMod && (
            <button
              onClick={() => openModTab('settings')}
              className="text-[11px] text-accent hover:underline font-semibold"
            >
              Settings
            </button>
          )}
        </div>

        <p className="text-xs text-primary leading-relaxed mb-4 whitespace-pre-line">
          {community.description || 'Welcome to this community! Connect with creators, share visuals, and participate in discussions.'}
        </p>

        {/* Stats Row */}
        <div className="grid grid-cols-2 gap-3 py-3 border-y border-border/60 my-4 text-center">
          <div>
            <p className="text-lg font-black text-primary">{community.member_count || 0}</p>
            <p className="text-[10px] uppercase font-semibold text-secondary">Members</p>
          </div>
          <div>
            <p className="text-lg font-black text-primary">{community.post_count || 0}</p>
            <p className="text-[10px] uppercase font-semibold text-secondary">Posts</p>
          </div>
        </div>

        {/* Meta details */}
        <div className="space-y-2 text-xs text-secondary">
          <div className="flex justify-between items-center">
            <span>Created</span>
            <span className="text-primary font-medium">{new Date(community.created_at).toLocaleDateString()}</span>
          </div>
          <div className="flex justify-between items-center">
            <span>Category</span>
            <span className="text-accent font-medium">{community.category || 'General'}</span>
          </div>
          <div className="flex justify-between items-center">
            <span>Privacy</span>
            <span className="capitalize text-primary font-medium">{community.type}</span>
          </div>
        </div>

        {/* Quick Post button in sidebar */}
        <button
          onClick={() => onCreatePostClick(community.id, 'text')}
          className="w-full mt-4 py-2.5 rounded-xl bg-accent text-surface text-xs font-bold hover:opacity-90 transition-all shadow-md flex items-center justify-center gap-1.5"
        >
          <span>+</span>
          <span>Create Post</span>
        </button>

        <button
          onClick={handleShareCommunity}
          className="w-full mt-2 py-2 rounded-xl bg-surface hover:bg-border/60 border border-border text-secondary hover:text-primary text-xs font-semibold transition-all flex items-center justify-center gap-1.5 shadow-sm"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
          </svg>
          <span>Share Community</span>
        </button>
      </div>

      {/* Rules Widget (Collapsible list) */}
      <div className="p-5 rounded-2xl bg-surface/60 backdrop-blur-md border border-border shadow-sm">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-xs font-bold text-secondary uppercase tracking-wider">
            c/{community.slug} Rules ({rules.length})
          </h3>
          {isMod && (
            <button
              onClick={() => openModTab('rules')}
              className="text-[11px] text-accent hover:underline font-semibold"
            >
              Edit
            </button>
          )}
        </div>

        {rules.length === 0 ? (
          <p className="text-xs text-secondary italic">Standard platform guidelines apply.</p>
        ) : (
          <div className="space-y-2">
            {rules.map((rule, idx) => {
              const isExpanded = expandedRuleIndex === idx;
              return (
                <div
                  key={rule.id || idx}
                  className="rounded-xl border border-border/50 bg-background/40 overflow-hidden transition-colors"
                >
                  <button
                    onClick={() => setExpandedRuleIndex(isExpanded ? null : idx)}
                    className="w-full text-left p-2.5 flex items-center justify-between text-xs font-semibold text-primary hover:text-accent transition-colors gap-2"
                  >
                    <span className="truncate">
                      <span className="text-accent mr-1.5">{idx + 1}.</span>
                      {rule.title}
                    </span>
                    <svg
                      className={`w-3.5 h-3.5 text-secondary shrink-0 transition-transform ${isExpanded ? 'rotate-180 text-accent' : ''}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {isExpanded && rule.body && (
                    <div className="px-3 pb-3 pt-1 text-xs text-secondary leading-relaxed border-t border-border/30">
                      {rule.body}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Moderation Team Widget */}
      <div className="p-5 rounded-2xl bg-surface/60 backdrop-blur-md border border-border shadow-sm">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-xs font-bold text-secondary uppercase tracking-wider">Moderators</h3>
          {isOwner && (
            <button
              onClick={() => openModTab('team')}
              className="text-[11px] text-accent hover:underline font-semibold"
            >
              Manage
            </button>
          )}
        </div>

        {moderators.length === 0 ? (
          <p className="text-xs text-secondary italic">No moderators listed.</p>
        ) : (
          <div className="space-y-2.5">
            {moderators.map((m) => (
              <div
                key={m.uid}
                className="flex items-center justify-between p-2 rounded-xl bg-background/30 border border-border/40"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-full bg-accent/20 text-accent flex items-center justify-center font-bold text-xs overflow-hidden shrink-0 border border-border/60">
                    {m.photo_url || m.photoURL ? (
                      <img src={m.photo_url || m.photoURL} alt={m.name || m.displayName} className="w-full h-full object-cover" />
                    ) : (
                      (m.name || m.displayName || m.uid).charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0 truncate">
                    <p className="text-xs font-semibold text-primary truncate">{m.name || m.displayName || 'Moderator'}</p>
                    <span className="text-[10px] text-accent uppercase font-mono">{m.role}</span>
                  </div>
                </div>

                {onViewProfile && (
                  <button
                    onClick={() => onViewProfile({ uploaderUid: m.uid, uploaderName: m.name || m.displayName || 'Mod', uploaderPhotoURL: m.photo_url || m.photoURL })}
                    className="text-[11px] text-secondary hover:text-accent font-medium px-2 py-1 rounded-lg hover:bg-surface transition-colors shrink-0"
                  >
                    Profile &rarr;
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="w-full max-w-6xl mx-auto px-4 py-4 pb-8">
      {/* 1. Header: Banner */}
      <div
        className="w-full h-40 sm:h-48 md:h-56 rounded-3xl overflow-hidden relative border border-border shadow-sm"
        style={{
          background: community.banner_url ? undefined : bannerGradient,
          backgroundImage: community.banner_url ? `url(${community.banner_url})` : undefined,
          backgroundSize: 'cover',
          backgroundPosition: 'center'
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/25 to-transparent" />

        {isOwner && (
          <button
            onClick={() => openModTab('settings')}
            className="absolute top-4 right-4 px-3 py-1.5 rounded-xl bg-black/65 hover:bg-black/85 backdrop-blur-md border border-white/20 text-white text-xs font-semibold flex items-center gap-1.5 shadow-lg transition-all"
            title="Upload or change banner image"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span>Change Banner</span>
          </button>
        )}
      </div>

      {/* 2. Header Info Row (Overlapping Circular Community Icon) */}
      <div className="relative -mt-12 sm:-mt-14 px-3 sm:px-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="flex items-end gap-3 sm:gap-4">
            {/* Overlapping Circular Icon */}
            <div
              onClick={isOwner ? () => openModTab('settings') : undefined}
              className={`w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 rounded-full border-4 border-background bg-surface shadow-2xl flex items-center justify-center overflow-hidden shrink-0 relative group ${isOwner ? 'cursor-pointer' : ''}`}
              title={isOwner ? 'Click to change community icon' : undefined}
            >
              {community.icon_url ? (
                <img src={community.icon_url} alt={community.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-gradient-to-tr from-accent/30 to-accent/10 text-accent flex items-center justify-center text-3xl font-extrabold uppercase">
                  {community.name.charAt(0)}
                </div>
              )}
              {isOwner && (
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[11px] font-semibold text-center px-1">
                  Change Icon
                </div>
              )}
            </div>

            {/* Title, Subtitle, Member Count */}
            <div className="mb-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl md:text-3xl font-black text-primary tracking-tight">
                  {community.name}
                </h1>
                {community.is_nsfw === 1 && (
                  <span className="px-2 py-0.5 rounded-md bg-red-500/20 text-red-400 border border-red-500/30 text-[10px] font-bold">
                    18+
                  </span>
                )}
                <span className="px-2 py-0.5 rounded-md bg-surface text-secondary border border-border text-[10px] uppercase font-semibold">
                  {community.type}
                </span>
                {community.category && (
                  <span className="px-2 py-0.5 rounded-md bg-accent/10 text-accent border border-accent/20 text-[10px] font-semibold">
                    {community.category}
                  </span>
                )}
              </div>
              <p className="text-xs text-secondary mt-1 font-medium flex items-center gap-1.5">
                <span className="font-mono text-primary/80">c/{community.slug}</span>
                <span>·</span>
                <span>{community.member_count} {community.member_count === 1 ? 'member' : 'members'}</span>
              </p>
            </div>
          </div>

          {/* Action Buttons: Join/Owner & Mod & New Post */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {isOwner ? (
              <div className="px-4 py-2 rounded-xl text-xs font-bold bg-accent/15 text-accent border border-accent/30 shadow-sm">
                Owner
              </div>
            ) : isMember ? (
              <button
                onClick={handleJoinToggle}
                disabled={isJoining}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-surface text-secondary border border-border hover:text-red-400 hover:border-red-400/50 transition-all shadow-sm"
                title="Click to leave community"
              >
                {isJoining ? 'Updating...' : 'Joined'}
              </button>
            ) : (
              <button
                onClick={user ? handleJoinToggle : () => alert('Please sign in to join communities.')}
                disabled={isJoining}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-accent text-surface hover:opacity-90 transition-all shadow-md"
              >
                {isJoining ? 'Updating...' : community.type === 'private' ? 'Request to Join' : 'Join'}
              </button>
            )}

            {isMod && (
              <button
                onClick={() => openModTab(pendingModQueueCount > 0 ? 'queue' : 'settings')}
                className="px-3.5 py-2 rounded-xl text-xs font-bold bg-surface hover:bg-border/60 border border-accent/40 text-accent transition-all flex items-center gap-1.5 shadow-sm relative"
                title="Manage community settings, rules, banner, and moderation"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span>Mod & Settings</span>
                {pendingModQueueCount > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black bg-amber-500 text-black shadow animate-pulse">
                    {pendingModQueueCount}
                  </span>
                )}
              </button>
            )}

            <button
              onClick={() => onCreatePostClick(community.id, 'text')}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-surface hover:bg-border/60 border border-border text-primary transition-all flex items-center gap-1.5 shadow-sm"
            >
              <span>+</span>
              <span>New Post</span>
            </button>

            <button
              onClick={handleShareCommunity}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-surface hover:bg-border/60 border border-border text-secondary hover:text-primary transition-all flex items-center gap-1.5 shadow-sm"
              title="Share community"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
              <span>Share</span>
            </button>
          </div>
        </div>
      </div>

      {/* 3. Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-border/60 mb-5">
        <button
          onClick={() => setActiveTab('feed')}
          className={`pb-3 px-3 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 ${
            activeTab === 'feed'
              ? 'border-accent text-accent'
              : 'border-transparent text-secondary hover:text-primary'
          }`}
        >
          Feed
        </button>

        {/* Mobile-only "About" tab to view sidebar info cleanly */}
        <button
          onClick={() => setActiveTab('about')}
          className={`lg:hidden pb-3 px-3 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 ${
            activeTab === 'about'
              ? 'border-accent text-accent'
              : 'border-transparent text-secondary hover:text-primary'
          }`}
        >
          About
        </button>

        <button
          onClick={() => setActiveTab('rules')}
          className={`pb-3 px-3 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 ${
            activeTab === 'rules'
              ? 'border-accent text-accent'
              : 'border-transparent text-secondary hover:text-primary'
          }`}
        >
          Rules ({rules.length})
        </button>

        <button
          onClick={() => setActiveTab('members')}
          className={`pb-3 px-3 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 ${
            activeTab === 'members'
              ? 'border-accent text-accent'
              : 'border-transparent text-secondary hover:text-primary'
          }`}
        >
          Moderation Team ({moderators.length})
        </button>
      </div>

      {/* 4. Reddit-like Two Column Layout (Desktop: Feed ~680-720px + Sticky Sidebar ~310px) */}
      <div className="w-full flex flex-col lg:flex-row justify-center items-start gap-7">
        {/* Left Column: Feed & Main Tab Contents */}
        <div className="w-full lg:max-w-[700px] flex-1 min-w-0">
          {activeTab === 'feed' && (
            <CommunityFeed
              key={`${community.id}_${refreshTrigger}`}
              communityId={community.id}
              communitySlug={community.slug}
              communityIconUrl={community.icon_url}
              user={user}
              onPostClick={onPostClick}
              onCreatePostClick={onCreatePostClick}
              onViewProfile={onViewProfile}
              onLikeToggle={onLikeToggle}
              onSaveToggle={onSaveToggle}
              savedImages={savedImages}
              isMod={isMod}
            />
          )}

          {/* Mobile About Tab Content */}
          {activeTab === 'about' && (
            <div className="lg:hidden">
              {renderSidebarContent()}
            </div>
          )}

          {activeTab === 'rules' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-base font-bold text-primary">Community Guidelines & Rules</h3>
                {isMod && (
                  <button
                    onClick={() => openModTab('rules')}
                    className="px-3 py-1.5 bg-surface hover:bg-border/60 border border-border rounded-xl text-xs font-semibold text-accent transition-colors"
                  >
                    + Add / Manage Rules
                  </button>
                )}
              </div>
              {rules.length === 0 ? (
                <div className="p-6 rounded-2xl bg-surface/40 border border-border text-center space-y-2">
                  <p className="text-xs text-secondary">No custom rules established yet. Standard platform guidelines apply.</p>
                </div>
              ) : (
                rules.map((rule, idx) => (
                  <div key={rule.id || idx} className="p-4 rounded-2xl bg-surface/50 border border-border">
                    <div className="flex items-start gap-3">
                      <span className="w-6 h-6 rounded-full bg-accent/20 text-accent text-xs font-bold flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>
                      <div>
                        <h4 className="text-sm font-bold text-primary">{rule.title}</h4>
                        {rule.body && <p className="text-xs text-secondary mt-1 leading-relaxed">{rule.body}</p>}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'members' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-base font-bold text-primary">Moderators & Leaders</h3>
                {isOwner && (
                  <button
                    onClick={() => openModTab('team')}
                    className="px-3 py-1.5 bg-surface hover:bg-border/60 border border-border rounded-xl text-xs font-semibold text-accent transition-colors"
                  >
                    + Manage Mod Team
                  </button>
                )}
              </div>
              {moderators.length === 0 ? (
                <p className="text-xs text-secondary italic">No moderators listed.</p>
              ) : (
                moderators.map((m) => (
                  <div key={m.uid} className="flex items-center justify-between p-3.5 rounded-xl bg-surface/50 border border-border">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-accent/20 text-accent flex items-center justify-center font-bold text-xs overflow-hidden shrink-0">
                        {m.photo_url || m.photoURL ? (
                          <img src={m.photo_url || m.photoURL} alt={m.name || m.displayName} className="w-full h-full object-cover" />
                        ) : (
                          (m.name || m.displayName || m.uid).charAt(0).toUpperCase()
                        )}
                      </div>
                      <div className="min-w-0 truncate">
                        <p className="text-xs font-bold text-primary truncate">{m.name || m.displayName || 'Creator'}</p>
                        <span className="text-[10px] text-accent uppercase font-mono">{m.role}</span>
                      </div>
                    </div>
                    {onViewProfile && (
                      <button
                        onClick={() => onViewProfile({ uploaderUid: m.uid, uploaderName: m.name || m.displayName || 'Mod', uploaderPhotoURL: m.photo_url || m.photoURL })}
                        className="text-xs text-secondary hover:text-primary transition-colors shrink-0"
                      >
                        Profile &rarr;
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Right Column: Sticky Sidebar on Desktop (About, Rules, Moderators, stats ~310px) */}
        <aside className="hidden lg:block w-[310px] shrink-0 sticky top-4 self-start">
          {renderSidebarContent()}
        </aside>
      </div>

      {isModDashboardOpen && (
        <ModDashboardModal
          community={community}
          user={user}
          initialTab={initialModTab}
          onClose={() => {
            setIsModDashboardOpen(false);
            fetchCommunityDetails();
          }}
          onCommunityUpdated={fetchCommunityDetails}
        />
      )}
    </div>
  );
};

export default CommunityView;
