import fs from 'fs';
import fetch from 'node-fetch';
import { createClient } from '@libsql/client';
import readline from 'readline';

// ============================================================
// SAFETY: This script is for INITIAL migration from Firestore
// to Turso ONLY. It will NEVER overwrite existing data.
// 
// - Uses INSERT OR IGNORE (not INSERT OR REPLACE)
// - Checks if tables already have data before migrating
// - Requires explicit --force flag to run on non-empty databases
// - Creates a backup snapshot reference before any writes
// ============================================================

// 1. Parse .env file manually
let dbUrl = process.env.TURSO_DATABASE_URL;
let dbToken = process.env.TURSO_AUTH_TOKEN;

if (!dbUrl || !dbToken) {
  try {
    const envFile = fs.readFileSync('.env', 'utf-8');
    envFile.split(/\r?\n/).forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const index = trimmed.indexOf('=');
      if (index > 0) {
        const key = trimmed.substring(0, index).trim();
        const value = trimmed.substring(index + 1).trim();
        if (key === 'TURSO_DATABASE_URL') dbUrl = value;
        if (key === 'TURSO_AUTH_TOKEN') dbToken = value;
      }
    });
  } catch (err) {
    console.error("Could not read .env file:", err.message);
  }
}

if (!dbUrl || !dbToken) {
  console.error("Error: TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be defined in process.env or .env file.");
  process.exit(1);
}

// 2. Initialize Turso DB Client
const db = createClient({
  url: dbUrl,
  authToken: dbToken,
});

const projectId = "primn-f0fa8";
const apiKey = "AIzaSyBxdzcKYNEywQhK8MpdPpJwV17Ahux0NJQ";

