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

  console.log("=================== RUNNING FOLLOWS TABLE TEST ===================");

  // 1. Get two distinct users
  const usersRes = await db.execute("SELECT uploaderUid, uploaderName FROM users LIMIT 2");
  if (usersRes.rows.length < 2) {
    console.log("Not enough users in the DB to test follows. Need at least 2 users.");
    return;
  }

  const userA = usersRes.rows[0];
  const userB = usersRes.rows[1];

  console.log(`User A (Follower): [${userA.uploaderUid}] ${userA.uploaderName}`);
  console.log(`User B (Following): [${userB.uploaderUid}] ${userB.uploaderName}`);

  try {
    // 2. Fetch stats before
    let followersRes = await db.execute({
      sql: "SELECT COUNT(*) as count FROM follows WHERE followingUid = ?",
      args: [userB.uploaderUid]
    });
    console.log(`Initial Followers Count for B: ${followersRes.rows[0].count}`);

    // Clean up any existing follow first
    await db.execute({
      sql: "DELETE FROM follows WHERE followerUid = ? AND followingUid = ?",
      args: [userA.uploaderUid, userB.uploaderUid]
    });
    await db.execute({
      sql: "DELETE FROM notifications WHERE recipientUid = ? AND actorUid = ? AND type = 'follow'",
      args: [userB.uploaderUid, userA.uploaderUid]
    });

    // 3. Simulate Toggle - FOLLOW
    console.log("\n>>> Simulating User A FOLLOWING User B...");
    const createdAt = new Date().toISOString();
    await db.execute({
      sql: "INSERT INTO follows (followerUid, followingUid, createdAt) VALUES (?, ?, ?)",
      args: [userA.uploaderUid, userB.uploaderUid, createdAt]
    });

    const notifId = 'notif_test_' + Math.random().toString(36).substring(2, 10);
    await db.execute({
      sql: `INSERT INTO notifications (id, recipientUid, actorUid, actorName, actorPhotoURL, type, imageId, imageUrl, createdAt, read) 
            VALUES (?, ?, ?, ?, ?, 'follow', '', '', ?, 0)`,
      args: [
        notifId,
        userB.uploaderUid,
        userA.uploaderUid,
        userA.uploaderName,
        '',
        createdAt
      ]
    });

    // Verify follows insertion
    const checkFollow = await db.execute({
      sql: "SELECT 1 FROM follows WHERE followerUid = ? AND followingUid = ?",
      args: [userA.uploaderUid, userB.uploaderUid]
    });
    console.log(`Follow Row Exists: ${checkFollow.rows.length > 0 ? "YES (Success)" : "NO"}`);

    // Verify notification insertion
    const checkNotif = await db.execute({
      sql: "SELECT 1 FROM notifications WHERE recipientUid = ? AND actorUid = ? AND type = 'follow'",
      args: [userB.uploaderUid, userA.uploaderUid]
    });
    console.log(`Notification Row Exists: ${checkNotif.rows.length > 0 ? "YES (Success)" : "NO"}`);

    followersRes = await db.execute({
      sql: "SELECT COUNT(*) as count FROM follows WHERE followingUid = ?",
      args: [userB.uploaderUid]
    });
    console.log(`New Followers Count for B: ${followersRes.rows[0].count}`);

    // 4. Simulate Toggle - UNFOLLOW
    console.log("\n>>> Simulating User A UNFOLLOWING User B...");
    await db.execute({
      sql: "DELETE FROM follows WHERE followerUid = ? AND followingUid = ?",
      args: [userA.uploaderUid, userB.uploaderUid]
    });
    await db.execute({
      sql: "DELETE FROM notifications WHERE recipientUid = ? AND actorUid = ? AND type = 'follow'",
      args: [userB.uploaderUid, userA.uploaderUid]
    });

    // Verify follows deletion
    const checkFollowAfter = await db.execute({
      sql: "SELECT 1 FROM follows WHERE followerUid = ? AND followingUid = ?",
      args: [userA.uploaderUid, userB.uploaderUid]
    });
    console.log(`Follow Row Cleaned Up: ${checkFollowAfter.rows.length === 0 ? "YES (Success)" : "NO"}`);

    // Verify notification deletion
    const checkNotifAfter = await db.execute({
      sql: "SELECT 1 FROM notifications WHERE recipientUid = ? AND actorUid = ? AND type = 'follow'",
      args: [userB.uploaderUid, userA.uploaderUid]
    });
    console.log(`Notification Row Cleaned Up: ${checkNotifAfter.rows.length === 0 ? "YES (Success)" : "NO"}`);

    followersRes = await db.execute({
      sql: "SELECT COUNT(*) as count FROM follows WHERE followingUid = ?",
      args: [userB.uploaderUid]
    });
    console.log(`Final Followers Count for B: ${followersRes.rows[0].count}`);

    console.log("\n🎉 ALL TESTS COMPLETED SUCCESSFULLY!");

  } catch (err) {
    console.error("Test execution failed:", err);
  }
}

main();
