import fs from 'fs';
import { createClient } from '@libsql/client';

// Load env variables manually from .env
try {
  const envFile = fs.readFileSync('.env', 'utf-8');
  envFile.split(/\r?\n/).forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const index = trimmed.indexOf('=');
    if (index > 0) {
      const key = trimmed.substring(0, index).trim();
      const value = trimmed.substring(index + 1).trim();
      process.env[key] = value;
    }
  });
  console.log("✓ Loaded environment variables from .env");
} catch (err) {
  console.error("Could not read .env file:", err.message);
}

if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
  console.error("Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN in process.env / .env");
  process.exit(1);
}

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN
});

async function main() {
  try {
    console.log("Adding comment_likes table...");
    await db.execute(`
      CREATE TABLE IF NOT EXISTS comment_likes (
        commentId TEXT NOT NULL,
        userUid TEXT NOT NULL,
        PRIMARY KEY (commentId, userUid),
        FOREIGN KEY (commentId) REFERENCES comments(id) ON DELETE CASCADE
      );
    `);
    console.log("✓ Table 'comment_likes' created or already exists.");

    console.log("Adding likeCount to comments table...");
    try {
      await db.execute(`ALTER TABLE comments ADD COLUMN likeCount INTEGER DEFAULT 0`);
      console.log("✓ Added 'likeCount' column to 'comments' table.");
    } catch (err) {
      if (err.message.includes("duplicate column name") || err.message.includes("already exists")) {
        console.log("✓ 'likeCount' column already exists in 'comments'.");
      } else {
        console.warn("Failed to alter comments table:", err.message);
      }
    }

    console.log("Adding commentCount to images table...");
    try {
      await db.execute(`ALTER TABLE images ADD COLUMN commentCount INTEGER DEFAULT 0`);
      console.log("✓ Added 'commentCount' column to 'images' table.");
    } catch (err) {
      if (err.message.includes("duplicate column name") || err.message.includes("already exists")) {
        console.log("✓ 'commentCount' column already exists in 'images'.");
      } else {
        console.warn("Failed to alter images table:", err.message);
      }
    }

    console.log("Database schema updates for comment metrics complete!");
  } catch (error) {
    console.error("Failed to update schema in Turso:", error);
    process.exit(1);
  }
}

main();
