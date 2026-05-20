import { createClient } from "@libsql/client/web"; // Must use /web for Cloudflare Workers

export function getDb(env) {
  const url = env.TURSO_DATABASE_URL;
  const authToken = env.TURSO_AUTH_TOKEN;

  if (!url) {
    throw new Error("Missing TURSO_DATABASE_URL environment variable.");
  }

  return createClient({
    url,
    authToken,
  });
}
