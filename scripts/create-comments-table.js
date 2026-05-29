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
    console.log("Creating 'comments' table in Turso database...");
    
    await db.execute(`
      CREATE TABLE IF NOT EXISTS comments (
        id TEXT PRIMARY KEY,
        imageId TEXT NOT NULL,
        userUid TEXT NOT NULL,
        userName TEXT NOT NULL,
        userPhotoURL TEXT,
        content TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        parentId TEXT,
        FOREIGN KEY (imageId) REFERENCES images(id) ON DELETE CASCADE,
        FOREIGN KEY (parentId) REFERENCES comments(id) ON DELETE CASCADE
      );
    `);
    console.log("✓ Table 'comments' created or already exists.");

    console.log("Creating indexes for optimized retrieval...");
    
    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_comments_image ON comments(imageId);
    `);
    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parentId);
    `);
    console.log("✓ Indexes idx_comments_image and idx_comments_parent created successfully.");
    console.log("Database schema setup for nested comments complete!");
  } catch (error) {
    console.error("Failed to set up comments table in Turso:", error);
    process.exit(1);
  }
}

main();
