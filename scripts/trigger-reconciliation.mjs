// Admin script to trigger Stellar reconciliation via edge function.
// Usage: node ./scripts/trigger-reconciliation.mjs

import fs from 'node:fs';
import path from 'node:path';

// Load env file if exists
try {
  const envPath = path.resolve('supabase/functions/.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    for (const line of envContent.split('\n')) {
      const match = line.match(/^\s*([^#=\s]+)\s*=\s*(.*)$/);
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
} catch (e) {
  console.warn('Could not read env file:', e);
}

const url = process.env.SUPABASE_URL?.trim() || 'http://127.0.0.1:54321';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!serviceRoleKey) {
  console.error('Error: SUPABASE_SERVICE_ROLE_KEY is missing.');
  process.exit(1);
}

async function triggerReconciliation() {
  console.log(`Triggering reconciliation on ${url}...`);
  
  const response = await fetch(`${url}/functions/v1/reconcile-stellar`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceRoleKey}`
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Reconciliation failed: ${response.status} ${response.statusText}\n${text}`);
  }

  const result = await response.json();
  console.log('Reconciliation successful:');
  console.log(JSON.stringify(result, null, 2));
}

triggerReconciliation().catch(err => {
  console.error(err);
  process.exit(1);
});
