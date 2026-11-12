import assert from 'node:assert/strict';
import {
  CommunityRoles,
  ModPermissions,
  RoleRank,
  isPlatformAdmin,
  hasPermission,
  canActOnUser,
  parsePermissions,
  combinePermissions,
  validateSlug,
  canViewCommunity,
  canPostInCommunity
} from '../functions/api/lib/communityPermissions.js';

console.log('--- RUNNING COMMUNITY PERMISSIONS UNIT TESTS ---');

// 1. Bitmask & Permission parsing
{
  const fullMask = ModPermissions.ALL;
  const parsedFull = parsePermissions(fullMask);
  assert.equal(parsedFull.manage_posts, true);
  assert.equal(parsedFull.manage_comments, true);
  assert.equal(parsedFull.manage_members, true);
  assert.equal(parsedFull.ban_users, true);
  assert.equal(parsedFull.manage_rules_settings, true);
  assert.equal(parsedFull.manage_mods, true);
  assert.equal(parsedFull.view_mod_log, true);

  const partialMask = combinePermissions({ manage_posts: true, ban_users: true });
  assert.equal(partialMask, ModPermissions.MANAGE_POSTS | ModPermissions.BAN_USERS);
  const parsedPartial = parsePermissions(partialMask);
  assert.equal(parsedPartial.manage_posts, true);
  assert.equal(parsedPartial.ban_users, true);
  assert.equal(parsedPartial.manage_comments, false);
  assert.equal(parsedPartial.manage_mods, false);

  console.log('✓ Bitmask packing and unpacking verified');
}

// 2. hasPermission hierarchy
{
  // Owner has all permissions regardless of stored mask
  assert.equal(hasPermission(CommunityRoles.OWNER, 0, ModPermissions.MANAGE_POSTS), true);
  assert.equal(hasPermission(CommunityRoles.OWNER, 0, ModPermissions.MANAGE_MODS), true);

  // Moderator requires matching bit
  const modMask = ModPermissions.MANAGE_POSTS | ModPermissions.VIEW_MOD_LOG;
  assert.equal(hasPermission(CommunityRoles.MODERATOR, modMask, ModPermissions.MANAGE_POSTS), true);
  assert.equal(hasPermission(CommunityRoles.MODERATOR, modMask, ModPermissions.VIEW_MOD_LOG), true);
  assert.equal(hasPermission(CommunityRoles.MODERATOR, modMask, ModPermissions.BAN_USERS), false);
  assert.equal(hasPermission(CommunityRoles.MODERATOR, modMask, ModPermissions.MANAGE_MODS), false);

  // Approved and regular members never have mod permissions
  assert.equal(hasPermission(CommunityRoles.APPROVED, ModPermissions.ALL, ModPermissions.MANAGE_POSTS), false);
  assert.equal(hasPermission(CommunityRoles.MEMBER, ModPermissions.ALL, ModPermissions.MANAGE_POSTS), false);
  assert.equal(hasPermission(CommunityRoles.BANNED, ModPermissions.ALL, ModPermissions.MANAGE_POSTS), false);

  // Platform admin bypass
  const adminUid = 'i6yimUiehtQDt8M7Et2ERCA50B02';
  assert.equal(hasPermission(CommunityRoles.MEMBER, 0, ModPermissions.MANAGE_MODS, adminUid), true);

  console.log('✓ hasPermission authorization matrix verified');
}

