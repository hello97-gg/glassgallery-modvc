const { createClient } = require('@libsql/client');
const fs = require('fs');

const env = fs.readFileSync('.dev.vars', 'utf8').split('\n').reduce((acc, line) => {
  const [k, ...v] = line.split('=');
  if (k && v.length) acc[k.trim()] = v.join('=').trim().replace(/"/g, '');
  return acc;
}, {});

const db = createClient({
  url: 'file:local_backup.db',
  syncUrl: env.TURSO_DATABASE_URL,
  authToken: env.TURSO_AUTH_TOKEN
});

db.sync().then(() => {
  console.log('Successfully synced to local_backup.db!');
  process.exit(0);
}).catch(console.error);
