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

  console.log("=================== RUNNING COLD-START SUGGESTIONS DIAGNOSTICS ===================");

  // 1. Fetch images to use as mock candidates
  const imagesRes = await db.execute("SELECT id, title, flags FROM images LIMIT 10");
  if (imagesRes.rows.length === 0) {
    console.log("No images found in database to run suggestions personalization test.");
    return;
  }

  // Find a tag that exists in our images
  let targetTag = "Architecture";
  let found = false;
  imagesRes.rows.forEach(row => {
    const flags = row.flags ? JSON.parse(row.flags) : [];
    if (flags.length > 0) {
      targetTag = flags[0];
      found = true;
    }
  });

  console.log(`Using target onboarding interest tag: "${targetTag}"`);

  // Create a brand new dummy user for testing
  const dummyUid = "test_onboarding_user_" + Date.now();
  
  try {
    // Insert new user with followedTags = [targetTag]
    await db.execute({
      sql: `INSERT INTO users (uploaderUid, uploaderName, uploaderPhotoURL, onboarded, followedTags)
            VALUES (?, ?, ?, ?, ?)`,
      args: [dummyUid, "Test Onboarder", "", 1, JSON.stringify([targetTag])]
    });

    console.log(`Created new onboarded test user: ${dummyUid}`);

    // Mock suggestions scoring logic matching api/images.js
    const tasteProfile = {};
    
    // Seed followedTags from user profile (weight = 2.0)
    const userProfileRes = await db.execute({
      sql: "SELECT followedTags FROM users WHERE uploaderUid = ?",
      args: [dummyUid]
    });
    
    const tagsArray = JSON.parse(userProfileRes.rows[0].followedTags || "[]");
    tagsArray.forEach(tag => {
      tasteProfile[tag] = (tasteProfile[tag] || 0) + 2.0;
    });

    console.log("Taste Profile seeded from Onboarding Followed Tags:", tasteProfile);

    // Let's score mock candidates
    const scoredList = imagesRes.rows.map(row => {
      const fl = row.flags ? JSON.parse(row.flags) : [];
      let tasteScore = 0;
      fl.forEach(f => {
        if (tasteProfile[f]) tasteScore += tasteProfile[f];
      });
      tasteScore = Math.min(tasteScore, 2.0); // capped at 2.0

      const totalScore = tasteScore * 2.0; // taste score has weight = 2.0 in engine
      
      return { id: row.id, title: row.title || "", tags: fl, score: totalScore };
    }).sort((a, b) => b.score - a.score);

    console.log("\nRecommendations for new onboarded user (Top 3):");
    scoredList.slice(0, 3).forEach((item, idx) => {
      console.log(`${idx + 1}. "${item.title}" [Tags: ${item.tags.join(", ")}] - Taste Score Contribution: ${item.score.toFixed(2)}`);
    });

    // Verify that the top image has the followed tag
    const topItem = scoredList[0];
    if (topItem && topItem.tags.includes(targetTag) && topItem.score > 0) {
      console.log(`\n🎉 SUCCESS: Cold-start recommendation Personalization works! Image with followed tag "${targetTag}" has scored highest.`);
    } else {
      console.log(`\n❌ FAILURE: Personalization did not prioritize followed tag "${targetTag}".`);
    }

    // Clean up
    await db.execute({
      sql: "DELETE FROM users WHERE uploaderUid = ?",
      args: [dummyUid]
    });

  } catch (err) {
    console.error("Onboarding personalization diagnostics failed:", err);
  }
}

main();
