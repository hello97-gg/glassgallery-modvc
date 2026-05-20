import fs from 'fs';
import { createClient } from '@libsql/client';

// Load env variables
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
  console.log("✓ Loaded environment variables.");
} catch (err) {
  console.error("Could not read .env file:", err.message);
}

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN
});

async function run() {
  try {
    console.log("Adding 'aiConcepts' column to 'images' table...");
    await db.execute("ALTER TABLE images ADD COLUMN aiConcepts TEXT");
    console.log("✓ Successfully added 'aiConcepts' column!");
  } catch (err) {
    if (err.message.includes("duplicate column name") || err.message.includes("already exists")) {
      console.log("✓ 'aiConcepts' column already exists in 'images' table.");
    } else {
      console.error("Failed to alter table:", err.message);
    }
  }
}

run();
