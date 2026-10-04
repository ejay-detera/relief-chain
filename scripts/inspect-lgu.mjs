import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { Keypair } from '@stellar/stellar-sdk';

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
loadEnv(path.resolve('.env.bootstrap.local'));

for (const [key, val] of Object.entries(process.env)) {
  if (key.startsWith('STELLAR_') && key.endsWith('_SECRET') && val?.startsWith('S')) {
    try {
      const kp = Keypair.fromSecret(val.trim());
      console.log(`Key ${key} -> Public: ${kp.publicKey()}`);
    } catch (e) {}
  }
}

async function main() {
  const db = new pg.Client({
    connectionString: process.env.SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false },
  });
  await db.connect();

  const usersRes = await db.query(`
    select p.id, p.full_name, p.role, o.id as org_id, o.name as org_name, w.address as wallet_address
    from public.profiles p
    left join public.organization_memberships m on m.user_id = p.id and m.is_active = true
    left join public.organizations o on o.id = m.organization_id
    left join public.wallets w on w.owner_id = o.id and w.purpose = 'organization_treasury' and w.is_active = true
    where p.role = 'lgu'
  `);
  console.log('LGU profiles & wallets:', JSON.stringify(usersRes.rows, null, 2));

  const authUsers = await db.query(`
    select id, email, created_at from auth.users where email in ('admin@example.com', 'organization@example.com')
  `);
  console.log('Auth users:', JSON.stringify(authUsers.rows, null, 2));

  const { Horizon } = await import('@stellar/stellar-sdk');
  const server = new Horizon.Server('https://horizon-testnet.stellar.org');
  try {
    const acc = await server.loadAccount('GA4KQ3GWONNWHJFEWP2K3SHJAAMJCBN7KKUJSBQQQN6DIWMKFENALXPD');
    console.log('GA4KQ3G balances:', acc.balances);
  } catch (e) {
    console.log('Horizon error GA4KQ3G:', e.message);
  }

  await db.end();
}

main().catch(console.error);
