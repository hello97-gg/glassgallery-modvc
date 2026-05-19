import fs from "fs";

// Load environment variables manually from .env first
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
} catch (err) {
  console.error("Could not load .env manually:", err.message);
}

async function main() {
  const { db } = await import("../api/lib/turso.js");

  console.log("Adding 'onboarded' column to 'users' table...");

  try {
    await db.execute("ALTER TABLE users ADD COLUMN onboarded INTEGER DEFAULT 0");
    console.log("🎉 Successfully added 'onboarded' column!");
  } catch (err) {
    if (err.message.includes("duplicate column name") || err.message.includes("already exists")) {
      console.log("Column 'onboarded' already exists. Safe to proceed.");
    } else {
      console.error("Failed to alter table:", err);
    }
  }
}

main();
