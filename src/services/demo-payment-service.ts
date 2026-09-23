/**
 * Demo Payment Service
 *
 * Simulates payment completion by directly updating the database.
 * This bypasses the Stellar SDK entirely to avoid React Native compatibility issues.
 *
 * ⚠️ FOR DEMO/PRESENTATION PURPOSES ONLY
 * This does NOT interact with the actual Stellar blockchain.
 *
 * This module is only ever reachable when `DEMO_MODE` is true, which itself is
 * hard-locked to `__DEV__` builds (see src/config/demo-mode.ts). The guard
 * below is defense in depth: even if a caller is refactored to invoke this
 * directly without checking `DEMO_MODE` first, it still refuses to run outside
 * a development build.
 */

import { DEMO_MODE } from '@/config/demo-mode';
import { supabase } from '@/lib/supabase';

/**
 * Simulates a successful payment by directly marking it as confirmed in the database.
 * This generates a fake transaction hash and updates all relevant tables.
 */
export const completeDemoPayment = async (intentId: string): Promise<{
  success: boolean;
  transactionHash?: string;
  error?: string;
}> => {
  if (!DEMO_MODE) {
    // Fail closed: never fabricate a confirmed payment outside demo mode.
    throw new Error('completeDemoPayment was called outside of demo mode.');
  }

  try {
    // 1. Generate a fake Stellar transaction hash (64 hex characters)
    const fakeHash = Array.from({ length: 64 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join('');

    // 2. Get the latest transaction attempt for this intent
    const { data: attempt, error: attemptFetchError } = await supabase
      .from('transaction_attempts')
      .select('id')
      .eq('financial_intent_id', intentId)
      .order('attempt_number', { ascending: false })
      .limit(1)
      .single();

    if (attemptFetchError || !attempt) {
      return {
        success: false,
        error: 'Transaction attempt not found',
      };
    }

    // 3. Update the transaction attempt to "observed_success"
    const { error: attemptUpdateError } = await supabase
      .from('transaction_attempts')
      .update({
        status: 'observed_success',
        transaction_hash: fakeHash,
        ledger_sequence: Math.floor(Math.random() * 1000000) + 5000000,
        confirmed_at: new Date().toISOString(),
      })
      .eq('id', attempt.id);

    if (attemptUpdateError) {
      return {
        success: false,
        error: 'Failed to update transaction attempt',
      };
    }

    // 4. Update the financial intent to confirmed
    const { error: intentUpdateError } = await supabase
      .from('financial_intents')
      .update({
        confirmed_at: new Date().toISOString(),
      })
      .eq('id', intentId);

    if (intentUpdateError) {
      return {
        success: false,
        error: 'Failed to update financial intent',
      };
    }

    // 5. Update the payment intent status
    const { error: paymentUpdateError } = await supabase
      .from('payment_intents')
      .update({
        status: 'confirmed',
        transaction_hash: fakeHash,
      })
      .eq('financial_intent_id', intentId);

    if (paymentUpdateError) {
      return {
        success: false,
        error: 'Failed to update payment intent',
      };
    }

    return {
      success: true,
      transactionHash: fakeHash,
    };
  } catch (error) {
    if (__DEV__) {
      console.error('[completeDemoPayment] Exception:', error);
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};
