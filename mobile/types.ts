// Fix: Use Firebase v8 compatibility imports to resolve module errors for Timestamp.
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';

export interface ImageMeta {
  id: string;
  imageUrl: string;
  thumbnailUrl?: string;
  uploaderUid: string;
  uploaderName: string;
  uploaderPhotoURL: string;
  title?: string;
  description?: string;
  tags?: string[];
  license: string;
  licenseUrl?: string;
  flags: string[];
  originalWorkUrl?: string;
  uploadedAt: firebase.firestore.Timestamp;
  likeCount?: number;
  likedBy?: string[];
  downloadCount?: number;
  commentCount?: number;
  viewCount?: number;
  location?: string;
  // Community extensions
  community_id?: string | null;
  community_slug?: string;
  community_name?: string;
  community_icon_url?: string;
  community_owner_uid?: string | null;
  is_owner?: boolean;
  is_mod?: boolean;
  is_pinned?: boolean;
  is_locked?: boolean;
  is_member?: boolean;
  mod_status?: 'approved' | 'pending_approval' | 'removed';
}

export interface License {
  value: string;
  label: string;
  url?: string;
}

export interface ProfileUser {
  uploaderUid: string;
  uploaderName: string;
  uploaderPhotoURL: string;
  backgroundImageURL?: string;
  location?: string;
  email?: string;
  bio?: string;
  onboarded?: boolean;
  followedTags?: string[];
  isVerified?: boolean;
  isPlatformAdmin?: boolean;
  hideReplies?: boolean;
}

export interface Notification {
  id: string;
  recipientUid: string;
  actorUid: string;
  actorName: string;
  actorPhotoURL: string;
  type: 'like' | 'follow' | 'flagged' | 'comment' | 'reply' | 'community_invite' | 'join_request_approved' | 'community_post_pending' | 'community_mod_queue' | 'community_post_approved' | 'community_post_removed' | 'community_ban';
  imageId: string;
  imageUrl: string;
  createdAt: firebase.firestore.Timestamp;
  read: boolean;
}

export interface Comment {
  id: string;
  imageId: string;
  userUid: string;
  userName: string;
  userPhotoURL?: string;
  content: string;
  createdAt: string; // ISO date string
  parentId?: string | null;
  likeCount?: number;
  likedBy?: string[];
  replies?: Comment[]; // Derived tree replies for frontend rendering
  post?: ImageMeta;
}

// --- Community System Interfaces ---

export type CommunityType = 'public' | 'restricted' | 'private';

export type CommunityRole = 'owner' | 'moderator' | 'approved' | 'member' | 'banned' | 'none';

export const ModPermissions = {
  MANAGE_POSTS:          1 << 0, // 1
  MANAGE_COMMENTS:       1 << 1, // 2
  MANAGE_MEMBERS:        1 << 2, // 4
  BAN_USERS:             1 << 3, // 8
  MANAGE_RULES_SETTINGS: 1 << 4, // 16
  MANAGE_MODS:           1 << 5, // 32
  VIEW_MOD_LOG:          1 << 6, // 64
  ALL:                   0x7F    // 127
} as const;

export interface CommunitySettings {
  allow_video_posts?: boolean;
  allow_text_posts?: boolean;
  require_post_approval?: boolean;
  banned_words?: string[];
  primary_color?: string;
  accent_color?: string;
}

export interface Community {
  id: string;
  slug: string;
  name: string;
  description?: string;
  type: CommunityType;
  icon_url?: string;
  banner_url?: string;
  category?: string;
  owner_uid: string;
  owner_name?: string;
  owner_photo_url?: string;
  member_count: number;
  post_count: number;
  created_at: string;
  is_nsfw: boolean;
  settings: CommunitySettings;
  // User's context within community (injected by API)
  userRole?: CommunityRole;
  userPermissions?: number;
  isJoined?: boolean;
  hasPendingJoinRequest?: boolean;
}

export interface CommunityMember {
  community_id: string;
  uid: string;
  role: CommunityRole;
  permissions: number;
  joined_at: string;
  status: 'active' | 'muted' | 'pending';
  // User details joined from users table
  name?: string;
  photo_url?: string;
  bio?: string;
}

export interface CommunityRule {
  id: string;
  community_id: string;
  title: string;
  body?: string;
  position: number;
  created_at: string;
}

export interface CommunityBan {
  id: string;
  community_id: string;
  uid: string;
  reason?: string;
  banned_by: string;
  expires_at?: string | null; // null = permanent
  created_at: string;
  user_name?: string;
}

export interface JoinRequest {
  id: string;
  community_id: string;
  uid: string;
  message?: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  updated_at: string;
  user_name?: string;
  user_photo_url?: string;
}

export interface CommunityInvite {
  id: string;
  community_id: string;
  code: string;
  created_by: string;
  expires_at?: string | null;
  max_uses: number;
  uses: number;
  created_at: string;
}

export interface CommunityReport {
  id: string;
  community_id?: string | null;
  target_type: 'image' | 'comment' | 'user';
  target_id: string;
  reporter_uid: string;
  reason: string;
  details?: string;
  status: 'pending' | 'approved' | 'dismissed';
  handled_by?: string | null;
  created_at: string;
  handled_at?: string | null;
  // Hydrated preview
  target_preview?: any;
  reporter_name?: string;
}

export interface ModLogEntry {
  id: string;
  community_id: string;
  actor_uid: string;
  actor_name?: string;
  action: string;
  target_type: string;
  target_id: string;
  reason?: string;
  metadata?: Record<string, any>;
  created_at: string;
}
