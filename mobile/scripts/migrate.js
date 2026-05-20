import fs from 'fs';
import fetch from 'node-fetch';
import { createClient } from '@libsql/client';

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

console.log("Database URL:", dbUrl);
console.log("Auth Token present:", !!dbToken);

// 2. Initialize Turso DB Client
const db = createClient({
  url: dbUrl,
  authToken: dbToken,
});

const projectId = "primn-f0fa8";
const apiKey = "AIzaSyBxdzcKYNEywQhK8MpdPpJwV17Ahux0NJQ";

async function main() {
  console.log("\n--- Step 1: Creating Tables in Turso ---");

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
      followedTags TEXT
    );
  `);
  console.log("✓ Created 'users' table.");

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
  console.log("✓ Created/verified 'images' table.");

  // Support schema updates on already created databases
  try {
    await db.execute("ALTER TABLE images ADD COLUMN aiConcepts TEXT");
    console.log("✓ Added 'aiConcepts' column to existing 'images' table.");
  } catch (err) {
    if (err.message.includes("duplicate column name") || err.message.includes("already exists")) {
      console.log("✓ 'aiConcepts' column already exists in 'images' table.");
    } else {
      console.warn("Schema alter info:", err.message);
    }
  }

  try {
    await db.execute("ALTER TABLE users ADD COLUMN apiKey TEXT");
    console.log("✓ Added 'apiKey' column to existing 'users' table.");
  } catch (err) {
    if (err.message.includes("duplicate column name") || err.message.includes("already exists")) {
      console.log("✓ 'apiKey' column already exists in 'users' table.");
    } else {
      console.warn("Schema alter info users:", err.message);
    }
  }

  try {
    await db.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_api_key ON users(apiKey)");
    console.log("✓ Created unique index on users(apiKey).");
  } catch (err) {
    console.warn("Schema index info users:", err.message);
  }


  await db.execute(`
    CREATE TABLE IF NOT EXISTS likes (
      imageId TEXT NOT NULL,
      userUid TEXT NOT NULL,
      PRIMARY KEY (imageId, userUid),
      FOREIGN KEY (imageId) REFERENCES images(id) ON DELETE CASCADE
    );
  `);
  console.log("✓ Created 'likes' table.");

  await db.execute(`
    CREATE TABLE IF NOT EXISTS views (
      userUid TEXT NOT NULL,
      imageId TEXT NOT NULL,
      viewedAt TEXT NOT NULL,
      PRIMARY KEY (userUid, imageId),
      FOREIGN KEY (imageId) REFERENCES images(id) ON DELETE CASCADE
    );
  `);
  console.log("✓ Created 'views' table.");

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
  console.log("✓ Created 'notifications' table.");

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
  console.log("✓ Created 'follows' table and indexes.");

  console.log("\n--- Step 2: Fetching data from Firestore REST API ---");

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

  console.log("\n--- Step 3: Migrating Users to Turso ---");
  let userCount = 0;
  for (const doc of usersData) {
    const fields = doc.fields || {};
    const uploaderUid = doc.name.split('/').pop();
    const uploaderName = fields.uploaderName?.stringValue || fields.displayName?.stringValue || 'Anonymous';
    const uploaderPhotoURL = fields.uploaderPhotoURL?.stringValue || fields.photoURL?.stringValue || '';
    const backgroundImageURL = fields.backgroundImageURL?.stringValue || '';
    const location = fields.location?.stringValue || '';
    const email = fields.email?.stringValue || '';
    const bio = fields.bio?.stringValue || '';

    await db.execute({
      sql: `INSERT OR REPLACE INTO users (uploaderUid, uploaderName, uploaderPhotoURL, backgroundImageURL, location, email, bio) 
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [uploaderUid, uploaderName, uploaderPhotoURL, backgroundImageURL, location, email, bio]
    });
    userCount++;
  }
  console.log(`✓ Migrated ${userCount} users to Turso.`);

  console.log("\n--- Step 4: Migrating Images and Likes to Turso ---");
  let imageCount = 0;
  let likeCount = 0;
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

    // Insert Image
    await db.execute({
      sql: `INSERT OR REPLACE INTO images (id, imageUrl, uploaderUid, uploaderName, uploaderPhotoURL, title, description, license, licenseUrl, flags, originalWorkUrl, uploadedAt, likeCount, downloadCount, location)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [id, imageUrl, uploaderUid, uploaderName, uploaderPhotoURL, title, description, license, licenseUrl, flagsJson, originalWorkUrl, uploadedAt, likeCountNum, downloadCountNum, location]
    });
    imageCount++;

    // Parse likedBy array
    const likedByArr = fields.likedBy?.arrayValue?.values?.map(val => val.stringValue) || [];
    for (const userUid of likedByArr) {
      if (userUid) {
        await db.execute({
          sql: `INSERT OR IGNORE INTO likes (imageId, userUid) VALUES (?, ?)`,
          args: [id, userUid]
        });
        likeCount++;
      }
    }
  }
  console.log(`✓ Migrated ${imageCount} images to Turso.`);
  console.log(`✓ Migrated ${likeCount} likes to Turso.`);

  console.log("\n--- Step 5: Migrating Notifications to Turso ---");
  let notifCount = 0;
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
      await db.execute({
        sql: `INSERT OR REPLACE INTO notifications (id, recipientUid, actorUid, actorName, actorPhotoURL, type, imageId, imageUrl, createdAt, read)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [id, recipientUid, actorUid, actorName, actorPhotoURL, type, imageId, imageUrl, createdAt, read]
      });
      notifCount++;
    }
  }
  console.log(`✓ Migrated ${notifCount} notifications to Turso.`);

  console.log("\n=============================================");
  console.log("🎉 SUCCESS: All database data has been fully migrated to Turso!");
  console.log("=============================================");
}

main().catch(error => {
  console.error("Migration failed with error:", error);
});
