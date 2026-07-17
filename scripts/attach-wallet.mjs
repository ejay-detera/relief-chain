import { Keypair } from '@stellar/stellar-sdk';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';

const hex64 = (value) => createHash('sha256').update(value).digest('hex');
const databaseUrl = process.env.SUPABASE_DB_URL?.trim() || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

async function main() {
  const db = new pg.Client(databaseUrl);
  await db.connect();

  try {
    const userId = '5c641732-1791-4f85-97ac-7bae6f321957';
    
    // Check if identity exists
    let identityId;
    const identityResult = await db.query(`SELECT id FROM public.beneficiary_identities WHERE user_id = $1`, [userId]);
    
    if (identityResult.rows.length === 0) {
        const res = await db.query(
          `INSERT INTO public.beneficiary_identities (user_id, verification_status, verified_at)
           VALUES ($1, 'Verified', now()) RETURNING id`,
          [userId]
        );
        identityId = res.rows[0].id;
    } else {
        identityId = identityResult.rows[0].id;
    }

    // Add a Stellar Wallet
    const walletSecret = Keypair.random().secret();
    const walletAddress = Keypair.fromSecret(walletSecret).publicKey();

    const adminUser = (await db.query(`SELECT id FROM public.profiles WHERE role = 'lgu' LIMIT 1`)).rows[0];
    const adminUserId = adminUser.id;

    // Insert wallet (no on conflict)
    try {
      await db.query(
        `insert into public.wallets (owner_type, owner_id, purpose, network, address,
           verification_status, is_active, proof_challenge_digest, proof_signature_digest,
           proof_challenge_issued_at, verified_at, verified_by)
         values ('beneficiary_identity',$1,'beneficiary','stellar_testnet',$2,'verified',true,
           $3,$4,now(),now(),$5)`,
        [
          identityId,
          walletAddress,
          hex64(`challenge:${walletAddress}`),
          hex64(`signature:${walletAddress}`),
          adminUserId,
        ],
      );
    } catch (e) {
      console.log('Wallet already exists or another error:', e.message);
    }
    
    // IMPORTANT: Update the profile with the pubkey so the UI shows it!
    await db.query(
      `update public.profiles set stellar_pubkey = $2 where id = $1`,
      [userId, walletAddress]
    );

    console.log(`Successfully connected wallet ${walletAddress} to user!`);
  } catch (error) {
    console.error('Failed to attach wallet:', error);
  } finally {
    await db.end();
  }
}

main();
