import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const loadEnv = (filePath) => {
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf8');
    for (const line of content.split('\n')) {
      const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)$/);
      if (match) {
        const key = match[1].trim();
        let val = match[2].trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.substring(1, val.length - 1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
};

loadEnv(path.resolve('.env.hosted.local'));
loadEnv(path.resolve('.env'));

const databaseUrl = process.env.SUPABASE_DB_URL;
if (!databaseUrl) {
  console.error('SUPABASE_DB_URL is not set.');
  process.exit(1);
}

async function main() {
  const db = new pg.Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });
  await db.connect();

  console.log('Connected to Supabase DB. Applying offline sync migrations...');

  const migration1 = fs.readFileSync(
    path.resolve('supabase/migrations/20261005000000_offline_sync_engine.sql'),
    'utf8'
  );
  console.log('Applying 20261005000000_offline_sync_engine.sql...');
  await db.query(migration1);
  console.log('Applied 20261005000000_offline_sync_engine.sql successfully!');

  const migration2 = fs.readFileSync(
    path.resolve('supabase/migrations/20261005010000_merchant_manifest_presync.sql'),
    'utf8'
  );
  console.log('Applying 20261005010000_merchant_manifest_presync.sql...');
  await db.query(migration2);
  console.log('Applied 20261005010000_merchant_manifest_presync.sql successfully!');

  await db.end();
  console.log('All offline sync migrations applied successfully!');
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
