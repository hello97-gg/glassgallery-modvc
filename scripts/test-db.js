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
  try {
    // Dynamic import to ensure process.env variables are loaded beforehand!
    const { db } = await import("../api/lib/turso.js");
    const res = await db.execute("SELECT id, title, flags, aiConcepts, likeCount, downloadCount FROM images");
    console.log(`Found ${res.rows.length} images:`);
    res.rows.forEach(row => {
      console.log(`- [${row.id}] Title: "${row.title}" | Tags: ${row.flags} | AI Concepts: ${row.aiConcepts} | Likes: ${row.likeCount}`);
    });
  } catch (err) {
    console.error("DB Query failed:", err);
  }
}
main();
