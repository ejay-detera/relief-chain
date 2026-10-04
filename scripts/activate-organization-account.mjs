import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const loadEnv = (filePath) => {
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf8');
    for (const line of content.split('\n')) {
      const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)$/);
      if (match) {
        let val = match[2].trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.substring(1, val.length - 1);
        }
        if (!process.env[match[1].trim()]) {
          process.env[match[1].trim()] = val;
        }
      }
    }
  }
};

loadEnv('.env.hosted.local');
loadEnv('.env');

const db = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
});

await db.connect();

console.log('Activating registration for organization@example.com...');

// Disable trigger to approve registration as superadmin/database owner
await db.query(`alter table public.registrations disable trigger registrations_status_guard`);

const res = await db.query(`
  update public.registrations 
  set status = 'Approved', updated_at = now()
  where lgu_id = (select id from auth.users where email = 'organization@example.com')
  returning id, status, updated_at
`);

await db.query(`alter table public.registrations enable trigger registrations_status_guard`);

console.log('Updated registration row:', res.rows[0]);

// Confirm status
const check = await db.query(`
  select u.email, u.id, p.role, p.verification_status, r.status as reg_status
  from auth.users u
  join public.profiles p on p.id = u.id
  join public.registrations r on r.lgu_id = u.id
  where u.email = 'organization@example.com'
`);
console.log('User status after activation:', check.rows[0]);

await db.end();
