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
    const res = await db.execute("SELECT * FROM images ORDER BY uploadedAt DESC LIMIT 10");
    if (res.rows.length === 0) {
      console.log("No sensitive image matches found in database.");
      return;
    }

    console.log(`Found ${res.rows.length} matching sensitive images in DB:`);
    for (const row of res.rows) {
      console.log("-----------------------------------------");
      console.log("Sensitive Image:");
      console.log("ID:", row.id);
      console.log("Title:", row.title);
      console.log("ImageUrl:", row.imageUrl);
      console.log("Flags (JSON):", row.flags);
    }
    console.log("-----------------------------------------");

    const mistralKey = process.env.MISTRAL_API_KEY;
    if (!mistralKey) {
      console.error("No MISTRAL_API_KEY found!");
      return;
    }

    // Moderate all recent images that are not yet flagged but have explicit descriptions/titles
    for (const row of res.rows) {
      const currentFlags = row.flags ? JSON.parse(row.flags) : [];
      if (currentFlags.includes("Flagged")) {
        console.log(`Skipping already flagged image: ${row.id}`);
        continue;
      }

      console.log(`\nDispatching safety check for unflagged image ${row.id} ("${row.title}")...`);
    const payload = {
      model: "pixtral-12b-2409",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Task: Check if there is unsafe content in the user message (including the uploaded image and its details). Provide a rating of either 'safe' or 'unsafe'. If there is unsafe content, explain why.

Safety Policy Categories:
S1: Violence
S2: Sexual/Explicit/Nudity
S3: Criminal Planning/Illegal activity
S4: Suicide and Self Harm
S5: Hate Speech / Identity Hate
S6: Harassment / Profanity

IMPORTANT PUBLIC GALLERY RULE: Under S2 (Sexual/Explicit/Nudity), you MUST rate any graphic depiction of human genitalia, explicit nudity, or medical/disease conditions of intimate body parts as 'unsafe' (even if presented in an educational or medical context). Glass Gallery is a family-safe public gallery, and raw intimate anatomy must be flagged as 'unsafe'.

FORMAT REQUIREMENT: You MUST start your response with either 'Verdict: safe' or 'Verdict: unsafe' on the very first line.

Title: ${row.title || ""}\nDescription: ${row.description || ""}\nPlease analyze the uploaded image and its title/description for safety. Flag as unsafe if it contains inappropriate content.

Is this content safe or unsafe?`
            },
            {
              type: "image_url",
              image_url: {
                url: row.imageUrl
              }
            }
          ]
        }
      ],
      max_tokens: 512,
      temperature: 0.20,
      top_p: 0.70
    };

    const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${mistralKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    console.log("Response status:", response.status);
    const data = await response.json();
    console.log("Response JSON:", JSON.stringify(data, null, 2));

    const resultText = data.choices?.[0]?.message?.content || "";
    const normalizedText = resultText.toLowerCase().trim();
    const firstLine = normalizedText.split("\n")[0];
    const isUnsafe = firstLine.includes("unsafe") || 
                     normalizedText.startsWith("unsafe") || 
                     normalizedText.includes("verdict: unsafe") ||
                     (normalizedText.includes("rating: unsafe"));

    if (isUnsafe) {
      console.log(`\n🚨 Image ${row.id} classified as UNSAFE! Retroactively flagging in DB...`);

      const currentFlags = row.flags ? JSON.parse(row.flags) : [];
      if (!currentFlags.includes("Flagged")) {
        const updatedFlags = [...currentFlags, "Flagged"];
        await db.execute({
          sql: "UPDATE images SET flags = ? WHERE id = ?",
          args: [JSON.stringify(updatedFlags), row.id]
        });
        console.log("✓ Successfully flagged image in Turso database.");

        // Create notification
        const notifId = 'notif_' + Math.random().toString(36).substring(2, 15);
        const createdAt = new Date().toISOString();
        await db.execute({
          sql: `INSERT INTO notifications (id, recipientUid, actorUid, actorName, actorPhotoURL, type, imageId, imageUrl, createdAt, read)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
          args: [notifId, row.uploaderUid, 'system', 'System Moderator', '', 'flagged', row.id, row.imageUrl, createdAt]
        });
        console.log("✓ Pushed system notification to uploader:", row.uploaderUid);
      } else {
        console.log("Image is already flagged.");
      }
    } else {
      console.log("\n✓ Image is classified as SAFE.");
    }
  }
} catch (err) {
    console.error("Error running test:", err);
  } finally {
    db.close();
  }
}

run();
