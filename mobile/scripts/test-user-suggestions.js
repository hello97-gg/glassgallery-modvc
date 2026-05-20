import fs from "fs";

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
  
  // Find a userUid that exists in the database
  const usersRes = await db.execute("SELECT DISTINCT uploaderUid FROM images WHERE uploaderUid IS NOT NULL LIMIT 3");
  if (usersRes.rows.length === 0) {
    console.log("No users found.");
    return;
  }
  
  const userUid = usersRes.rows[0].uploaderUid;
  console.log(`Testing with userUid: ${userUid}`);
  
  try {
    // 1. Uploads history
    const userUploads = await db.execute({
      sql: "SELECT flags, aiConcepts FROM images WHERE uploaderUid = ?",
      args: [userUid]
    });
    console.log(`Uploads count: ${userUploads.rows.length}`);
    
    // 2. Likes history
    const userLikes = await db.execute({
      sql: "SELECT i.flags, i.aiConcepts FROM likes l JOIN images i ON l.imageId = i.id WHERE l.userUid = ?",
      args: [userUid]
    });
    console.log(`Likes count: ${userLikes.rows.length}`);
    
    // 3. Views history
    const userViews = await db.execute({
      sql: "SELECT i.flags, i.aiConcepts FROM views v JOIN images i ON v.imageId = i.id WHERE v.userUid = ?",
      args: [userUid]
    });
    console.log(`Views count: ${userViews.rows.length}`);
    
  } catch (err) {
    console.error("Database query failed inside Taste Profile:", err);
  }
}

main();
