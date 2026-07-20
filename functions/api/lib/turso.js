export function getDb(env) {
  // Use the Cloudflare Tunnel URL and the secure password from env variables
  const VPS_TUNNEL_URL = env.VPS_TUNNEL_URL;
  const VPS_API_KEY = env.VPS_SECRET_KEY;

  if (!VPS_TUNNEL_URL || !VPS_API_KEY) {
    throw new Error("Missing VPS_TUNNEL_URL or VPS_SECRET_KEY environment variable.");
  }

  const executeSql = async (query) => {
    // Standardize the query format (string or object)
    const sqlText = typeof query === 'string' ? query : query.sql;
    const args = typeof query === 'string' ? [] : (query.args || []);

    const response = await fetch(VPS_TUNNEL_URL, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "x-api-key": VPS_API_KEY
      },
      body: JSON.stringify({ sql: sqlText, args: args })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("VPS DB Error:", errorText);
      throw new Error(`VPS DB Error: ${errorText}`);
    }
    
    const data = await response.json();
    
    // Ensure .rows is always an array so it doesn't break existing code
    if (!data.rows) {
      data.rows = [];
    }
    return data;
  };

  return {
    execute: executeSql,
    // Add a simple batch function to support notifications.js
    batch: async (statements) => {
      const results = [];
      for (const stmt of statements) {
        results.push(await executeSql(stmt));
      }
      return results;
    }
  };
}
