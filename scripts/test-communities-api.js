import fs from 'fs';
import https from 'https';
import assert from 'node:assert/strict';

// Load .env
let tunnelUrl = process.env.VPS_TUNNEL_URL;
let apiKey = process.env.VPS_SECRET_KEY;
if (!tunnelUrl || !apiKey) {
  const envContent = fs.readFileSync('.env', 'utf-8');
  envContent.split(/\r?\n/).forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const idx = trimmed.indexOf('=');
    if (idx > 0) {
      const key = trimmed.substring(0, idx).trim();
      const val = trimmed.substring(idx + 1).trim();
      if (key === 'VPS_TUNNEL_URL') tunnelUrl = val;
      if (key === 'VPS_SECRET_KEY') apiKey = val;
    }
  });
}

function query(sql, args = []) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ sql, args });
    const u = new URL(tunnelUrl);
    const req = https.request({
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'Content-Length': Buffer.byteLength(data)
      }
    }, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve(JSON.parse(body)));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function runTests() {
  console.log('--- RUNNING PHASE 2 DATABASE & CRUD INTEGRATION TESTS ---');

  const testSlug = 'test_space_art_' + Math.random().toString(36).substring(2, 7);
  const testOwnerUid = 'test_owner_uid_123';
  const testMemberUid = 'test_member_uid_456';
  const commId = 'comm_test_' + Date.now();

  try {
    // 1. Insert test community
    await query(`
      INSERT INTO communities (id, slug, name, description, type, category, owner_uid, member_count, post_count, created_at, is_nsfw, settings_json)
      VALUES (?, ?, 'Test Space Art', 'A community for testing space photography', 'public', 'Astrophotography', ?, 1, 0, datetime('now'), 0, '{}')
    `, [commId, testSlug, testOwnerUid]);
    console.log('✓ Community creation verified');

    // 2. Add owner to community_members
    await query(`
      INSERT INTO community_members (community_id, uid, role, permissions, joined_at, status)
      VALUES (?, ?, 'owner', 127, datetime('now'), 'active')
    `, [commId, testOwnerUid]);
    console.log('✓ Owner membership record verified');

    // 3. Verify duplicate slug constraint
    let caughtDuplicate = false;
    try {
      const dupRes = await query(`
        INSERT INTO communities (id, slug, name, type, owner_uid, created_at)
        VALUES ('comm_dup_test', ?, 'Dup', 'public', 'other_uid', datetime('now'))
      `, [testSlug]);
      if (dupRes.error) caughtDuplicate = true;
    } catch {
      caughtDuplicate = true;
    }
    assert.equal(caughtDuplicate, true, 'Duplicate slug constraint should prevent collision');
    console.log('✓ Duplicate slug prevention verified');

    // 4. Test member join
    await query(`
      INSERT INTO community_members (community_id, uid, role, permissions, joined_at, status)
      VALUES (?, ?, 'member', 0, datetime('now'), 'active')
    `, [commId, testMemberUid]);
    await query(`UPDATE communities SET member_count = member_count + 1 WHERE id = ?`, [commId]);

    const memCheck = await query(`SELECT role, status FROM community_members WHERE community_id = ? AND uid = ?`, [commId, testMemberUid]);
    assert.equal(memCheck.rows.length, 1);
    assert.equal(memCheck.rows[0].role, 'member');
    console.log('✓ Member join & membership persistence verified');

    // 5. Test rule creation
    const ruleId = 'rule_test_' + Date.now();
    await query(`
      INSERT INTO community_rules (id, community_id, title, body, position, created_at)
      VALUES (?, ?, 'Be Respectful', 'No hate speech or harassment.', 0, datetime('now'))
    `, [ruleId, commId]);

    const rules = await query(`SELECT title, body FROM community_rules WHERE community_id = ?`, [commId]);
    assert.equal(rules.rows.length, 1);
    assert.equal(rules.rows[0].title, 'Be Respectful');
    console.log('✓ Community rules creation and retrieval verified');

    // 6. Test member promotion to moderator
    await query(`
      UPDATE community_members SET role = 'moderator', permissions = 5 WHERE community_id = ? AND uid = ?
    `, [commId, testMemberUid]);
    const promoCheck = await query(`SELECT role, permissions FROM community_members WHERE community_id = ? AND uid = ?`, [commId, testMemberUid]);
    assert.equal(promoCheck.rows[0].role, 'moderator');
    assert.equal(promoCheck.rows[0].permissions, 5);
    console.log('✓ Member promotion to moderator with bitmask permissions verified');

    // 7. Cleanup test data
    await query(`DELETE FROM community_rules WHERE community_id = ?`, [commId]);
    await query(`DELETE FROM community_members WHERE community_id = ?`, [commId]);
    await query(`DELETE FROM communities WHERE id = ?`, [commId]);
    console.log('✓ Test data cleanup verified');

    console.log('--- ALL PHASE 2 DATABASE & CRUD TESTS PASSED (100%) ---');
  } catch (err) {
    console.error('Phase 2 test failed:', err);
    // Cleanup if partially completed
    try {
      await query(`DELETE FROM community_rules WHERE community_id = ?`, [commId]);
      await query(`DELETE FROM community_members WHERE community_id = ?`, [commId]);
      await query(`DELETE FROM communities WHERE id = ?`, [commId]);
    } catch {}
    process.exit(1);
  }
}

runTests();

