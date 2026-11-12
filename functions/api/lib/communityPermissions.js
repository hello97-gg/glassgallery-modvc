/**
 * Community Roles & Granular Permissions Engine
 * Glass Gallery (gg.modvc.org)
 *
 * Implements role hierarchy, bitmask permission calculation, action authorization,
 * platform admin checks, and slug safety validation.
 */

export const CommunityRoles = {
  OWNER: 'owner',
  MODERATOR: 'moderator',
  APPROVED: 'approved',
  MEMBER: 'member',
  BANNED: 'banned',
  NONE: 'none'
};

export const ModPermissions = {
  MANAGE_POSTS:          1 << 0, // 1  - Remove, approve, pin, lock posts
  MANAGE_COMMENTS:       1 << 1, // 2  - Remove, approve comments
  MANAGE_MEMBERS:        1 << 2, // 4  - Approve join requests, mute/unmute members
  BAN_USERS:             1 << 3, // 8  - Issue temp or perm bans with reason
  MANAGE_RULES_SETTINGS: 1 << 4, // 16 - Edit description, rules, automod rules
  MANAGE_MODS:           1 << 5, // 32 - Invite, update permissions, or demote other mods
  VIEW_MOD_LOG:          1 << 6, // 64 - View immutable audit trail
  ALL:                   0x7F    // 127 - All 7 permission bits enabled
};

// Numeric rank for role comparisons (higher can act on lower; equal cannot act on equal)
export const RoleRank = {
  [CommunityRoles.OWNER]: 100,
  [CommunityRoles.MODERATOR]: 50,
  [CommunityRoles.APPROVED]: 20,
  [CommunityRoles.MEMBER]: 10,
  [CommunityRoles.BANNED]: 0,
  [CommunityRoles.NONE]: -1
};

// Known platform superuser UIDs that have global administrative rights
export const PLATFORM_SUPERUSER_UIDS = new Set([
  'i6yimUiehtQDt8M7Et2ERCA50B02', // Modvc / Ashesh
  'H2hysiVMV9ZfbkwWH93trW21dyl1'  // System Admin
]);

/**
 * Check if a user is a platform super-admin (by UID or DB flag)
 */
export function isPlatformAdmin(uid, userRow = null) {
  if (!uid || typeof uid !== 'string') return false;
  if (PLATFORM_SUPERUSER_UIDS.has(uid)) return true;
  if (userRow && parseInt(userRow.isPlatformAdmin || 0) === 1) return true;
  return false;
}

/**
 * Query DB to verify if a user has isPlatformAdmin set in users table
 */
export async function checkUserPlatformAdmin(db, uid) {
  if (!uid || typeof uid !== 'string') return false;
  if (PLATFORM_SUPERUSER_UIDS.has(uid)) return true;
  if (!db) return false;
  try {
    const res = await db.execute({
      sql: "SELECT isPlatformAdmin FROM users WHERE uploaderUid = ? LIMIT 1",
      args: [uid]
    });
    if (res.rows.length > 0) {
      return parseInt(res.rows[0].isPlatformAdmin || 0) === 1;
    }
  } catch (err) {
    console.error("[Permissions] Failed to check isPlatformAdmin from db:", err);
  }
  return false;
}

/**
 * Log a moderation or platform admin action to mod_log
 */
