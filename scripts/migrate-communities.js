import fs from 'fs';
import https from 'https';

// 1. Read .env for VPS credentials
let tunnelUrl = process.env.VPS_TUNNEL_URL;
let apiKey = process.env.VPS_SECRET_KEY;

if (!tunnelUrl || !apiKey) {
  try {
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
  } catch (err) {
    console.error('Error reading .env:', err.message);
  }
}

if (!tunnelUrl || !apiKey) {
  console.error('Missing VPS_TUNNEL_URL or VPS_SECRET_KEY in environment or .env');
  process.exit(1);
}

const parsedUrl = new URL(tunnelUrl);

function executeSql(sql, args = []) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ sql, args });
    const req = https.request({
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 443,
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
          if (!res.statusCode || res.statusCode >= 400 || json.error) {
            reject(new Error(json.error || `HTTP ${res.statusCode}: ${body}`));
          } else {
            resolve(json);
          }
        } catch (e) {
          reject(new Error(`Failed to parse response: ${body}`));
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function runMigration() {
  console.log('--- STARTING IDEMPOTENT COMMUNITY MIGRATIONS ---');
  console.log(`Connecting to SQLite via ${tunnelUrl}...`);

  const tables = [
    // 1. communities
    `CREATE TABLE IF NOT EXISTS communities (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      type TEXT NOT NULL DEFAULT 'public',
      icon_url TEXT,
      banner_url TEXT,
      category TEXT,
      owner_uid TEXT NOT NULL,
      member_count INTEGER NOT NULL DEFAULT 1,
      post_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      is_nsfw INTEGER NOT NULL DEFAULT 0,
      settings_json TEXT NOT NULL DEFAULT '{}'
    );`,

    // 2. community_members
    `CREATE TABLE IF NOT EXISTS community_members (
      community_id TEXT NOT NULL,
      uid TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      permissions INTEGER NOT NULL DEFAULT 0,
      joined_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      PRIMARY KEY (community_id, uid)
    );`,

    // 3. community_rules
    `CREATE TABLE IF NOT EXISTS community_rules (
      id TEXT PRIMARY KEY,
      community_id TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT,
      position INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );`,

    // 4. community_bans
    `CREATE TABLE IF NOT EXISTS community_bans (
      id TEXT PRIMARY KEY,
      community_id TEXT NOT NULL,
      uid TEXT NOT NULL,
      reason TEXT,
      banned_by TEXT NOT NULL,
      expires_at TEXT,
      created_at TEXT NOT NULL
    );`,

    // 5. join_requests
    `CREATE TABLE IF NOT EXISTS join_requests (
      id TEXT PRIMARY KEY,
      community_id TEXT NOT NULL,
      uid TEXT NOT NULL,
      message TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );`,

    // 6. community_invites
    `CREATE TABLE IF NOT EXISTS community_invites (
      id TEXT PRIMARY KEY,
      community_id TEXT NOT NULL,
      code TEXT NOT NULL UNIQUE,
      created_by TEXT NOT NULL,
      expires_at TEXT,
      max_uses INTEGER DEFAULT 0,
      uses INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );`,

    // 7. reports
    `CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      community_id TEXT,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      reporter_uid TEXT NOT NULL,
      reason TEXT NOT NULL,
      details TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      handled_by TEXT,
      created_at TEXT NOT NULL,
      handled_at TEXT
    );`,

    // 8. mod_log (Immutable audit log)
    `CREATE TABLE IF NOT EXISTS mod_log (
      id TEXT PRIMARY KEY,
      community_id TEXT NOT NULL,
      actor_uid TEXT NOT NULL,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      reason TEXT,
      metadata_json TEXT,
      created_at TEXT NOT NULL
    );`,

    // 9. community_embeddings
    `CREATE TABLE IF NOT EXISTS community_embeddings (
      community_id TEXT PRIMARY KEY,
      vector TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );`,

    // 10. community_events
    `CREATE TABLE IF NOT EXISTS community_events (
      id TEXT PRIMARY KEY,
      uid TEXT NOT NULL,
      community_id TEXT NOT NULL,
      event TEXT NOT NULL,
      created_at TEXT NOT NULL
    );`
  ];

  for (const sql of tables) {
    try {
      await executeSql(sql);
      const tableName = sql.match(/CREATE TABLE IF NOT EXISTS ([a-z_]+)/i)?.[1];
      console.log(`✓ Table confirmed: ${tableName}`);
    } catch (err) {
      console.error(`Error creating table:`, err.message);
      throw err;
    }
  }

  // Indexes
  const indexes = [
    `CREATE INDEX IF NOT EXISTS idx_communities_slug ON communities(slug);`,
    `CREATE INDEX IF NOT EXISTS idx_communities_type ON communities(type);`,
    `CREATE INDEX IF NOT EXISTS idx_communities_category ON communities(category);`,
    `CREATE INDEX IF NOT EXISTS idx_members_uid ON community_members(uid);`,
    `CREATE INDEX IF NOT EXISTS idx_members_comm_role ON community_members(community_id, role);`,
    `CREATE INDEX IF NOT EXISTS idx_rules_comm ON community_rules(community_id, position);`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_bans_comm_uid ON community_bans(community_id, uid);`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_join_req_comm_uid ON join_requests(community_id, uid);`,
    `CREATE INDEX IF NOT EXISTS idx_reports_comm_status ON reports(community_id, status);`,
    `CREATE INDEX IF NOT EXISTS idx_modlog_comm_created ON mod_log(community_id, created_at DESC);`,
    `CREATE INDEX IF NOT EXISTS idx_comm_events_uid ON community_events(uid, created_at DESC);`
  ];

  for (const idxSql of indexes) {
    try {
      await executeSql(idxSql);
    } catch (err) {
      console.warn(`Index notice:`, err.message);
    }
  }
  console.log(`✓ All community indices verified.`);

  // Guarded ALTER TABLE for images
  const imageAlterations = [
    { col: 'community_id', type: 'TEXT' },
    { col: 'is_pinned', type: 'INTEGER DEFAULT 0' },
    { col: 'is_locked', type: 'INTEGER DEFAULT 0' },
    { col: 'mod_status', type: "TEXT DEFAULT 'approved'" }
  ];

  for (const alt of imageAlterations) {
    try {
      await executeSql(`ALTER TABLE images ADD COLUMN ${alt.col} ${alt.type};`);
      console.log(`✓ Added column '${alt.col}' to 'images' table.`);
    } catch (err) {
      if (err.message.includes('duplicate column name') || err.message.includes('already exists')) {
        console.log(`✓ Column '${alt.col}' already exists in 'images' table.`);
      } else {
        console.warn(`Notice altering images table for ${alt.col}:`, err.message);
      }
    }
  }

  // Add composite index on images for community feed performance
  try {
    await executeSql(`CREATE INDEX IF NOT EXISTS idx_images_community ON images(community_id, uploadedAt DESC);`);
    console.log(`✓ Verified index idx_images_community on 'images' table.`);
  } catch (err) {
    console.warn(`Notice on images index:`, err.message);
  }

  // Guarded ALTER TABLE for users (isPlatformAdmin)
  try {
    await executeSql(`ALTER TABLE users ADD COLUMN isPlatformAdmin INTEGER DEFAULT 0;`);
    console.log(`✓ Added column 'isPlatformAdmin' to 'users' table.`);
  } catch (err) {
    if (err.message.includes('duplicate column name') || err.message.includes('already exists')) {
      console.log(`✓ Column 'isPlatformAdmin' already exists in 'users' table.`);
    } else {
      console.warn(`Notice altering users table for isPlatformAdmin:`, err.message);
    }
  }

  // Seed platform admin
  try {
    await executeSql(`UPDATE users SET isPlatformAdmin = 1 WHERE uploaderUid = ?;`, ['i6yimUiehtQDt8M7Et2ERCA50B02']);
    console.log(`✓ Verified platform admin seed for i6yimUiehtQDt8M7Et2ERCA50B02`);
  } catch (err) {
    console.warn(`Notice seeding platform admin:`, err.message);
  }

  console.log('--- ALL COMMUNITY MIGRATIONS COMPLETED SUCCESSFULLY ---');
}

runMigration().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});

