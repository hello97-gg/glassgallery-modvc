import fs from "fs";
import path from "path";

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

async function testSuggestionsFor(imageId) {
  const { db } = await import("../api/lib/turso.js");

  const targetRes = await db.execute({
    sql: "SELECT * FROM images WHERE id = ?",
    args: [imageId]
  });

  if (targetRes.rows.length === 0) {
    console.log(`Target image ${imageId} not found.`);
    return;
  }

  const target = targetRes.rows[0];
  let targetFlags = target.flags ? JSON.parse(target.flags) : [];
  let targetConcepts = target.aiConcepts ? JSON.parse(target.aiConcepts) : [];

  console.log(`\n=================== SUGGESTIONS FOR [${target.id}] "${target.title}" ===================`);
  console.log(`Target Tags: ${JSON.stringify(targetFlags)}`);
  console.log(`Target Concepts: ${JSON.stringify(targetConcepts)}`);

  const allImagesRes = await db.execute({
    sql: "SELECT * FROM images WHERE id != ? ORDER BY uploadedAt DESC",
    args: [imageId]
  });

  const scoredImages = allImagesRes.rows.map(row => {
    const id = row.id;
    const fl = row.flags ? JSON.parse(row.flags) : [];
    const co = row.aiConcepts ? JSON.parse(row.aiConcepts) : [];

    // Tokenized keyword overlap for AI Concepts
    let conceptOverlap = 0;
    const targetWords = new Set();
    targetConcepts.forEach(c => {
      c.toLowerCase().split(/[\s-_]+/).forEach(w => {
        if (w.length > 3) targetWords.add(w);
      });
    });

    co.forEach(c => {
      let matchedInThisConcept = false;
      c.toLowerCase().split(/[\s-_]+/).forEach(w => {
        if (w.length > 3 && targetWords.has(w)) {
          conceptOverlap += 0.5;
        }
      });
    });

    let tagOverlap = 0;
    fl.forEach(f => {
      if (targetFlags.includes(f)) tagOverlap++;
    });

    let metadataMatch = 0;
    const targetText = `${target.title || ''} ${target.description || ''} ${target.location || ''}`.toLowerCase();
    const candidateText = `${row.title || ''} ${row.description || ''} ${row.location || ''}`.toLowerCase();
    
    const tokens = targetText.split(/\s+/).filter(t => t.length > 3);
    tokens.forEach(tok => {
      if (candidateText.includes(tok)) metadataMatch += 0.5;
    });

    const popularity = (row.likeCount || 0) * 0.1 + (row.downloadCount || 0) * 0.05;
    const totalScore = (conceptOverlap * 4.0) + (tagOverlap * 3.0) + (metadataMatch * 3.0) + popularity;

    return {
      id: row.id,
      title: row.title,
      tags: fl,
      aiConcepts: co,
      score: totalScore,
      overlap: { conceptOverlap, tagOverlap, metadataMatch, popularity }
    };
  });

  scoredImages.sort((a, b) => b.score - a.score);

  console.log("Top 5 Suggestions:");
  scoredImages.slice(0, 5).forEach((item, index) => {
    console.log(`${index + 1}. [${item.id}] "${item.title}" | Score: ${item.score.toFixed(2)} | Overlaps: C=${item.overlap.conceptOverlap}, T=${item.overlap.tagOverlap}, M=${item.overlap.metadataMatch}, Pop=${item.overlap.popularity.toFixed(2)}`);
  });
}

async function main() {
  try {
    // Let's test with 'yxRNyXN9vhNI0aLuqjjw' (Minecraft image)
    await testSuggestionsFor('yxRNyXN9vhNI0aLuqjjw');
  } catch (err) {
    console.error("Test failed:", err);
  }
}
main();