// 3. canActOnUser rank escalation checks
{
  // Owner can act on anyone below
  assert.equal(canActOnUser(CommunityRoles.OWNER, CommunityRoles.MODERATOR), true);
  assert.equal(canActOnUser(CommunityRoles.OWNER, CommunityRoles.APPROVED), true);
  assert.equal(canActOnUser(CommunityRoles.OWNER, CommunityRoles.MEMBER), true);
  assert.equal(canActOnUser(CommunityRoles.OWNER, CommunityRoles.BANNED), true);

  // Moderator can act on members and below, but NOT on other moderators or owner
  assert.equal(canActOnUser(CommunityRoles.MODERATOR, CommunityRoles.OWNER), false);
  assert.equal(canActOnUser(CommunityRoles.MODERATOR, CommunityRoles.MODERATOR), false);
  assert.equal(canActOnUser(CommunityRoles.MODERATOR, CommunityRoles.APPROVED), true);
  assert.equal(canActOnUser(CommunityRoles.MODERATOR, CommunityRoles.MEMBER), true);

  // Regular members cannot act on anyone
  assert.equal(canActOnUser(CommunityRoles.MEMBER, CommunityRoles.MEMBER), false);
  assert.equal(canActOnUser(CommunityRoles.MEMBER, CommunityRoles.BANNED), false);

  // Nobody can act on an owner
  assert.equal(canActOnUser(CommunityRoles.MODERATOR, CommunityRoles.OWNER), false);

  // Cannot act on oneself
  assert.equal(canActOnUser(CommunityRoles.OWNER, CommunityRoles.MODERATOR, 'userA', 'userA'), false);

  console.log('✓ canActOnUser rank escalation guards verified');
}

// 4. Slug validation
{
  // Valid slugs
  assert.equal(validateSlug('astrophotography').valid, true);
  assert.equal(validateSlug('deep-space').valid, true);
  assert.equal(validateSlug('anime_art_4k').valid, true);
  assert.equal(validateSlug('c99').valid, true);

  // Invalid length
  assert.equal(validateSlug('ab').valid, false);
  assert.equal(validateSlug('a'.repeat(31)).valid, false);

  // Invalid characters / structure
  assert.equal(validateSlug('-space').valid, false);
  assert.equal(validateSlug('space-').valid, false);
  assert.equal(validateSlug('space art').valid, false);
  assert.equal(validateSlug('space@art').valid, false);

  // Reserved routes
  assert.equal(validateSlug('api').valid, false);
  assert.equal(validateSlug('admin').valid, false);
  assert.equal(validateSlug('gallery').valid, false);
  assert.equal(validateSlug('reels').valid, false);
  assert.equal(validateSlug('communities').valid, false);

  console.log('✓ Slug validation and reserved keyword defense verified');
}

// 5. Visibility and Posting rules
{
  // Viewing
  assert.equal(canViewCommunity('public', CommunityRoles.MEMBER), true);
  assert.equal(canViewCommunity('public', CommunityRoles.NONE), true);
  assert.equal(canViewCommunity('restricted', CommunityRoles.NONE), true);
  assert.equal(canViewCommunity('private', CommunityRoles.MEMBER), true);
  assert.equal(canViewCommunity('private', CommunityRoles.NONE), false);
  assert.equal(canViewCommunity('private', CommunityRoles.BANNED, true), false);
  assert.equal(canViewCommunity('private', CommunityRoles.NONE, false, 'i6yimUiehtQDt8M7Et2ERCA50B02'), true);

  // Posting
  assert.equal(canPostInCommunity('public', CommunityRoles.NONE), true);
  assert.equal(canPostInCommunity('public', CommunityRoles.MEMBER), true);
  assert.equal(canPostInCommunity('public', CommunityRoles.MEMBER, true), false); // banned
  assert.equal(canPostInCommunity('public', CommunityRoles.MEMBER, false, true), false); // muted

  // Restricted posting: only approved, mod, owner
  assert.equal(canPostInCommunity('restricted', CommunityRoles.MEMBER), false);
  assert.equal(canPostInCommunity('restricted', CommunityRoles.APPROVED), true);
  assert.equal(canPostInCommunity('restricted', CommunityRoles.MODERATOR), true);
  assert.equal(canPostInCommunity('restricted', CommunityRoles.OWNER), true);

  // Private posting: must be member or above
  assert.equal(canPostInCommunity('private', CommunityRoles.NONE), false);
  assert.equal(canPostInCommunity('private', CommunityRoles.MEMBER), true);

  console.log('✓ Community view & post access matrix verified');
}

console.log('--- ALL COMMUNITY PERMISSION TESTS PASSED (100%) ---');

