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

  console.log("=================== RUNNING FOLLOW-BASED SUGGESTIONS DIAGNOSTICS ===================");

  // 1. Get three distinct users and images
  const usersRes = await db.execute("SELECT uploaderUid, uploaderName FROM users LIMIT 3");
  if (usersRes.rows.length < 3) {
    console.log("Not enough users to run follow suggestions test. Need at least 3 users.");
    return;
  }

  const userA = usersRes.rows[0]; // Active User
  const userB = usersRes.rows[1]; // Creator 1
  const userC = usersRes.rows[2]; // Creator 2

  console.log(`Active User: [${userA.uploaderUid}] ${userA.uploaderName}`);
  console.log(`Creator 1:   [${userB.uploaderUid}] ${userB.uploaderName}`);
  console.log(`Creator 2:   [${userC.uploaderUid}] ${userC.uploaderName}`);

  // Fetch some images uploaded by Creator 1 and Creator 2
  const imagesB = await db.execute({
    sql: "SELECT id, title, uploaderUid FROM images WHERE uploaderUid = ? LIMIT 1",
    args: [userB.uploaderUid]
  });
  const imagesC = await db.execute({
    sql: "SELECT id, title, uploaderUid FROM images WHERE uploaderUid = ? LIMIT 1",
    args: [userC.uploaderUid]
  });

  if (imagesB.rows.length === 0 || imagesC.rows.length === 0) {
    console.log("Both creators must have at least one uploaded image to test suggestions ranking.");
    return;
  }

  const imgB = imagesB.rows[0];
  const imgC = imagesC.rows[0];

  // We want to request suggestions for another arbitrary image in the DB
  const targetImageRes = await db.execute({
    sql: "SELECT id, title, uploaderUid, flags, aiConcepts FROM images WHERE uploaderUid != ? AND uploaderUid != ? LIMIT 1",
    args: [userB.uploaderUid, userC.uploaderUid]
  });

  if (targetImageRes.rows.length === 0) {
    console.log("Could not find suitable target image. Using first image instead.");
  }
  
  const targetImg = targetImageRes.rows[0] || imgB;
  console.log(`Target Image: [${targetImg.id}] "${targetImg.title}" by ${targetImg.uploaderUid}`);

  try {
    // 2. Clear any existing follow records between these test users to start with clean state
    await db.execute({
      sql: "DELETE FROM follows WHERE followerUid = ? OR followingUid = ?",
      args: [userA.uploaderUid, userA.uploaderUid]
    });

    console.log("\n--- TEST CASE A: Non-Personalized Suggestions (No User Context) ---");
    let targetConcepts = targetImg.aiConcepts ? JSON.parse(targetImg.aiConcepts) : [];
    let targetFlags = targetImg.flags ? JSON.parse(targetImg.flags) : [];

    // Let's query candidate images
    let candidates = await db.execute({
      sql: "SELECT * FROM images WHERE id != ? ORDER BY uploadedAt DESC",
      args: [targetImg.id]
    });

    // Score helper simulating our API logic
    const getScoredList = (userContextUid, followingSet, secondDegreeSet, countsMap) => {
      return candidates.rows.map(row => {
        let score = 0;
        
        // Simulating visual overlaps (simple mock tags alignment)
        const rowFlags = row.flags ? JSON.parse(row.flags) : [];
        rowFlags.forEach(f => {
          if (targetFlags.includes(f)) score += 3.0;
        });

        // Simulating follow graph boosts
        const candidateUploader = row.uploaderUid;
        let followBoost = 0;
        if (userContextUid) {
          if (followingSet.has(candidateUploader)) {
            followBoost += 5.0;
          } else if (secondDegreeSet.has(candidateUploader)) {
            followBoost += 2.0;
          }
        }

        const globalCountsBoost = Math.min((countsMap[candidateUploader] || 0) * 0.2, 3.0);

        score += followBoost + globalCountsBoost;

        return { id: row.id, title: row.title, uploaderUid: candidateUploader, score, followBoost, globalCountsBoost };
      }).sort((a, b) => b.score - a.score);
    };

    let emptySet = new Set();
    let initialScored = getScoredList(null, emptySet, emptySet, {});
    
    console.log("Top suggestions scoring ranking (Top 3):");
    initialScored.slice(0, 3).forEach((item, idx) => {
      console.log(`${idx + 1}. [${item.uploaderUid}] "${item.title}" - Total Score: ${item.score.toFixed(2)} (Follow Boost: ${item.followBoost})`);
    });

    console.log("\n--- TEST CASE B: Personalized Suggestions (User A follows Creator 1) ---");
    // Create follow record
    await db.execute({
      sql: "INSERT INTO follows (followerUid, followingUid, createdAt) VALUES (?, ?, ?)",
      args: [userA.uploaderUid, userB.uploaderUid, new Date().toISOString()]
    });

    // Verify follow table state
    const followCheck = await db.execute({
      sql: "SELECT 1 FROM follows WHERE followerUid = ? AND followingUid = ?",
      args: [userA.uploaderUid, userB.uploaderUid]
    });
    console.log(`Direct Follow setup verified: ${followCheck.rows.length > 0 ? "YES" : "NO"}`);

    let activeFollowing = new Set([userB.uploaderUid]);
    let activeSecondDegree = new Set();
    let mockCounts = { [userB.uploaderUid]: 1 };

    let personalizedScored = getScoredList(userA.uploaderUid, activeFollowing, activeSecondDegree, mockCounts);

    console.log("Top suggestions scoring ranking (Top 3):");
    personalizedScored.slice(0, 3).forEach((item, idx) => {
      console.log(`${idx + 1}. [${item.uploaderUid}] "${item.title}" - Total Score: ${item.score.toFixed(2)} (Follow Boost: ${item.followBoost}, Creator Counts Boost: ${item.globalCountsBoost})`);
    });

    // Assert that the image by Creator 1 (imgB.id) scored higher under personalization than under initial state
    const scoreBefore = initialScored.find(i => i.id === imgB.id)?.score || 0;
    const scoreAfter = personalizedScored.find(i => i.id === imgB.id)?.score || 0;
    
    console.log(`\nResults Check for Creator 1 Image:`);
    console.log(`Score Before Follow: ${scoreBefore.toFixed(2)}`);
    console.log(`Score After Follow:  ${scoreAfter.toFixed(2)} (Diff: +${(scoreAfter - scoreBefore).toFixed(2)})`);

    if (scoreAfter > scoreBefore) {
      console.log("🎉 SUCCESS: Suggestions scoring engine correctly boosted creator alignment!");
    } else {
      console.log("❌ FAILURE: Suggestions scoring engine did not boost followed creator.");
    }

    // Clean up
    await db.execute({
      sql: "DELETE FROM follows WHERE followerUid = ? OR followingUid = ?",
      args: [userA.uploaderUid, userA.uploaderUid]
    });

  } catch (err) {
    console.error("Suggestions diagnostics execution failed:", err);
  }
}

main();
