/**
 * Demo Payment Service
 * 
 * Simulates payment completion by directly updating the database.
 * This bypasses the Stellar SDK entirely to avoid React Native compatibility issues.
 * 
 * ⚠️ FOR DEMO/PRESENTATION PURPOSES ONLY
 * This does NOT interact with the actual Stellar blockchain.
 */

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
  console.log('[completeDemoPayment] Starting demo payment completion for intent:', intentId);

  try {
    // 1. Generate a fake Stellar transaction hash (64 hex characters)
    const fakeHash = Array.from({ length: 64 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join('');

    console.log('[completeDemoPayment] Generated fake hash:', fakeHash);

    // 2. Get the latest transaction attempt for this intent
    const { data: attempt, error: attemptFetchError } = await supabase
      .from('transaction_attempts')
      .select('id')
      .eq('financial_intent_id', intentId)
      .order('attempt_number', { ascending: false })
      .limit(1)
      .single();

    if (attemptFetchError || !attempt) {
      console.error('[completeDemoPayment] Failed to find transaction attempt:', attemptFetchError);
      return {
        success: false,
        error: 'Transaction attempt not found',
      };
    }

    console.log('[completeDemoPayment] Found attempt:', attempt.id);

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
      console.error('[completeDemoPayment] Failed to update attempt:', attemptUpdateError);
      return {
        success: false,
        error: 'Failed to update transaction attempt',
      };
    }

    console.log('[completeDemoPayment] Updated transaction attempt to observed_success');

    // 4. Update the financial intent to confirmed
    const { error: intentUpdateError } = await supabase
      .from('financial_intents')
      .update({
        confirmed_at: new Date().toISOString(),
      })
      .eq('id', intentId);

    if (intentUpdateError) {
      console.error('[completeDemoPayment] Failed to update financial intent:', intentUpdateError);
      return {
        success: false,
        error: 'Failed to update financial intent',
      };
    }

    console.log('[completeDemoPayment] Updated financial intent');

    // 5. Update the payment intent status
    const { error: paymentUpdateError } = await supabase
      .from('payment_intents')
      .update({
        status: 'confirmed',
        transaction_hash: fakeHash,
      })
      .eq('financial_intent_id', intentId);

    if (paymentUpdateError) {
      console.error('[completeDemoPayment] Failed to update payment intent:', paymentUpdateError);
      return {
        success: false,
        error: 'Failed to update payment intent',
      };
    }

    console.log('[completeDemoPayment] Demo payment completed successfully');

    return {
      success: true,
      transactionHash: fakeHash,
    };
  } catch (error) {
    console.error('[completeDemoPayment] Exception:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};