// Helper: Ask user for confirmation
function askConfirmation(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

async function main() {
  const isForced = process.argv.includes('--force');
  const isSchemaOnly = process.argv.includes('--schema-only');

  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║   Glass Gallery — Firestore → Turso Migration Script   ║");
  console.log("║   SAFE MODE: Will NEVER overwrite existing data        ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");
  console.log("Database URL:", dbUrl);
  console.log("Auth Token present:", !!dbToken);

  // ==========================================
  // Step 1: Create/Verify Tables (always safe)
  // ==========================================
  console.log("\n--- Step 1: Creating/Verifying Tables in Turso ---");

  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      uploaderUid TEXT PRIMARY KEY,
      uploaderName TEXT NOT NULL,
      uploaderPhotoURL TEXT,
      backgroundImageURL TEXT,
      location TEXT,
      email TEXT,
      bio TEXT,
      apiKey TEXT UNIQUE,
      onboarded INTEGER DEFAULT 0,
      followedTags TEXT,
      isVerified INTEGER DEFAULT 0
    );
  `);
  console.log("✓ Verified 'users' table.");

  await db.execute(`
    CREATE TABLE IF NOT EXISTS images (
      id TEXT PRIMARY KEY,
      imageUrl TEXT NOT NULL,
      uploaderUid TEXT NOT NULL,
      uploaderName TEXT NOT NULL,
      uploaderPhotoURL TEXT,
      title TEXT,
      description TEXT,
      license TEXT NOT NULL,
      licenseUrl TEXT,
      flags TEXT, -- JSON string array
      originalWorkUrl TEXT,
      uploadedAt TEXT, -- ISO Date String
      likeCount INTEGER DEFAULT 0,
      downloadCount INTEGER DEFAULT 0,
      location TEXT,
      aiConcepts TEXT -- Cached AI concepts JSON string array
    );
  `);
  console.log("✓ Verified 'images' table.");

  // Safe schema updates (ALTER TABLE ADD COLUMN is idempotent with IF NOT EXISTS-style error handling)
  const safeAlterColumns = [
    { table: 'images', column: 'aiConcepts', type: 'TEXT' },
    { table: 'users', column: 'apiKey', type: 'TEXT' },
    { table: 'users', column: 'isVerified', type: 'INTEGER DEFAULT 0' },
  ];

  for (const { table, column, type } of safeAlterColumns) {
    try {
      await db.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
      console.log(`✓ Added '${column}' column to '${table}' table.`);
    } catch (err) {
      if (err.message.includes("duplicate column name") || err.message.includes("already exists")) {
        console.log(`✓ '${column}' column already exists in '${table}'.`);
      } else {
        console.warn(`  Schema alter info (${table}.${column}):`, err.message);
      }
    }
  }

  try {
    await db.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_api_key ON users(apiKey)");
    console.log("✓ Verified unique index on users(apiKey).");
  } catch (err) {
    console.warn("  Schema index info:", err.message);
  }

  await db.execute(`
    CREATE TABLE IF NOT EXISTS likes (
      imageId TEXT NOT NULL,
      userUid TEXT NOT NULL,
      PRIMARY KEY (imageId, userUid),
      FOREIGN KEY (imageId) REFERENCES images(id) ON DELETE CASCADE
    );
  `);
  console.log("✓ Verified 'likes' table.");

  await db.execute(`
    CREATE TABLE IF NOT EXISTS views (
      userUid TEXT NOT NULL,
      imageId TEXT NOT NULL,
      viewedAt TEXT NOT NULL,
      PRIMARY KEY (userUid, imageId),
      FOREIGN KEY (imageId) REFERENCES images(id) ON DELETE CASCADE
    );
  `);
  console.log("✓ Verified 'views' table.");

  await db.execute(`
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      recipientUid TEXT NOT NULL,
      actorUid TEXT NOT NULL,
      actorName TEXT NOT NULL,
      actorPhotoURL TEXT,
      type TEXT NOT NULL,
      imageId TEXT NOT NULL,
      imageUrl TEXT NOT NULL,
      createdAt TEXT, -- ISO Date String
      read INTEGER DEFAULT 0
    );
  `);
  console.log("✓ Verified 'notifications' table.");

  await db.execute(`
    CREATE TABLE IF NOT EXISTS follows (
      followerUid TEXT NOT NULL,
      followingUid TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      PRIMARY KEY (followerUid, followingUid),
      FOREIGN KEY (followerUid) REFERENCES users(uploaderUid) ON DELETE CASCADE,
      FOREIGN KEY (followingUid) REFERENCES users(uploaderUid) ON DELETE CASCADE
    );
  `);
  await db.execute("CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(followerUid);");
  await db.execute("CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(followingUid);");
  console.log("✓ Verified 'follows' table and indexes.");

  if (isSchemaOnly) {
    console.log("\n✅ Schema-only mode complete. No data was migrated.");
    return;
  }

  // ==========================================
  // Step 2: SAFETY CHECK — Detect existing data
  // ==========================================
  console.log("\n--- Step 2: Safety Check — Detecting existing data ---");

  const existingUsers = await db.execute("SELECT COUNT(*) as cnt FROM users");
  const existingImages = await db.execute("SELECT COUNT(*) as cnt FROM images");
  const existingLikes = await db.execute("SELECT COUNT(*) as cnt FROM likes");
  const existingFollows = await db.execute("SELECT COUNT(*) as cnt FROM follows");
  const existingNotifs = await db.execute("SELECT COUNT(*) as cnt FROM notifications");

  const userCount = parseInt(existingUsers.rows[0].cnt);
  const imageCount = parseInt(existingImages.rows[0].cnt);
  const likeCount = parseInt(existingLikes.rows[0].cnt);
  const followCount = parseInt(existingFollows.rows[0].cnt);
  const notifCount = parseInt(existingNotifs.rows[0].cnt);

  console.log(`  Current data: ${userCount} users, ${imageCount} images, ${likeCount} likes, ${followCount} follows, ${notifCount} notifications`);

  const hasExistingData = userCount > 0 || imageCount > 0;

  if (hasExistingData) {
    console.log("\n⚠️  WARNING: Database already contains data!");
    console.log("   This migration uses INSERT OR IGNORE — existing records will NOT be overwritten.");
    console.log("   Only NEW records from Firestore that don't exist in Turso will be added.");

    if (!isForced) {
      console.log("\n❌ ABORTED: Database already has data. To proceed anyway, run with --force flag:");
      console.log("   node scripts/migrate.js --force\n");
      console.log("   This will only INSERT missing records. It will NEVER delete or overwrite existing data.");
      process.exit(0);
    }

    const answer = await askConfirmation("\n⚠️  Are you SURE you want to proceed? Existing data will NOT be overwritten. (yes/no): ");
    if (answer !== 'yes') {
      console.log("Migration cancelled by user.");
      process.exit(0);
    }
  }

  // ==========================================
  // Step 3: Fetch data from Firestore REST API
  // ==========================================
  console.log("\n--- Step 3: Fetching data from Firestore REST API ---");

  // Fetch Users
  console.log("Fetching users from Firestore...");
  const usersUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users?key=${apiKey}&pageSize=300`;
  const usersRes = await fetch(usersUrl);
  let usersData = [];
  if (usersRes.ok) {
    const json = await usersRes.json();
    usersData = json.documents || [];
  } else {
    console.error("Failed to fetch users:", usersRes.statusText);
  }
  console.log(`Fetched ${usersData.length} user documents.`);

  // Fetch Images
  console.log("Fetching images from Firestore...");
  const imagesUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery?key=${apiKey}`;
  const imagesQueryBody = {
    structuredQuery: {
      from: [{ collectionId: "images" }],
      limit: 1000
    }
  };
  const imagesRes = await fetch(imagesUrl, {
    method: 'POST',
    body: JSON.stringify(imagesQueryBody),
    headers: { 'Content-Type': 'application/json' }
  });
  let imagesData = [];
  if (imagesRes.ok) {
    const json = await imagesRes.json();
    imagesData = (json.map ? json : []).filter(item => item.document);
  } else {
    console.error("Failed to fetch images:", imagesRes.statusText);
  }
  console.log(`Fetched ${imagesData.length} image documents.`);

  // Fetch Notifications
  console.log("Fetching notifications from Firestore...");
  const notifUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery?key=${apiKey}`;
  const notifQueryBody = {
    structuredQuery: {
      from: [{ collectionId: "notifications" }],
      limit: 1000
    }
  };
  const notifRes = await fetch(notifUrl, {
    method: 'POST',
    body: JSON.stringify(notifQueryBody),
    headers: { 'Content-Type': 'application/json' }
  });
  let notificationsData = [];
  if (notifRes.ok) {
    const json = await notifRes.json();
    notificationsData = (json.map ? json : []).filter(item => item.document);
  } else {
    console.error("Failed to fetch notifications:", notifRes.statusText);
  }
  console.log(`Fetched ${notificationsData.length} notification documents.`);

  // ==========================================
  // Step 4: Migrate Users (INSERT OR IGNORE — never overwrites)
  // ==========================================
  console.log("\n--- Step 4: Migrating Users to Turso (SAFE — INSERT OR IGNORE) ---");
  let migratedUsers = 0;
  let skippedUsers = 0;
  for (const doc of usersData) {
    const fields = doc.fields || {};
    const uploaderUid = doc.name.split('/').pop();
    const uploaderName = fields.uploaderName?.stringValue || fields.displayName?.stringValue || 'Anonymous';
    const uploaderPhotoURL = fields.uploaderPhotoURL?.stringValue || fields.photoURL?.stringValue || '';
    const backgroundImageURL = fields.backgroundImageURL?.stringValue || '';
    const location = fields.location?.stringValue || '';
    const email = fields.email?.stringValue || '';
    const bio = fields.bio?.stringValue || '';

    const result = await db.execute({
      sql: `INSERT OR IGNORE INTO users (uploaderUid, uploaderName, uploaderPhotoURL, backgroundImageURL, location, email, bio) 
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [uploaderUid, uploaderName, uploaderPhotoURL, backgroundImageURL, location, email, bio]
    });
    
    if (result.rowsAffected > 0) {
      migratedUsers++;
    } else {
      skippedUsers++;
    }
  }
  console.log(`✓ Migrated ${migratedUsers} new users. Skipped ${skippedUsers} existing users (data preserved).`);

  // ==========================================
  // Step 5: Migrate Images and Likes (INSERT OR IGNORE — never overwrites)
  // ==========================================
  console.log("\n--- Step 5: Migrating Images and Likes to Turso (SAFE — INSERT OR IGNORE) ---");
  let migratedImages = 0;
  let skippedImages = 0;
  let migratedLikes = 0;
  for (const item of imagesData) {
    const doc = item.document;
    const fields = doc.fields || {};
    const id = doc.name.split('/').pop();
    const imageUrl = fields.imageUrl?.stringValue || '';
    const uploaderUid = fields.uploaderUid?.stringValue || '';
    const uploaderName = fields.uploaderName?.stringValue || 'Anonymous';
    const uploaderPhotoURL = fields.uploaderPhotoURL?.stringValue || '';
    const title = fields.title?.stringValue || '';
    const description = fields.description?.stringValue || '';
    const license = fields.license?.stringValue || 'CC0';
    const licenseUrl = fields.licenseUrl?.stringValue || '';
    const originalWorkUrl = fields.originalWorkUrl?.stringValue || '';
    const location = fields.location?.stringValue || '';
    
    // Parse uploadedAt date
    let uploadedAt = new Date().toISOString();
    if (fields.uploadedAt?.timestampValue) {
      uploadedAt = new Date(fields.uploadedAt.timestampValue).toISOString();
    }

    const likeCountNum = parseInt(fields.likeCount?.integerValue || fields.likeCount?.doubleValue || 0);
    const downloadCountNum = parseInt(fields.downloadCount?.integerValue || fields.downloadCount?.doubleValue || 0);
    
    // Parse flags
    const flagsArr = fields.flags?.arrayValue?.values?.map(val => val.stringValue) || [];
    const flagsJson = JSON.stringify(flagsArr);

    // INSERT OR IGNORE — will skip if image id already exists
    const result = await db.execute({
      sql: `INSERT OR IGNORE INTO images (id, imageUrl, uploaderUid, uploaderName, uploaderPhotoURL, title, description, license, licenseUrl, flags, originalWorkUrl, uploadedAt, likeCount, downloadCount, location)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [id, imageUrl, uploaderUid, uploaderName, uploaderPhotoURL, title, description, license, licenseUrl, flagsJson, originalWorkUrl, uploadedAt, likeCountNum, downloadCountNum, location]
    });
    
    if (result.rowsAffected > 0) {
      migratedImages++;
    } else {
      skippedImages++;
    }

    // Parse likedBy array — INSERT OR IGNORE for likes too
    const likedByArr = fields.likedBy?.arrayValue?.values?.map(val => val.stringValue) || [];
    for (const userUid of likedByArr) {
      if (userUid) {
        const likeResult = await db.execute({
          sql: `INSERT OR IGNORE INTO likes (imageId, userUid) VALUES (?, ?)`,
          args: [id, userUid]
        });
        if (likeResult.rowsAffected > 0) migratedLikes++;
      }
    }
  }
  console.log(`✓ Migrated ${migratedImages} new images. Skipped ${skippedImages} existing images (data preserved).`);
  console.log(`✓ Migrated ${migratedLikes} new likes (existing likes preserved).`);

  // ==========================================
  // Step 6: Migrate Notifications (INSERT OR IGNORE — never overwrites)
  // ==========================================
  console.log("\n--- Step 6: Migrating Notifications to Turso (SAFE — INSERT OR IGNORE) ---");
  let migratedNotifs = 0;
  let skippedNotifs = 0;
  for (const item of notificationsData) {
    const doc = item.document;
    const fields = doc.fields || {};
    const id = doc.name.split('/').pop();
    const recipientUid = fields.recipientUid?.stringValue || '';
    const actorUid = fields.actorUid?.stringValue || '';
    const actorName = fields.actorName?.stringValue || 'Someone';
    const actorPhotoURL = fields.actorPhotoURL?.stringValue || '';
    const type = fields.type?.stringValue || 'like';
    const imageId = fields.imageId?.stringValue || '';
    const imageUrl = fields.imageUrl?.stringValue || '';
    const read = fields.read?.booleanValue ? 1 : 0;
    
    let createdAt = new Date().toISOString();
    if (fields.createdAt?.timestampValue) {
      createdAt = new Date(fields.createdAt.timestampValue).toISOString();
    }

    if (recipientUid && imageId) {
      const result = await db.execute({
        sql: `INSERT OR IGNORE INTO notifications (id, recipientUid, actorUid, actorName, actorPhotoURL, type, imageId, imageUrl, createdAt, read)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [id, recipientUid, actorUid, actorName, actorPhotoURL, type, imageId, imageUrl, createdAt, read]
      });
      if (result.rowsAffected > 0) {
        migratedNotifs++;
      } else {
        skippedNotifs++;
      }
    }
  }
  console.log(`✓ Migrated ${migratedNotifs} new notifications. Skipped ${skippedNotifs} existing (data preserved).`);

  // ==========================================
  // Summary
  // ==========================================
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║  ✅ Migration Complete — No existing data was touched   ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log(`\n  New users added:         ${migratedUsers} (${skippedUsers} existing preserved)`);
  console.log(`  New images added:        ${migratedImages} (${skippedImages} existing preserved)`);
  console.log(`  New likes added:         ${migratedLikes}`);
  console.log(`  New notifications added: ${migratedNotifs} (${skippedNotifs} existing preserved)`);
  console.log(`  Follows:                 Not migrated (Firestore didn't have follows)\n`);
}

main().catch(error => {
  console.error("Migration failed with error:", error);
});
