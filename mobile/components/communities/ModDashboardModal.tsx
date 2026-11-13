import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { User } from 'firebase/auth';
import { Community, ModPermissions } from '../../types';
import { uploadImage } from '../../services/storageService';

interface ModDashboardModalProps {
  community: Community;
  user: User | null;
  initialTab?: 'settings' | 'rules' | 'team' | 'queue' | 'requests' | 'reports' | 'bans' | 'automod' | 'modlog';
  onClose: () => void;
  onCommunityUpdated?: () => void;
}

const CATEGORIES = [
  'General', 'Photography', 'Digital Art', 'Anime & Manga',
  'Architecture', 'Nature', 'Wallpapers', 'Discussion', 'Gaming', 'Technology'
];

export const ModDashboardModal: React.FC<ModDashboardModalProps> = ({
  community,
  user,
  initialTab = 'settings',
  onClose,
  onCommunityUpdated
}) => {
  const [activeTab, setActiveTab] = useState<'settings' | 'rules' | 'team' | 'queue' | 'requests' | 'reports' | 'bans' | 'automod' | 'modlog'>(initialTab);
  const [pendingPosts, setPendingPosts] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [inviteUsername, setInviteUsername] = useState('');
  const [isInviting, setIsInviting] = useState(false);
  const [reports, setReports] = useState<any[]>([]);
  const [bans, setBans] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [rules, setRules] = useState<any[]>([]);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // --- Settings Form State ---
  const [name, setName] = useState(community.name || '');
  const [description, setDescription] = useState(community.description || '');
  const [category, setCategory] = useState(community.category || 'General');
  const [communityType, setCommunityType] = useState(community.type || 'public');
  const [isNsfw, setIsNsfw] = useState(Boolean(community.is_nsfw));
  const [bannerUrl, setBannerUrl] = useState(community.banner_url || '');
  const [iconUrl, setIconUrl] = useState(community.icon_url || '');
  const [isUploadingBanner, setIsUploadingBanner] = useState(false);
  const [isUploadingIcon, setIsUploadingIcon] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  const bannerFileInputRef = useRef<HTMLInputElement>(null);
  const iconFileInputRef = useRef<HTMLInputElement>(null);

  // --- Rules Form State ---
  const [ruleTitle, setRuleTitle] = useState('');
  const [ruleBody, setRuleBody] = useState('');
  const [isSubmittingRule, setIsSubmittingRule] = useState(false);

  // --- Team Management State ---
  const [newModUid, setNewModUid] = useState('');
  const [modPerms, setModPerms] = useState<number>(
    ModPermissions.MANAGE_POSTS | ModPermissions.MANAGE_COMMENTS | ModPermissions.VIEW_MOD_LOG
  );
  const [isSubmittingMod, setIsSubmittingMod] = useState(false);

  // --- Ban Form State ---
  const [banTargetUid, setBanTargetUid] = useState('');
  const [banReason, setBanReason] = useState('');
  const [banDuration, setBanDuration] = useState('7');

  // --- Automod Form State ---
  const [bannedWordsText, setBannedWordsText] = useState(
    ((community.settings?.banned_words || []) as string[]).join(', ')
  );
  const [requireApproval, setRequireApproval] = useState(
    Boolean(community.settings?.require_post_approval)
  );
  const [isSavingAutomod, setIsSavingAutomod] = useState(false);

  const isOwner = Boolean(user && (community.owner_uid === user.uid || community.userRole === 'owner'));

  const fetchTabContent = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      if (activeTab === 'queue') {
        const res = await fetch(`/api/communities/posts?community_id=${community.id}&uid=${user.uid}&mod_status=pending_approval&limit=50`);
        const data = await res.json();
        if (data.success) setPendingPosts(data.posts || []);
      } else if (activeTab === 'requests') {
        const res = await fetch(`/api/communities/members?communityId=${community.id}&type=requests&limit=50`);
        const data = await res.json();
        if (data.success) setRequests(data.requests || []);
      } else if (activeTab === 'reports') {
        const res = await fetch(`/api/communities/reports?communityId=${community.id}&uid=${user.uid}`);
        const data = await res.json();
        if (data.success) setReports(data.reports || []);
      } else if (activeTab === 'bans') {
        const res = await fetch(`/api/communities/bans?communityId=${community.id}&uid=${user.uid}`);
        const data = await res.json();
        if (data.success) setBans(data.bans || []);
      } else if (activeTab === 'modlog') {
        const res = await fetch(`/api/communities/modlog?communityId=${community.id}&uid=${user.uid}`);
        const data = await res.json();
        if (data.success) setLogs(data.logs || []);
      } else if (activeTab === 'rules') {
        const res = await fetch(`/api/communities/rules?communityId=${community.id}`);
        const data = await res.json();
        if (data.success) setRules(data.rules || []);
      } else if (activeTab === 'team') {
        const res = await fetch(`/api/communities/members?communityId=${community.id}&role=mods`);
        const data = await res.json();
        if (data.success) setTeamMembers(data.members || []);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch moderation data.');
    } finally {
      setIsLoading(false);
    }
  }, [activeTab, community.id, user]);

  useEffect(() => {
    fetchTabContent();
  }, [fetchTabContent]);

  // --- Handlers: Settings & Visuals ---
  const handleBannerFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setIsUploadingBanner(true);
      setError(null);
      const { url } = await uploadImage(file);
      setBannerUrl(url);
    } catch (err: any) {
      setError(err.message || 'Failed to upload banner image.');
    } finally {
      setIsUploadingBanner(false);
    }
  };

  const handleIconFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setIsUploadingIcon(true);
      setError(null);
      const { url } = await uploadImage(file);
      setIconUrl(url);
    } catch (err: any) {
      setError(err.message || 'Failed to upload icon image.');
    } finally {
      setIsUploadingIcon(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    try {
      setIsSavingSettings(true);
      setError(null);
      setSuccessMsg(null);
      const token = await user.getIdToken();

      const res = await fetch(`/api/communities/${community.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          uid: user.uid,
          name: name.trim(),
          description: description.trim(),
          category,
          type: communityType,
          is_nsfw: isNsfw,
          banner_url: bannerUrl.trim(),
          icon_url: iconUrl.trim()
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to update community settings.');
      }

      setSuccessMsg('Community settings and visuals updated successfully.');
      if (onCommunityUpdated) onCommunityUpdated();
    } catch (err: any) {
      setError(err.message || 'Failed to save settings.');
    } finally {
      setIsSavingSettings(false);
    }
  };

  // --- Handlers: Rules ---
  const handleAddRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !ruleTitle.trim()) return;
    try {
      setIsSubmittingRule(true);
      setError(null);
      const token = await user.getIdToken();

      const res = await fetch('/api/communities/rules', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          uid: user.uid,
          communityId: community.id,
          title: ruleTitle.trim(),
          body: ruleBody.trim(),
          position: rules.length + 1
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to add rule.');

      setRuleTitle('');
      setRuleBody('');
      setSuccessMsg('Rule added successfully.');
      fetchTabContent();
      if (onCommunityUpdated) onCommunityUpdated();
    } catch (err: any) {
      setError(err.message || 'Failed to add rule.');
    } finally {
      setIsSubmittingRule(false);
    }
  };

  const handleDeleteRule = async (ruleId: string) => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/communities/rules', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          uid: user.uid,
          communityId: community.id,
          ruleId
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to delete rule.');

      setRules(prev => prev.filter(r => r.id !== ruleId));
      setSuccessMsg('Rule deleted.');
      if (onCommunityUpdated) onCommunityUpdated();
    } catch (err: any) {
      alert(err.message || 'Failed to delete rule.');
    }
  };

  // --- Handlers: Team & Moderators ---
  const handleAddModerator = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newModUid.trim()) return;
    try {
      setIsSubmittingMod(true);
      setError(null);
      const token = await user.getIdToken();

      const res = await fetch('/api/communities/members', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          uid: user.uid,
          communityId: community.id,
          action: 'update_role',
          targetUid: newModUid.trim(),
          newRole: 'moderator',
          newPermissions: modPerms
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to assign moderator.');

      setNewModUid('');
      setSuccessMsg('Moderator assigned successfully.');
      fetchTabContent();
      if (onCommunityUpdated) onCommunityUpdated();
    } catch (err: any) {
      setError(err.message || 'Failed to assign moderator.');
    } finally {
      setIsSubmittingMod(false);
    }
  };

  const handleDemoteModerator = async (targetUid: string) => {
    if (!user) return;
    if (!confirm('Are you sure you want to demote this moderator to member?')) return;
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
          communityId: community.id,
          action: 'update_role',
          targetUid,
          newRole: 'member',
          newPermissions: 0
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to demote moderator.');

      setTeamMembers(prev => prev.filter(m => m.uid !== targetUid));
      setSuccessMsg('Moderator demoted to member.');
      if (onCommunityUpdated) onCommunityUpdated();
    } catch (err: any) {
      alert(err.message || 'Failed to demote moderator.');
    }
  };

  // --- Handlers: Pending Approval Posts ---
  const handleApprovePost = async (postId: string) => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/communities/moderation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          action: 'approve_post',
          communityId: community.id,
          postId
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to approve post.');
      setPendingPosts(prev => prev.filter(p => p.id !== postId));
      setSuccessMsg('Post approved and published to community feed.');
      if (onCommunityUpdated) onCommunityUpdated();
    } catch (err: any) {
      alert(err.message || 'Approval failed.');
    }
  };

  const handleRejectPost = async (postId: string) => {
    if (!user) return;
    if (!confirm('Reject and permanently remove this pending post?')) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/communities/moderation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          action: 'remove_post',
          communityId: community.id,
          postId
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to reject post.');
      setPendingPosts(prev => prev.filter(p => p.id !== postId));
      setSuccessMsg('Post rejected and removed.');
    } catch (err: any) {
      alert(err.message || 'Rejection failed.');
    }
  };

  // --- Handlers: Join Requests (Private Communities) ---
  const handleApproveRequest = async (targetUid: string) => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/communities/members', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          action: 'approve_request',
          communityId: community.id,
          targetUid,
          uid: user.uid
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to approve request.');
      setRequests(prev => prev.filter(r => r.uid !== targetUid));
      setSuccessMsg('Join request approved!');
      if (onCommunityUpdated) onCommunityUpdated();
    } catch (err: any) {
      alert(err.message || 'Approval failed.');
    }
  };

  const handleRejectRequest = async (targetUid: string) => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/communities/members', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          action: 'reject_request',
          communityId: community.id,
          targetUid,
          uid: user.uid
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to reject request.');
      setRequests(prev => prev.filter(r => r.uid !== targetUid));
      setSuccessMsg('Join request rejected.');
    } catch (err: any) {
      alert(err.message || 'Rejection failed.');
    }
  };

  const handleInviteUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !inviteUsername.trim()) return;
    setIsInviting(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/communities/members', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          action: 'invite',
          communityId: community.id,
          targetUsername: inviteUsername.trim(),
          uid: user.uid
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to invite member.');
      setInviteUsername('');
      setSuccessMsg(data.message || 'Member successfully added to community!');
      fetchTabContent();
      if (onCommunityUpdated) onCommunityUpdated();
    } catch (err: any) {
      alert(err.message || 'Invite failed.');
    } finally {
      setIsInviting(false);
    }
  };

  // --- Handlers: Reports, Bans, Automod ---
  const handleReportAction = async (reportId: string, action: 'approve' | 'dismiss') => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/communities/reports', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          uid: user.uid,
          communityId: community.id,
          reportId,
          action
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Action failed.');
      setReports(prev => prev.filter(r => r.id !== reportId));
    } catch (err: any) {
      alert(err.message || 'Action failed.');
    }
  };

  const handleBanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !banTargetUid.trim()) return;
    try {
      const token = await user.getIdToken();
      const durationDays = banDuration === 'perm' ? 0 : parseInt(banDuration, 10);
      const res = await fetch('/api/communities/bans', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          uid: user.uid,
          communityId: community.id,
          targetUid: banTargetUid.trim(),
          reason: banReason.trim(),
          durationDays
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Ban failed.');
      setBanTargetUid('');
      setBanReason('');
      setSuccessMsg('User banned successfully.');
      fetchTabContent();
    } catch (err: any) {
      alert(err.message || 'Ban failed.');
    }
  };

  const handleUnban = async (targetUid: string) => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/communities/bans', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          uid: user.uid,
          communityId: community.id,
          targetUid
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Unban failed.');
      setBans(prev => prev.filter(b => b.uid !== targetUid));
      setSuccessMsg('User unbanned.');
    } catch (err: any) {
      alert(err.message || 'Unban failed.');
    }
  };

  const handleSaveAutomod = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setIsSavingAutomod(true);
    try {
      const token = await user.getIdToken();
      const bannedWords = bannedWordsText
        .split(',')
        .map(w => w.trim().toLowerCase())
        .filter(Boolean);

      const res = await fetch('/api/communities/moderation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          uid: user.uid,
          communityId: community.id,
          action: 'update_automod',
          settings: {
            banned_words: bannedWords,
            require_post_approval: requireApproval
          }
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to save automod settings.');
      setSuccessMsg('Automod settings saved.');
      if (onCommunityUpdated) onCommunityUpdated();
    } catch (err: any) {
      alert(err.message || 'Save failed.');
    } finally {
      setIsSavingAutomod(false);
    }
  };

  const togglePermissionBit = (bit: number) => {
    setModPerms(prev => prev ^ bit);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-md">
      <div className="bg-surface border border-border rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden text-primary">
        {/* Modal Top Header */}
        <div className="flex justify-between items-center p-4 sm:p-5 border-b border-border/60 bg-surface">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-primary">Community Management: c/{community.slug}</h2>
              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-accent/15 text-accent border border-accent/30">
                {isOwner ? 'Owner' : 'Moderator'}
              </span>
            </div>
            <p className="text-xs text-secondary mt-0.5">Customize visuals, edit guidelines, manage team, and review moderation queues.</p>
          </div>
          <button
            onClick={onClose}
            className="text-secondary hover:text-primary transition-colors text-2xl leading-none p-1"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-border/60 bg-background/40 px-4 sm:px-6 gap-2 sm:gap-4 overflow-x-auto scrollbar-none [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          <button
            onClick={() => setActiveTab('settings')}
            className={`py-3 text-xs font-bold uppercase tracking-wider border-b-2 whitespace-nowrap transition-colors ${
              activeTab === 'settings' ? 'border-accent text-accent' : 'border-transparent text-secondary hover:text-primary'
            }`}
          >
            Settings & Visuals
          </button>
          <button
            onClick={() => setActiveTab('rules')}
            className={`py-3 text-xs font-bold uppercase tracking-wider border-b-2 whitespace-nowrap transition-colors ${
              activeTab === 'rules' ? 'border-accent text-accent' : 'border-transparent text-secondary hover:text-primary'
            }`}
          >
            Rules & Guidelines
          </button>
          <button
            onClick={() => setActiveTab('team')}
            className={`py-3 text-xs font-bold uppercase tracking-wider border-b-2 whitespace-nowrap transition-colors ${
              activeTab === 'team' ? 'border-accent text-accent' : 'border-transparent text-secondary hover:text-primary'
            }`}
          >
            Mod Team
          </button>
          <button
            onClick={() => setActiveTab('queue')}
            className={`py-3 text-xs font-bold uppercase tracking-wider border-b-2 whitespace-nowrap transition-colors ${
              activeTab === 'queue' ? 'border-accent text-accent' : 'border-transparent text-secondary hover:text-primary'
            }`}
          >
            Queue ({pendingPosts.length})
          </button>
          <button
            onClick={() => setActiveTab('requests')}
            className={`py-3 text-xs font-bold uppercase tracking-wider border-b-2 whitespace-nowrap transition-colors ${
              activeTab === 'requests' ? 'border-accent text-accent' : 'border-transparent text-secondary hover:text-primary'
            }`}
          >
            Requests ({requests.length})
          </button>
          <button
            onClick={() => setActiveTab('reports')}
            className={`py-3 text-xs font-bold uppercase tracking-wider border-b-2 whitespace-nowrap transition-colors ${
              activeTab === 'reports' ? 'border-accent text-accent' : 'border-transparent text-secondary hover:text-primary'
            }`}
          >
            Reports ({reports.length})
          </button>
          <button
            onClick={() => setActiveTab('bans')}
            className={`py-3 text-xs font-bold uppercase tracking-wider border-b-2 whitespace-nowrap transition-colors ${
              activeTab === 'bans' ? 'border-accent text-accent' : 'border-transparent text-secondary hover:text-primary'
            }`}
          >
            Bans ({bans.length})
          </button>
          <button
            onClick={() => setActiveTab('automod')}
            className={`py-3 text-xs font-bold uppercase tracking-wider border-b-2 whitespace-nowrap transition-colors ${
              activeTab === 'automod' ? 'border-accent text-accent' : 'border-transparent text-secondary hover:text-primary'
            }`}
          >
            Automod
          </button>
          <button
            onClick={() => setActiveTab('modlog')}
            className={`py-3 text-xs font-bold uppercase tracking-wider border-b-2 whitespace-nowrap transition-colors ${
              activeTab === 'modlog' ? 'border-accent text-accent' : 'border-transparent text-secondary hover:text-primary'
            }`}
          >
            Audit Log
          </button>
        </div>

        {/* Tab Body */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-6">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-400">
              {error}
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-400">
              {successMsg}
            </div>
          )}

          {isLoading && (
            <div className="py-8 text-center text-xs text-secondary">
              Loading data...
            </div>
          )}

          {/* 1. SETTINGS & VISUALS TAB */}
          {activeTab === 'settings' && (
            <form onSubmit={handleSaveSettings} className="space-y-6 max-w-2xl">
              <div>
                <h3 className="text-sm font-bold text-primary uppercase tracking-wider mb-1">Community Information</h3>
                <p className="text-xs text-secondary mb-4">Edit public details and tags for c/{community.slug}.</p>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-secondary mb-1">Community Name</label>
                    <input
                      type="text"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      required
                      maxLength={60}
                      className="w-full px-3.5 py-2.5 bg-background border border-border rounded-xl text-xs text-primary focus:outline-none focus:border-accent"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-secondary mb-1">Description</label>
                    <textarea
                      value={description}
                      onChange={e => setDescription(e.target.value)}
                      rows={3}
                      maxLength={500}
                      placeholder="What is this community about?"
                      className="w-full px-3.5 py-2.5 bg-background border border-border rounded-xl text-xs text-primary focus:outline-none focus:border-accent"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-secondary mb-1">Category</label>
                      <div className="relative">
                        <select
                          value={category}
                          onChange={e => setCategory(e.target.value)}
                          className="w-full px-3.5 py-2.5 bg-background border border-border rounded-xl text-xs text-primary appearance-none focus:outline-none focus:border-accent min-h-[44px] pr-8"
                        >
                          {CATEGORIES.map(c => (
                            <option key={c} value={c} className="bg-surface text-primary">{c}</option>
                          ))}
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-secondary">
                          <svg className="w-4 h-4 fill-current" viewBox="0 0 20 20">
                            <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" fillRule="evenodd" />
                          </svg>
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-secondary mb-1">Privacy Type</label>
                      <div className="relative">
                        <select
                          value={communityType}
                          onChange={e => setCommunityType(e.target.value as any)}
                          className="w-full px-3.5 py-2.5 bg-background border border-border rounded-xl text-xs text-primary appearance-none focus:outline-none focus:border-accent min-h-[44px] pr-8"
                        >
                          <option value="public" className="bg-surface text-primary">Public (Anyone can view & post)</option>
                          <option value="restricted" className="bg-surface text-primary">Restricted (Anyone views, approved post)</option>
                          <option value="private" className="bg-surface text-primary">Private (Invite / Approval required)</option>
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-secondary">
                          <svg className="w-4 h-4 fill-current" viewBox="0 0 20 20">
                            <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" fillRule="evenodd" />
                          </svg>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div
                    onClick={() => setIsNsfw(!isNsfw)}
                    className="flex items-center justify-between p-3.5 rounded-xl bg-surface/80 border border-border/80 cursor-pointer active:scale-[0.99] transition-all min-h-[48px] select-none mt-2"
                  >
                    <div className="flex flex-col pr-3">
                      <span className="text-sm font-semibold text-primary">18+ / NSFW Community</span>
                      <span className="text-xs text-secondary">Flag community as containing mature or adult content</span>
                    </div>
                    <div className={`w-12 h-7 rounded-full p-0.5 transition-colors duration-200 ease-in-out shrink-0 ${isNsfw ? 'bg-accent' : 'bg-white/10'}`}>
                      <div className={`w-6 h-6 rounded-full bg-white shadow-md transform transition-transform duration-200 ease-in-out ${isNsfw ? 'translate-x-5' : 'translate-x-0'}`} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Visuals: Banner and Icon */}
              <div className="pt-4 border-t border-border/60">
                <h3 className="text-sm font-bold text-primary uppercase tracking-wider mb-1">Visual Branding</h3>
                <p className="text-xs text-secondary mb-4">Upload custom banner and icon images directly from your device or paste URLs.</p>

                {/* Banner Section */}
                <div className="space-y-3 mb-6">
                  <label className="block text-xs font-semibold text-secondary">Banner Image</label>
                  <div
                    className="w-full h-32 rounded-2xl border border-border bg-gradient-to-r from-surface to-background overflow-hidden relative flex items-center justify-center"
                    style={bannerUrl ? { backgroundImage: `url(${bannerUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
                  >
                    {!bannerUrl && <span className="text-xs text-secondary/60">No banner image set</span>}
                    {isUploadingBanner && (
                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-xs text-primary">
                        Uploading banner...
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="file"
                      ref={bannerFileInputRef}
                      onChange={handleBannerFileSelect}
                      accept="image/*"
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => bannerFileInputRef.current?.click()}
                      disabled={isUploadingBanner}
                      className="px-3.5 py-2 bg-surface hover:bg-border/60 border border-border rounded-xl text-xs font-semibold text-primary transition-colors"
                    >
                      {isUploadingBanner ? 'Uploading...' : 'Upload Banner File'}
                    </button>
                    <input
                      type="url"
                      value={bannerUrl}
                      onChange={e => setBannerUrl(e.target.value)}
                      placeholder="Or paste banner image URL"
                      className="flex-1 px-3 py-2 bg-background border border-border rounded-xl text-xs text-primary focus:outline-none focus:border-accent"
                    />
                  </div>
                </div>

                {/* Icon Section */}
                <div className="space-y-3">
                  <label className="block text-xs font-semibold text-secondary">Community Icon</label>
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-2xl border-2 border-border bg-surface overflow-hidden flex items-center justify-center text-xl font-bold text-accent flex-shrink-0">
                      {iconUrl ? (
                        <img src={iconUrl} alt="Icon preview" className="w-full h-full object-cover" />
                      ) : (
                        name.charAt(0).toUpperCase() || 'C'
                      )}
                    </div>
                    <div className="flex-1 space-y-2">
                      <div className="flex gap-2">
                        <input
                          type="file"
                          ref={iconFileInputRef}
                          onChange={handleIconFileSelect}
                          accept="image/*"
                          className="hidden"
                        />
                        <button
                          type="button"
                          onClick={() => iconFileInputRef.current?.click()}
                          disabled={isUploadingIcon}
                          className="px-3.5 py-2 bg-surface hover:bg-border/60 border border-border rounded-xl text-xs font-semibold text-primary transition-colors"
                        >
                          {isUploadingIcon ? 'Uploading...' : 'Upload Icon File'}
                        </button>
                        <input
                          type="url"
                          value={iconUrl}
                          onChange={e => setIconUrl(e.target.value)}
                          placeholder="Or paste icon image URL"
                          className="flex-1 px-3 py-2 bg-background border border-border rounded-xl text-xs text-primary focus:outline-none focus:border-accent"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-border/60 flex justify-end">
                <button
                  type="submit"
                  disabled={isSavingSettings}
                  className="px-6 py-2.5 bg-accent text-surface font-bold rounded-xl text-xs hover:opacity-90 transition-opacity shadow-md disabled:opacity-50"
                >
                  {isSavingSettings ? 'Saving...' : 'Save Settings & Visuals'}
                </button>
              </div>
            </form>
          )}

          {/* 2. RULES TAB */}
          {activeTab === 'rules' && (
            <div className="space-y-6">
              {/* Existing Rules List */}
              <div>
                <h3 className="text-sm font-bold text-primary uppercase tracking-wider mb-1">Current Community Rules</h3>
                <p className="text-xs text-secondary mb-3">Members must follow these guidelines when participating.</p>

                {rules.length === 0 ? (
                  <div className="p-4 bg-background/50 border border-border rounded-xl text-xs text-secondary">
                    No custom rules established yet.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {rules.map((r, i) => (
                      <div key={r.id || i} className="p-3.5 rounded-xl bg-background/60 border border-border flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <span className="w-5 h-5 rounded-full bg-accent/20 text-accent text-xs font-bold flex items-center justify-center flex-shrink-0">
                            {i + 1}
                          </span>
                          <div>
                            <h4 className="text-xs font-bold text-primary">{r.title}</h4>
                            {r.body && <p className="text-xs text-secondary mt-1">{r.body}</p>}
                          </div>
                        </div>
                        <button
                          onClick={() => handleDeleteRule(r.id)}
                          className="text-xs text-red-400 hover:text-red-300 font-semibold px-2 py-1 bg-red-500/10 rounded-lg border border-red-500/20"
                        >
                          Delete
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Add New Rule Form */}
              <form onSubmit={handleAddRule} className="p-4 rounded-xl bg-background/80 border border-border space-y-3">
                <h4 className="text-xs font-bold text-primary uppercase tracking-wider">Add a New Rule</h4>
                <div>
                  <label className="block text-xs font-semibold text-secondary mb-1">Rule Title</label>
                  <input
                    type="text"
                    value={ruleTitle}
                    onChange={e => setRuleTitle(e.target.value)}
                    placeholder="e.g. Respect other creators"
                    required
                    maxLength={100}
                    className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-xs text-primary focus:outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-secondary mb-1">Rule Details / Guidance (Optional)</label>
                  <textarea
                    value={ruleBody}
                    onChange={e => setRuleBody(e.target.value)}
                    placeholder="Explain the boundary or requirement..."
                    rows={2}
                    maxLength={500}
                    className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-xs text-primary focus:outline-none focus:border-accent"
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={isSubmittingRule || !ruleTitle.trim()}
                    className="px-4 py-2 bg-accent text-surface text-xs font-bold rounded-lg hover:opacity-90 disabled:opacity-50"
                  >
                    {isSubmittingRule ? 'Adding...' : 'Add Rule'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* 3. MODERATION TEAM TAB */}
          {activeTab === 'team' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-bold text-primary uppercase tracking-wider mb-1">Community Team</h3>
                <p className="text-xs text-secondary mb-3">Owners and appointed moderators with administrative permissions.</p>

                <div className="space-y-3">
                  {teamMembers.map((m) => (
                    <div key={m.uid} className="p-3.5 rounded-xl bg-background/60 border border-border flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-accent/20 text-accent flex items-center justify-center font-bold text-xs overflow-hidden">
                          {m.photo_url ? (
                            <img src={m.photo_url} alt={m.name} className="w-full h-full object-cover" />
                          ) : (
                            (m.name || m.uid).charAt(0).toUpperCase()
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-primary">{m.name || 'Member'}</span>
                            <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-accent/15 text-accent border border-accent/20">
                              {m.role}
                            </span>
                          </div>
                          <p className="text-[10px] text-secondary font-mono mt-0.5">UID: {m.uid}</p>
                        </div>
                      </div>

                      {isOwner && m.role !== 'owner' && (
                        <button
                          onClick={() => handleDemoteModerator(m.uid)}
                          className="px-3 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg text-xs font-semibold"
                        >
                          Demote to Member
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Assign Moderator Form (Owner only) */}
              {isOwner && (
                <form onSubmit={handleAddModerator} className="p-4 rounded-xl bg-background/80 border border-border space-y-4">
                  <h4 className="text-xs font-bold text-primary uppercase tracking-wider">Promote Member to Moderator</h4>
                  <div>
                    <label className="block text-xs font-semibold text-secondary mb-1">User UID</label>
                    <input
                      type="text"
                      value={newModUid}
                      onChange={e => setNewModUid(e.target.value)}
                      placeholder="Paste user UID..."
                      required
                      className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-xs text-primary focus:outline-none focus:border-accent"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-secondary mb-2">Granted Permissions</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      {[
                        { label: 'Manage Posts (Approve/Remove/Pin)', bit: ModPermissions.MANAGE_POSTS },
                        { label: 'Manage Comments', bit: ModPermissions.MANAGE_COMMENTS },
                        { label: 'Manage Members & Join Requests', bit: ModPermissions.MANAGE_MEMBERS },
                        { label: 'Ban & Unban Users', bit: ModPermissions.BAN_USERS },
                        { label: 'Manage Rules & Settings', bit: ModPermissions.MANAGE_RULES_SETTINGS },
                        { label: 'View Mod Audit Log', bit: ModPermissions.VIEW_MOD_LOG },
                      ].map(perm => (
                        <label key={perm.bit} className="flex items-center gap-2 cursor-pointer p-2 rounded-lg bg-surface/50 border border-border/50">
                          <input
                            type="checkbox"
                            checked={(modPerms & perm.bit) !== 0}
                            onChange={() => togglePermissionBit(perm.bit)}
                            className="rounded border-border text-accent focus:ring-accent"
                          />
                          <span className="text-secondary text-[11px]">{perm.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={isSubmittingMod || !newModUid.trim()}
                      className="px-4 py-2 bg-accent text-surface text-xs font-bold rounded-lg hover:opacity-90 disabled:opacity-50"
                    >
                      {isSubmittingMod ? 'Assigning...' : 'Assign Moderator'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* 3.5 PENDING POSTS QUEUE TAB */}
          {activeTab === 'queue' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-primary uppercase tracking-wider">Posts Pending Approval</h3>
                  <p className="text-xs text-secondary mt-0.5">Review and approve posts submitted by members before they appear in the community feed.</p>
                </div>
                <span className="text-xs font-mono text-accent font-bold">{pendingPosts.length} pending</span>
              </div>

              {pendingPosts.length === 0 ? (
                <div className="py-12 text-center text-xs text-secondary bg-background/40 rounded-xl border border-border/40">
                  No posts currently awaiting approval.
                </div>
              ) : (
                <div className="space-y-3">
                  {pendingPosts.map((post) => (
                    <div key={post.id} className="p-4 rounded-xl bg-background/60 border border-border space-y-3">
                      <div className="flex justify-between items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-xs font-bold text-accent uppercase tracking-wider">
                              {post.imageUrl && post.imageUrl !== 'text://post' ? 'Media Post' : 'Discussion'}
                            </span>
                            <span className="text-xs text-secondary">·</span>
                            <span className="text-xs text-secondary font-medium">By @{post.uploaderName}</span>
                            <span className="text-xs text-secondary">·</span>
                            <span className="text-[10px] text-secondary font-mono">{new Date(post.uploadedAt).toLocaleString()}</span>
                          </div>
                          {post.title && <h4 className="text-sm font-bold text-primary">{post.title}</h4>}
                          {post.description && (
                            <p className="text-xs text-neutral-300 mt-1 line-clamp-3 whitespace-pre-line">{post.description}</p>
                          )}
                          {post.imageUrl && post.imageUrl !== 'text://post' && (
                            <div className="mt-2.5 max-w-xs rounded-lg overflow-hidden border border-border">
                              <img src={post.imageUrl} alt={post.title || 'Pending upload'} className="max-h-40 object-cover" />
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => handleRejectPost(post.id)}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/40 transition-colors"
                          >
                            Reject
                          </button>
                          <button
                            onClick={() => handleApprovePost(post.id)}
                            className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-accent text-surface hover:opacity-90 transition-opacity"
                          >
                            Approve
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* JOIN REQUESTS TAB (Private Communities) */}
          {activeTab === 'requests' && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-primary uppercase tracking-wider">Join Requests & Invites</h3>
                  <p className="text-xs text-secondary mt-0.5">Manage access requests from prospective members and directly invite users.</p>
                </div>
                <span className="text-xs font-mono text-accent font-bold">{requests.length} pending</span>
              </div>

              {/* Direct Invite / Add Member Form */}
              <form onSubmit={handleInviteUser} className="p-4 rounded-xl bg-background/80 border border-border space-y-3">
                <h4 className="text-xs font-bold text-primary uppercase tracking-wider">Invite or Add Member</h4>
                <p className="text-xs text-secondary">Instantly approve and add a user to this community by username or UID.</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={inviteUsername}
                    onChange={(e) => setInviteUsername(e.target.value)}
                    placeholder="Enter @username or user UID"
                    className="flex-1 px-3.5 py-2 rounded-xl bg-background border border-border text-xs text-primary placeholder-secondary focus:border-accent focus:outline-none"
                    required
                  />
                  <button
                    type="submit"
                    disabled={isInviting || !inviteUsername.trim()}
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-accent text-surface hover:opacity-90 disabled:opacity-50 transition-opacity whitespace-nowrap"
                  >
                    {isInviting ? 'Inviting...' : 'Add Member'}
                  </button>
                </div>
              </form>

              {/* Pending Requests List */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-secondary uppercase tracking-wider">Pending Join Requests</h4>
                {requests.length === 0 ? (
                  <div className="py-10 text-center text-xs text-secondary bg-background/40 rounded-xl border border-border/40">
                    No pending join requests.
                  </div>
                ) : (
                  requests.map((req) => (
                    <div key={req.id || req.uid} className="p-3.5 rounded-xl bg-background/60 border border-border flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-full bg-accent/20 text-accent font-bold flex items-center justify-center text-xs overflow-hidden shrink-0 border border-border">
                          {req.photo_url ? (
                            <img src={req.photo_url} alt={req.name || 'User'} className="w-full h-full object-cover" />
                          ) : (
                            (req.name || 'U').charAt(0).toUpperCase()
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-primary truncate">@{req.name || req.uid}</p>
                          {req.message && (
                            <p className="text-xs text-secondary italic truncate mt-0.5">"{req.message}"</p>
                          )}
                          <span className="text-[10px] text-secondary font-mono">
                            Requested {new Date(req.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleRejectRequest(req.uid)}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 transition-colors"
                        >
                          Reject
                        </button>
                        <button
                          type="button"
                          onClick={() => handleApproveRequest(req.uid)}
                          className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-accent text-surface hover:opacity-90 transition-opacity"
                        >
                          Approve
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* 4. REPORTS QUEUE TAB */}
          {activeTab === 'reports' && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-primary uppercase tracking-wider mb-2">Reported Content Queue</h3>
              {reports.length === 0 ? (
                <div className="py-12 text-center text-xs text-secondary">
                  Queue is clear. No pending reports in this community.
                </div>
              ) : (
                reports.map((report) => (
                  <div key={report.id} className="p-4 rounded-xl bg-background/60 border border-border space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-xs font-bold text-accent uppercase tracking-wider mr-2">[{report.target_type}]</span>
                        <span className="text-xs text-secondary font-mono">ID: {report.target_id}</span>
                        <p className="text-sm font-medium text-primary mt-1">Reason: {report.reason}</p>
                      </div>
                      <span className="text-[10px] text-secondary font-mono">
                        {new Date(report.created_at).toLocaleDateString()}
                      </span>
                    </div>

                    <div className="flex justify-end gap-2 pt-2 border-t border-border/40">
                      <button
                        onClick={() => handleReportAction(report.id, 'dismiss')}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-surface hover:bg-border/60 text-secondary border border-border"
                      >
                        Dismiss Report
                      </button>
                      <button
                        onClick={() => handleReportAction(report.id, 'approve')}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/40"
                      >
                        Approve (Remove Content)
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* 5. BANS TAB */}
          {activeTab === 'bans' && (
            <div className="space-y-6">
              <form onSubmit={handleBanSubmit} className="p-4 rounded-xl bg-background/80 border border-border space-y-3">
                <h4 className="text-xs font-bold text-primary uppercase tracking-wider">Issue Member Ban</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-semibold text-secondary mb-1">Target User UID</label>
                    <input
                      type="text"
                      value={banTargetUid}
                      onChange={e => setBanTargetUid(e.target.value)}
                      placeholder="User UID to ban"
                      required
                      className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-xs text-primary focus:outline-none focus:border-accent"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-secondary mb-1">Duration</label>
                    <select
                      value={banDuration}
                      onChange={e => setBanDuration(e.target.value)}
                      className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-xs text-primary focus:outline-none focus:border-accent"
                    >
                      <option value="1">1 Day</option>
                      <option value="3">3 Days</option>
                      <option value="7">7 Days</option>
                      <option value="30">30 Days</option>
                      <option value="perm">Permanent</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-secondary mb-1">Reason for Ban</label>
                  <input
                    type="text"
                    value={banReason}
                    onChange={e => setBanReason(e.target.value)}
                    placeholder="Rule violation details"
                    required
                    className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-xs text-primary focus:outline-none focus:border-accent"
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    type="submit"
                    className="px-4 py-2 bg-red-500/80 hover:bg-red-500 text-white font-bold text-xs rounded-lg shadow-md"
                  >
                    Ban User
                  </button>
                </div>
              </form>

              <div>
                <h4 className="text-xs font-bold text-primary uppercase tracking-wider mb-2">Banned Users ({bans.length})</h4>
                {bans.length === 0 ? (
                  <p className="text-xs text-secondary italic">No users currently banned in this community.</p>
                ) : (
                  <div className="space-y-2">
                    {bans.map((ban) => (
                      <div key={ban.id} className="flex justify-between items-center p-3 rounded-xl bg-background/50 border border-border text-xs">
                        <div>
                          <p className="font-semibold text-primary">{ban.user_name || ban.uid}</p>
                          <p className="text-secondary text-[11px]">{ban.reason} &bull; {ban.expires_at ? `Expires: ${new Date(ban.expires_at).toLocaleDateString()}` : 'Permanent'}</p>
                        </div>
                        <button
                          onClick={() => handleUnban(ban.uid)}
                          className="px-3 py-1 bg-surface hover:bg-border/60 text-secondary border border-border rounded-lg text-[11px]"
                        >
                          Unban
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 6. AUTOMOD TAB */}
          {activeTab === 'automod' && (
            <form onSubmit={handleSaveAutomod} className="space-y-5 max-w-xl">
              <div>
                <h3 className="text-sm font-bold text-primary uppercase tracking-wider mb-1">Automated Moderation</h3>
                <p className="text-xs text-secondary mb-4">Set prohibited words and upload restrictions for this community.</p>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-secondary mb-1">Banned Keywords (Comma Separated)</label>
                    <textarea
                      value={bannedWordsText}
                      onChange={e => setBannedWordsText(e.target.value)}
                      rows={3}
                      placeholder="spam, crypto, abuse"
                      className="w-full px-3 py-2 bg-background border border-border rounded-xl text-xs text-primary focus:outline-none focus:border-accent"
                    />
                    <p className="text-[10px] text-secondary mt-1">Posts containing these keywords will automatically be held for review.</p>
                  </div>

                  <div
                    onClick={() => setRequireApproval(!requireApproval)}
                    className="flex items-center justify-between p-3.5 rounded-xl bg-surface/80 border border-border/80 cursor-pointer active:scale-[0.99] transition-all min-h-[48px] select-none"
                  >
                    <div className="flex flex-col pr-3">
                      <span className="text-sm font-semibold text-primary">Require Moderator Approval</span>
                      <span className="text-xs text-secondary">New posts will be held in queue until approved by a moderator</span>
                    </div>
                    <div className={`w-12 h-7 rounded-full p-0.5 transition-colors duration-200 ease-in-out shrink-0 ${requireApproval ? 'bg-accent' : 'bg-white/10'}`}>
                      <div className={`w-6 h-6 rounded-full bg-white shadow-md transform transition-transform duration-200 ease-in-out ${requireApproval ? 'translate-x-5' : 'translate-x-0'}`} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSavingAutomod}
                  className="px-5 py-2.5 bg-accent text-surface font-bold rounded-xl text-xs hover:opacity-90 disabled:opacity-50"
                >
                  {isSavingAutomod ? 'Saving...' : 'Save Automod Configuration'}
                </button>
              </div>
            </form>
          )}

          {/* 7. AUDIT LOG TAB */}
          {activeTab === 'modlog' && (
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-primary uppercase tracking-wider mb-2">Immutable Moderator Audit Log</h3>
              {logs.length === 0 ? (
                <div className="py-12 text-center text-xs text-secondary">
                  No moderation actions logged yet.
                </div>
              ) : (
                logs.map((log) => (
                  <div key={log.id} className="p-3 rounded-xl bg-background/50 border border-border text-xs flex justify-between items-center">
                    <div>
                      <span className="font-bold text-accent uppercase font-mono mr-2">[{log.action}]</span>
                      <span className="text-primary">{log.actor_name || log.actor_uid}</span>
                      {log.reason && <span className="text-secondary ml-1">&bull; {log.reason}</span>}
                    </div>
                    <span className="text-[10px] text-secondary font-mono">
                      {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
