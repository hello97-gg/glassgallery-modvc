import { createClient } from "@libsql/client";

// Ensure database URL and token are present
const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url) {
  throw new Error("Missing TURSO_DATABASE_URL environment variable.");
}

export const db = createClient({
  url,
  authToken,
});