export async function logModAction(db, {
  community_id,
  actor_uid,
  action,
  target_type,
  target_id,
  reason = '',
  metadata = {},
  is_platform_override = false
}) {
  if (!db || !community_id || !actor_uid || !action) return;
  const id = 'ml_' + Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
  const createdAt = new Date().toISOString();
  const metaWithOverride = {
    ...metadata,
    platform_override: is_platform_override ? 1 : 0
  };
  try {
    await db.execute({
      sql: `INSERT INTO mod_log (id, community_id, actor_uid, action, target_type, target_id, reason, metadata_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        id,
        community_id,
        actor_uid,
        action,
        target_type || 'system',
        target_id || '',
        reason || '',
        JSON.stringify(metaWithOverride),
        createdAt
      ]
    });
  } catch (err) {
    console.error("[ModLog] Failed to log mod action:", err);
  }
}

/**
 * Check if an actor can perform an action requiring a specific permission bit
 * @param {string} role - Actor's community role ('owner', 'moderator', etc.)
 * @param {number} permissions - Bitmask integer of moderator permissions
 * @param {number} requiredPermission - ModPermissions bit flag
 * @param {string} [actorUid] - Optional actor UID for platform admin bypass
 */
export function hasPermission(role, permissions = 0, requiredPermission, actorUid = null) {
  if (actorUid && isPlatformAdmin(actorUid)) {
    return true;
  }

  // Owners implicitly have all capabilities
  if (role === CommunityRoles.OWNER) {
    return true;
  }

  // Only moderators and owners hold permission bits
  if (role !== CommunityRoles.MODERATOR) {
    return false;
  }

  const mask = Number(permissions) || 0;
  return (mask & requiredPermission) === requiredPermission;
}

/**
 * Check if an actor can act upon a target user (e.g. ban, mute, demote, kick)
 * Hard Rule: A moderator or owner cannot act on an equal or higher role.
 * Hard Rule: Owner cannot be acted upon by anyone.
 * @param {string} actorRole - Actor's role
 * @param {string} targetRole - Target user's role
 * @param {string} [actorUid] - Optional actor UID
 * @param {string} [targetUid] - Optional target UID
 */
export function canActOnUser(actorRole, targetRole, actorUid = null, targetUid = null) {
  if (actorUid && targetUid && actorUid === targetUid) {
    return false; // Cannot ban/kick/demote oneself through this action
  }

  if (actorUid && isPlatformAdmin(actorUid)) {
    return true;
  }

  // Only owners and moderators have rank authority to act on others
  if (actorRole !== CommunityRoles.OWNER && actorRole !== CommunityRoles.MODERATOR) {
    return false;
  }

  // Owner cannot be targeted by any community action
  if (targetRole === CommunityRoles.OWNER) {
    return false;
  }

  const actorRank = RoleRank[actorRole] ?? -1;
  const targetRank = RoleRank[targetRole] ?? -1;

  // Actor must have strictly higher rank
  return actorRank > targetRank;
}

/**
 * Parse an integer permission bitmask into a descriptive object
 */
export function parsePermissions(mask) {
  const m = Number(mask) || 0;
  return {
    manage_posts: (m & ModPermissions.MANAGE_POSTS) !== 0,
    manage_comments: (m & ModPermissions.MANAGE_COMMENTS) !== 0,
    manage_members: (m & ModPermissions.MANAGE_MEMBERS) !== 0,
    ban_users: (m & ModPermissions.BAN_USERS) !== 0,
    manage_rules_settings: (m & ModPermissions.MANAGE_RULES_SETTINGS) !== 0,
    manage_mods: (m & ModPermissions.MANAGE_MODS) !== 0,
    view_mod_log: (m & ModPermissions.VIEW_MOD_LOG) !== 0
  };
}

/**
 * Combine boolean permission flags into an integer bitmask
 */
export function combinePermissions(flags = {}) {
  let mask = 0;
  if (flags.manage_posts) mask |= ModPermissions.MANAGE_POSTS;
  if (flags.manage_comments) mask |= ModPermissions.MANAGE_COMMENTS;
  if (flags.manage_members) mask |= ModPermissions.MANAGE_MEMBERS;
  if (flags.ban_users) mask |= ModPermissions.BAN_USERS;
  if (flags.manage_rules_settings) mask |= ModPermissions.MANAGE_RULES_SETTINGS;
  if (flags.manage_mods) mask |= ModPermissions.MANAGE_MODS;
  if (flags.view_mod_log) mask |= ModPermissions.VIEW_MOD_LOG;
  return mask;
}

// Reserved slugs that cannot be claimed by communities to avoid routing collisions
export const RESERVED_SLUGS = new Set([
  'admin', 'api', 'app', 'auth', 'c', 'comments', 'communities', 'community',
  'creator', 'dashboard', 'discover', 'download', 'embed', 'events', 'explore',
  'feed', 'gallery', 'help', 'home', 'image', 'images', 'index', 'legal', 'login',
  'mod', 'moderation', 'notifications', 'popular', 'post', 'posts', 'preview',
  'privacy', 'profile', 'reels', 'register', 'root', 'rules', 'sandbox', 'search',
  'settings', 'share', 'sitemap', 'static', 'terms', 'trending', 'upload', 'user', 'users'
]);

/**
 * Validate community slug
 * - 3 to 30 characters
 * - Lowercase alphanumeric and hyphens/underscores (cannot start/end with hyphen/underscore)
 * - Cannot be a reserved route
 */
export function validateSlug(rawSlug) {
  if (!rawSlug || typeof rawSlug !== 'string') {
    return { valid: false, error: "Community slug is required." };
  }

  const slug = rawSlug.trim().toLowerCase();

  if (slug.length < 3) {
    return { valid: false, error: "Community slug must be at least 3 characters." };
  }

  if (slug.length > 30) {
    return { valid: false, error: "Community slug cannot exceed 30 characters." };
  }

  if (!/^[a-z0-9]+([-_][a-z0-9]+)*$/.test(slug)) {
    return { valid: false, error: "Slug must contain only lowercase letters, numbers, hyphens, or underscores, and cannot start or end with a symbol." };
  }

  if (RESERVED_SLUGS.has(slug)) {
    return { valid: false, error: `'${slug}' is a reserved system route and cannot be used.` };
  }

  return { valid: true, slug };
}

/**
 * Determine if a user can view a community's content
 * @param {string} communityType - 'public', 'restricted', 'private'
 * @param {string} userRole - User's role in this community ('owner', 'moderator', 'approved', 'member', 'banned', 'none')
 * @param {boolean} isBanned - Whether user is actively banned
 * @param {string} [actorUid] - User's UID
 */
export function canViewCommunity(communityType, userRole, isBanned = false, actorUid = null) {
  if (actorUid && isPlatformAdmin(actorUid)) {
    return true;
  }

  if (isBanned || userRole === CommunityRoles.BANNED) {
    return communityType !== 'private'; // Banned users cannot view private communities
  }

  if (communityType === 'public' || communityType === 'restricted') {
    return true;
  }

  // Private community: must be at least a member
  return [CommunityRoles.OWNER, CommunityRoles.MODERATOR, CommunityRoles.APPROVED, CommunityRoles.MEMBER].includes(userRole);
}

/**
 * Determine if a user can post in a community
 * @param {string} communityType - 'public', 'restricted', 'private'
 * @param {string} userRole - User's role in this community
 * @param {boolean} isBanned - Whether user is banned
 * @param {boolean} isMuted - Whether user is muted
 * @param {string} [actorUid] - User's UID
 */
export function canPostInCommunity(communityType, userRole, isBanned = false, isMuted = false, actorUid = null) {
  if (actorUid && isPlatformAdmin(actorUid)) {
    return true;
  }

  if (isBanned || isMuted || userRole === CommunityRoles.BANNED) {
    return false;
  }

  if (communityType === 'public') {
    // In public communities, any registered user can post (even non-members)
    return true;
  }

  if (communityType === 'restricted') {
    // In restricted communities, only approved users, moderators, and owners can post
    return [CommunityRoles.OWNER, CommunityRoles.MODERATOR, CommunityRoles.APPROVED].includes(userRole);
  }

  if (communityType === 'private') {
    // In private communities, must be a member or above
    return [CommunityRoles.OWNER, CommunityRoles.MODERATOR, CommunityRoles.APPROVED, CommunityRoles.MEMBER].includes(userRole);
  }

  return false;
}
