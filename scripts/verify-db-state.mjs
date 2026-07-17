// A simple script to verify database state after E2E runs.
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';

const databaseUrl = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

async function main() {
  const db = new pg.Client(databaseUrl);
  await db.connect();
  try {
    console.log('--- Checking Payment Intents ---');
    const intents = await db.query(
      `select id, status, amount_stroops, transaction_hash, ledger_transaction_id, confirmed_ledger, confirmed_at from public.payment_intents`
    );
    console.table(intents.rows);

    console.log('\n--- Checking Settlements ---');
    const settlements = await db.query(
      `select id, status, amount_stroops, transaction_hash, ledger_transaction_id, ledger, confirmed_at from public.settlements`
    );
    console.table(settlements.rows);

    console.log('\n--- Checking Merchant Balance Projections ---');
    const projections = await db.query(
      `select * from public.merchant_balance_projection`
    );
    console.table(projections.rows);

    console.log('\n--- Checking Reconciliation Runs ---');
    const runs = await db.query(
      `select id, stream_name, status, observed_transaction_count, confirmed_intent_count, completed_at from public.reconciliation_runs`
    );
    console.table(runs.rows);
  } finally {
    await db.end();
  }
}

main().catch(console.error);
