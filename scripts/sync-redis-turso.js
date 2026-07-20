import { createClient } from '@libsql/client';

// Redis connection - using environment variables
const REDIS_URL = process.env.REDIS_URL;
const REDIS_AUTH = process.env.REDIS_AUTH;

// Turso connection (requires your env variables)
const turso = createClient({
  url: process.env.TURSO_DATABASE_URL || process.env.VITE_TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN || process.env.VITE_TURSO_AUTH_TOKEN,
});

async function fetchRedis(command, ...args) {
    const url = `${REDIS_URL}/${command}/${args.map(encodeURIComponent).join('/')}`;
    const res = await fetch(url, {
        headers: { "Authorization": REDIS_AUTH }
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
}

async function syncViews() {
  console.log("Fetching pending views from Redis...");
  
  // Grab all views currently in the list
  const listRes = await fetchRedis("LRANGE", "pending_views", "0", "-1");
  const viewsList = listRes.result || [];
  
  if (viewsList.length === 0) {
      console.log("No pending views to sync.");
      return;
  }
  
  const statements = [];
  
  viewsList.forEach(viewStr => {
      try {
          const v = JSON.parse(viewStr);
          if (v.userUid && v.imageId) {
              statements.push({
                  sql: "INSERT OR IGNORE INTO views (userUid, imageId, viewedAt) VALUES (?, ?, ?)",
                  args: [v.userUid, v.imageId, v.viewedAt || new Date().toISOString()]
              });
          }
      } catch (e) {
          console.error("Skipping invalid view JSON:", viewStr);
      }
  });

  if (statements.length > 0) {
      console.log(`Batch writing ${statements.length} views to Turso...`);
      await turso.batch(statements, "write");
      console.log("Successfully batch inserted views to Turso.");
      
      // Trim the list to remove only the ones we just processed.
      // E.g., if we pulled 50 items, we keep items from index 50 onwards.
      await fetchRedis("LTRIM", "pending_views", statements.length.toString(), "-1");
  }
}

async function syncDownloads() {
    console.log("Scanning download_count keys in Redis...");
    const keysRes = await fetchRedis("KEYS", "download_count:*");
    const keys = keysRes.result || [];
    
    if (keys.length === 0) {
        console.log("No pending downloads to sync.");
        return;
    }
    
    const statements = [];
    for (const key of keys) {
        const imageId = key.replace('download_count:', '');
        const valRes = await fetchRedis("GET", key);
        const count = parseInt(valRes.result);
        
        if (count > 0) {
            statements.push({
                sql: "UPDATE images SET downloadCount = downloadCount + ? WHERE id = ?",
                args: [count, imageId]
            });
        }
    }
    
    if (statements.length > 0) {
        console.log(`Batch updating ${statements.length} download counts in Turso...`);
        await turso.batch(statements, "write");
        
        // Delete processed keys from Redis so we don't count them twice
        for (const key of keys) {
             await fetchRedis("DEL", key);
        }
        console.log("Successfully synced downloads to Turso.");
    }
}

async function main() {
    try {
        await syncViews();
        await syncDownloads();
        console.log("Sync sequence completed successfully!");
    } catch (e) {
        console.error("CRITICAL: Sync failed", e);
    }
}

main();
