// Quick script to manually transfer RCPHP to beneficiary for testing
// This simulates what the disbursement system would do

import { Asset, Horizon, Keypair, Networks, Operation, TransactionBuilder } from '@stellar/stellar-sdk';
import pg from 'pg';

const HORIZON_URL = process.env.EXPO_PUBLIC_STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org';
const NETWORK_PASSPHRASE = Networks.TESTNET;
const RCPHP_ISSUER = 'GBC6HZTIUH6C3KQR5D3NOS2PJ7YKQJQNAQGAO3WO4PICJEXPAPGRKSQ7';

const orgTreasurySecret = process.env.STELLAR_ORGANIZATION_TREASURY_SECRET?.trim();
const beneficiarySecret = process.env.STELLAR_BENEFICIARY_SECRET?.trim();
const databaseUrl = process.env.SUPABASE_DB_URL?.trim() || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

if (!orgTreasurySecret || !beneficiarySecret) {
  throw new Error('Missing STELLAR_ORGANIZATION_TREASURY_SECRET or STELLAR_BENEFICIARY_SECRET');
}

const orgTreasuryKp = Keypair.fromSecret(orgTreasurySecret);
const beneficiaryKp = Keypair.fromSecret(beneficiarySecret);

const amountRCPHP = '1000'; // Transfer 1,000 RCPHP

console.log('Manual RCPHP Transfer');
console.log('====================');
console.log('From:', orgTreasuryKp.publicKey(), '(Organization Treasury)');
console.log('To:', beneficiaryKp.publicKey(), '(Beneficiary)');
console.log('Amount:', amountRCPHP, 'RCPHP');
console.log('');

const server = new Horizon.Server(HORIZON_URL);
const rcphpAsset = new Asset('RCPHP', RCPHP_ISSUER);

async function transfer() {
  try {
    // 1. Load source account
    console.log('Loading treasury account...');
    const sourceAccount = await server.loadAccount(orgTreasuryKp.publicKey());
    
    // 2. Check beneficiary has trustline
    console.log('Checking beneficiary trustline...');
    const beneficiaryAccount = await server.loadAccount(beneficiaryKp.publicKey());
    const hasTrustline = beneficiaryAccount.balances.some(
      b => b.asset_type !== 'native' && b.asset_code === 'RCPHP' && b.asset_issuer === RCPHP_ISSUER
    );
    
    if (!hasTrustline) {
      throw new Error('Beneficiary does not have RCPHP trustline!');
    }
    
    // 3. Build transaction
    console.log('Building transaction...');
    const transaction = new TransactionBuilder(sourceAccount, {
      fee: '10000',
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(Operation.payment({
        destination: beneficiaryKp.publicKey(),
        asset: rcphpAsset,
        amount: amountRCPHP,
      }))
      .setTimeout(30)
      .build();
    
    transaction.sign(orgTreasuryKp);
    
    // 4. Submit to Stellar
    console.log('Submitting to Stellar testnet...');
    const result = await server.submitTransaction(transaction);
    
    console.log('✅ SUCCESS!');
    console.log('Transaction Hash:', result.hash);
    console.log('Ledger:', result.ledger);
    console.log('');
    
    // 5. Update database (simulate what reconciliation would do)
    console.log('Updating database projection...');
    const db = new pg.Client(databaseUrl);
    await db.connect();
    
    try {
      // Get beneficiary identity and user IDs
      const { rows: userRows } = await db.query(
        `SELECT id FROM auth.users WHERE email = 'beneficiary@example.com'`
      );
      
      if (userRows.length === 0) {
        console.warn('⚠ Beneficiary user not found in database');
        return;
      }
      
      const userId = userRows[0].id;
      
      const { rows: identityRows } = await db.query(
        `SELECT id FROM beneficiary_identities WHERE user_id = $1`,
        [userId]
      );
      
      if (identityRows.length === 0) {
        console.warn('⚠ Beneficiary identity not found');
        return;
      }
      
      const identityId = identityRows[0].id;
      
      // Get program and organization IDs from enrollment
      const { rows: enrollmentRows } = await db.query(`
        SELECT 
          e.program_id,
          p.organization_id,
          p.asset_issuer
        FROM enrollments e
        JOIN programs p ON p.id = e.program_id
        WHERE e.beneficiary_id = $1
        AND e.approval_status = 'Approved'
        LIMIT 1
      `, [userId]);
      
      if (enrollmentRows.length === 0) {
        console.warn('⚠ No approved program enrollment found for beneficiary');
        return;
      }
      
      const programId = enrollmentRows[0].program_id;
      const organizationId = enrollmentRows[0].organization_id;
      const assetIssuer = enrollmentRows[0].asset_issuer || RCPHP_ISSUER;
      
      // Use a dummy reconciliation run ID (will be replaced by actual reconciliation later)
      const dummyRunId = '00000000-0000-0000-0000-000000000001';
      
      // Insert or update balance projection
      await db.query(`
        INSERT INTO beneficiary_balance_projection (
          organization_id,
          program_id,
          beneficiary_identity_id,
          network,
          aid_type,
          asset_code,
          asset_issuer,
          available_balance_stroops,
          allocated_stroops,
          distributed_stroops,
          confirmed_transaction_count,
          latest_transaction_hash,
          reconciliation_run_id,
          as_of_ledger,
          reconciled_at,
          stale_after,
          is_stale
        )
        VALUES (
          $1, $2, $3, 'stellar_testnet', 'cash', 'RCPHP', $4,
          $5, $5, $5, 1, $6, $7, $8,
          now(), now() + interval '5 minutes', false
        )
        ON CONFLICT (organization_id, program_id, beneficiary_identity_id, asset_code)
        DO UPDATE SET
          available_balance_stroops = beneficiary_balance_projection.available_balance_stroops + $5,
          distributed_stroops = beneficiary_balance_projection.distributed_stroops + $5,
          confirmed_transaction_count = beneficiary_balance_projection.confirmed_transaction_count + 1,
          latest_transaction_hash = $6,
          as_of_ledger = $8,
          reconciled_at = now(),
          stale_after = now() + interval '5 minutes',
          is_stale = false,
          updated_at = now()
      `, [
        organizationId,
        programId,
        identityId,
        assetIssuer,
        1000 * 10000000, // 1000 RCPHP = 10,000,000,000 stroops
        result.hash,
        dummyRunId,
        result.ledger
      ]);
      
      console.log('✅ Database projection updated');
      
    } finally {
      await db.end();
    }
    
    console.log('');
    console.log('🎉 Manual transfer complete!');
    console.log('Beneficiary should now see 1,000 RCPHP in their balance.');
    console.log('');
    console.log('View on Stellar Expert:');
    console.log(`https://stellar.expert/explorer/testnet/tx/${result.hash}`);
    
  } catch (err) {
    console.error('❌ ERROR:', err);
    process.exit(1);
  }
}

transfer();
