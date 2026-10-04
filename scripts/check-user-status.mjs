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
const res = await db.query(`
  select u.email, u.id, u.email_confirmed_at, p.role, p.verification_status, r.id as reg_id, r.status as reg_status,
         m.organization_id, m.role as member_role, m.is_active as member_active, o.name as org_name
  from auth.users u
  left join public.profiles p on p.id = u.id
  left join public.registrations r on r.lgu_id = u.id
  left join public.organization_memberships m on m.user_id = u.id
  left join public.organizations o on o.id = m.organization_id
  where u.email in ('organization@example.com', 'admin@example.com')
`);
console.log(JSON.stringify(res.rows, null, 2));
await db.end();
