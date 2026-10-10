/**
 * IndexNow Bulk Submission Script for Glass Gallery (gg.modvc.org)
 * Usage: node scripts/submit-indexnow.js
 */

const HOST = 'gg.modvc.org';
const KEY = 'f8a614d9b23c4a8581e227d8846c9be1';
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

async function submitToIndexNow(urlList) {
  const payload = {
    host: HOST,
    key: KEY,
    keyLocation: KEY_LOCATION,
    urlList: urlList
  };

  const endpoints = [
    { name: 'IndexNow Global (Bing, Yandex, Seznam, Naver)', url: 'https://api.indexnow.org/indexnow' },
    { name: 'Microsoft Bing Direct', url: 'https://www.bing.com/indexnow' }
  ];

  for (const ep of endpoints) {
    console.log(`\nSubmitting ${urlList.length} URLs to ${ep.name}...`);
    try {
      const res = await fetch(ep.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8'
        },
        body: JSON.stringify(payload)
      });

      if (res.status === 200 || res.status === 202) {
        console.log(`✅ Success! [HTTP ${res.status}] URLs submitted and queued for immediate indexing.`);
      } else {
        const text = await res.text().catch(() => '');
        console.log(`⚠️ Response [HTTP ${res.status}]: ${text || res.statusText}`);
      }
    } catch (err) {
      console.error(`❌ Request error for ${ep.name}:`, err.message);
    }
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
  console.log(`Discovered ${allUrls.length} total URLs to index.`);

  if (allUrls.length === 0) {
    console.log('No URLs to submit.');
    return;
  }

  // Preview first 5
  console.log('Sample URLs:');
  allUrls.slice(0, 5).forEach(u => console.log(' - ' + u));
  if (allUrls.length > 5) console.log(` ... and ${allUrls.length - 5} more`);

  // Max 10,000 URLs per request according to IndexNow spec
  const batch = allUrls.slice(0, 10000);
  await submitToIndexNow(batch);

  console.log('\n=== Done ===');
}

main();
