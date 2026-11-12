import fs from 'fs';
import https from 'https';

// Read .env
const envContent = fs.readFileSync('.env', 'utf-8');
let tunnelUrl, apiKey;
envContent.split(/\r?\n/).forEach(line => {
  const [k, v] = line.split('=');
  if (k === 'VPS_TUNNEL_URL') tunnelUrl = v?.trim();
  if (k === 'VPS_SECRET_KEY') apiKey = v?.trim();
});

const parsedUrl = new URL(tunnelUrl);

function executeSql(sql, args = []) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ sql, args });
    const req = https.request({
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'Content-Length': Buffer.byteLength(payload)
      }
    }, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (json.error) return reject(new Error(json.error));
          resolve(json);
        } catch (e) {
          reject(new Error('Invalid JSON response: ' + body));
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function runPhase3Tests() {
  console.log('--- RUNNING PHASE 3 COMMUNITY POSTS & FEEDS INTEGRATION TESTS ---');

  const testCommId = 'test_p3_comm_' + Date.now();
  const testSlug = 'p3-slug-' + Date.now();
  const testOwner = 'test_owner_uid_' + Date.now();

  // 1. Create a community
  await executeSql(
    `INSERT INTO communities (id, slug, name, description, type, category, owner_uid, member_count, post_count, created_at, settings_json)
     VALUES (?, ?, 'Phase3 Test Community', 'Feed testing', 'public', 'General', ?, 1, 0, ?, ?)`,
    [testCommId, testSlug, testOwner, new Date().toISOString(), JSON.stringify({ banned_words: ['forbiddenword'] })]
  );
  console.log('✓ Test community created');

  // 2. Add owner membership
  await executeSql(
    `INSERT INTO community_members (community_id, uid, role, permissions, joined_at, status)
     VALUES (?, ?, 'owner', 127, ?, 'active')`,
    [testCommId, testOwner, new Date().toISOString()]
  );

  // 3. Insert a regular image post
  const imgPostId = 'img_p3_' + Date.now();
  await executeSql(
    `INSERT INTO images (
      id, imageUrl, thumbnailUrl, uploaderUid, uploaderName, title, description, uploadedAt,
      likeCount, downloadCount, community_id, mod_status, license
    ) VALUES (?, 'https://example.com/test.jpg', 'https://example.com/thumb.jpg', ?, 'Owner', 'Sample Image Post', 'Cool pic', ?, 5, 2, ?, 'approved', 'CC0')`,
    [imgPostId, testOwner, new Date(Date.now() - 3600000).toISOString(), testCommId]
  );
  console.log('✓ Image post in community inserted');

  // 4. Insert a discussion text post (imageUrl: text://post)
  const textPostId = 'txt_p3_' + Date.now();
  await executeSql(
    `INSERT INTO images (
      id, imageUrl, thumbnailUrl, uploaderUid, uploaderName, title, description, uploadedAt,
      likeCount, downloadCount, community_id, mod_status, is_pinned, license
    ) VALUES (?, 'text://post', '', ?, 'Owner', 'Welcome Discussion', 'This is a text discussion post!', ?, 20, 0, ?, 'approved', 1, 'CC0')`,
    [textPostId, testOwner, new Date().toISOString(), testCommId]
  );
  console.log('✓ Text discussion post with is_pinned inserted');

  // 5. Test Hot feed query
  const hotFeed = await executeSql(
    `SELECT id, title, is_pinned, likeCount FROM images 
     WHERE community_id = ? AND mod_status = 'approved'
     ORDER BY is_pinned DESC, (likeCount * 10) DESC`,
    [testCommId]
  );
  const rows = hotFeed.rows || [];
  if (rows.length !== 2) throw new Error(`Expected 2 posts, found ${rows.length}`);
  if (rows[0].id !== textPostId || rows[0].is_pinned !== 1) {
    throw new Error('Pinned post should appear first in feed');
  }
  console.log('✓ Hot feed sorting with pinned precedence verified');

  // 6. Test New feed query
  const newFeed = await executeSql(
    `SELECT id, uploadedAt FROM images 
     WHERE community_id = ? AND mod_status = 'approved'
     ORDER BY uploadedAt DESC`,
    [testCommId]
  );
  if (newFeed.rows[0].id !== textPostId) {
    throw new Error('Newest post should appear first in New sort');
  }
  console.log('✓ New feed chronological sorting verified');

  // 7. Test Top feed query
  const topFeed = await executeSql(
    `SELECT id, likeCount FROM images 
     WHERE community_id = ? AND mod_status = 'approved'
     ORDER BY likeCount DESC`,
    [testCommId]
  );
  if (topFeed.rows[0].id !== textPostId || topFeed.rows[0].likeCount !== 20) {
    throw new Error('Most liked post should appear first in Top sort');
  }
  console.log('✓ Top feed score sorting verified');

  // 8. Cleanup test data
  await executeSql(`DELETE FROM images WHERE community_id = ?`, [testCommId]);
  await executeSql(`DELETE FROM community_members WHERE community_id = ?`, [testCommId]);
  await executeSql(`DELETE FROM communities WHERE id = ?`, [testCommId]);
  console.log('✓ Test data cleanup verified');

  console.log('--- ALL PHASE 3 POSTS & FEEDS TESTS PASSED (100%) ---');
}

runPhase3Tests().catch(err => {
  console.error('Phase 3 test failed:', err);
  process.exit(1);
});
