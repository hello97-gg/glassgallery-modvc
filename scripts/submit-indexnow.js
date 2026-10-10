/**
 * IndexNow Bulk Submission Script for Glass Gallery (gg.modvc.org)
 * Usage: node scripts/submit-indexnow.js
 */

const HOST = 'gg.modvc.org';
const KEY = '0d32f54c5df04186b6b00004c92ae5df';
const KEY_LOCATION = `https://${HOST}/${KEY}.txt`;

async function fetchSitemapUrls() {
  try {
    const res = await fetch(`https://${HOST}/sitemap.xml`);
    if (!res.ok) {
      console.warn(`Sitemap fetch returned ${res.status}`);
      return [];
    }
    const data = await res.text();
    const matches = [...data.matchAll(/<loc>([^<]+)<\/loc>/g)];
    return matches.map(m => m[1].trim());
  } catch (err) {
    console.warn('Could not fetch remote sitemap:', err.message);
    return [];
  }
}

async function submitBatch(batchUrls) {
  const payload = {
    host: HOST,
    key: KEY,
    keyLocation: KEY_LOCATION,
    urlList: batchUrls
  };

  try {
    const res = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8'
      },
      body: JSON.stringify(payload)
    });

    if (res.status === 200 || res.status === 202) {
      return { success: true, status: res.status };
    } else {
      const text = await res.text().catch(() => '');
      return { success: false, status: res.status, error: text };
    }
  } catch (err) {
    return { success: false, status: 500, error: err.message };
  }
}

async function main() {
  console.log('=== Glass Gallery IndexNow Submission ===');
  console.log(`Host:         ${HOST}`);
  console.log(`Key:          ${KEY}`);
  console.log(`Key Location: ${KEY_LOCATION}\n`);

  console.log('Fetching sitemap URLs from production...');
  const sitemapUrls = await fetchSitemapUrls();

  const coreUrls = [
    `https://${HOST}/`,
    `https://${HOST}/gallery`,
    `https://${HOST}/api`,
    `https://${HOST}/legal`
  ];

  const allUrls = Array.from(new Set([...coreUrls, ...sitemapUrls]));
  console.log(`Discovered ${allUrls.length} total URLs to index.\n`);

  if (allUrls.length === 0) {
    console.log('No URLs to submit.');
    return;
  }

  // Submit in batches of 250
  const BATCH_SIZE = 250;
  let totalSuccess = 0;
  const totalBatches = Math.ceil(allUrls.length / BATCH_SIZE);

  for (let i = 0; i < allUrls.length; i += BATCH_SIZE) {
    const batch = allUrls.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    process.stdout.write(`Submitting Batch ${batchNum}/${totalBatches} (${batch.length} URLs)... `);

    const result = await submitBatch(batch);
    if (result.success) {
      totalSuccess += batch.length;
      console.log(`✅ [HTTP ${result.status}] OK`);
    } else {
      console.log(`⚠️ [HTTP ${result.status}]: ${result.error || 'Failed'}`);
    }

    // Small delay between batches
    if (i + BATCH_SIZE < allUrls.length) {
      await new Promise(r => setTimeout(r, 600));
    }
  }

  console.log(`\n=== Done: Successfully submitted ${totalSuccess} / ${allUrls.length} URLs to IndexNow ===`);
}

main();
