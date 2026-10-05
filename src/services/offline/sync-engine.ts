import { probeNetworkReachability } from '@/hooks/use-network-state';
import { supabase } from '@/lib/supabase';
import { executeVoucherRedemption } from '@/services/merchant-redemption-service';
import {
  type OfflineSyncBatchResponse,
  type OfflineSyncItemResult,
} from '@/types/offline-sync';
import {
  getPendingOfflineRedemptions,
  updateQueueItemStatus,
} from './offline-sync-queue';
import { notifyVoucherRedeemed } from '@/services/voucher-sync-service';

export interface SyncExecutionResult {
  ok: boolean;
  attemptedCount: number;
  settledCount: number;
  rejectedCount: number;
  results: OfflineSyncItemResult[];
  error?: string;
}

let isSyncRunning = false;

/**
 * Reconciles all pending offline redemptions with the backend database and Stellar ledger.
 * Safe to call repeatedly; prevents concurrent sync runs.
 */
export async function syncPendingOfflineRedemptions(
  merchantEntityId: string | null
): Promise<SyncExecutionResult> {
  if (!merchantEntityId) {
    return { ok: false, attemptedCount: 0, settledCount: 0, rejectedCount: 0, results: [], error: 'Merchant ID missing' };
  }

  if (isSyncRunning) {
    return { ok: false, attemptedCount: 0, settledCount: 0, rejectedCount: 0, results: [], error: 'Sync already in progress' };
  }

  // 1. Verify actual network reachability before attempting batch
  const isOnline = await probeNetworkReachability();
  if (!isOnline) {
    return {
      ok: false,
      attemptedCount: 0,
      settledCount: 0,
      rejectedCount: 0,
      results: [],
      error: 'Device is offline. Connect to internet to sync.',
    };
  }

  isSyncRunning = true;

  try {
    // 2. Fetch queued pending redemptions
    const pendingItems = await getPendingOfflineRedemptions(merchantEntityId);
    if (pendingItems.length === 0) {
      isSyncRunning = false;
      return { ok: true, attemptedCount: 0, settledCount: 0, rejectedCount: 0, results: [] };
    }

    // 3. Mark items as syncing locally
    for (const item of pendingItems) {
      await updateQueueItemStatus({
        merchantId: merchantEntityId,
        nonce: item.envelope.nonce,
        status: 'syncing',
      });
    }

    // 4. Submit batch RPC to Supabase
    const payloadItems = pendingItems.map((item) => item.envelope);
    const { data, error } = await supabase.rpc(
      'sync_offline_redemption_batch' as never,
      {
        p_merchant_entity_id: merchantEntityId,
        p_items: payloadItems,
      } as never
    );

    if (error) {
      console.warn('[sync-engine] Batch RPC failed, attempting sequential replay fallback via executeVoucherRedemption:', error.message);

      const replayResults: OfflineSyncItemResult[] = [];
      let replaySettledCount = 0;
      let replayRejectedCount = 0;

      for (const item of pendingItems) {
        const replayRes = await executeVoucherRedemption({
          merchantEntityId,
          beneficiaryIdentifier: item.envelope.beneficiaryWallet || item.envelope.beneficiaryId,
          programId: item.envelope.programId,
          amountStroops: item.envelope.amountStroops,
          amountPhp: item.envelope.amountPhp,
        });

        if (replayRes.ok) {
          replaySettledCount++;
          await updateQueueItemStatus({
            merchantId: merchantEntityId,
            nonce: item.envelope.nonce,
            status: 'settled',
            transactionHash: replayRes.data.transactionHash,
          });
          replayResults.push({
            nonce: item.envelope.nonce,
            status: 'settled',
            transactionHash: replayRes.data.transactionHash,
            redemptionId: replayRes.data.redemptionId,
          });
        } else {
          const isOverspend =
            replayRes.error.toLowerCase().includes('insufficient') ||
            replayRes.error.toLowerCase().includes('balance');

          if (isOverspend) {
            replayRejectedCount++;
            await updateQueueItemStatus({
              merchantId: merchantEntityId,
              nonce: item.envelope.nonce,
              status: 'rejected',
              errorReason: 'BENEFICIARY_OVERSPENT_REJECTED',
            });
            replayResults.push({
              nonce: item.envelope.nonce,
              status: 'rejected',
              errorReason: 'BENEFICIARY_OVERSPENT_REJECTED',
              message: replayRes.error,
            });
          } else {
            // Transient error: revert back to pending_sync
            await updateQueueItemStatus({
              merchantId: merchantEntityId,
              nonce: item.envelope.nonce,
              status: 'pending_sync',
              errorReason: replayRes.error,
            });
          }
        }
      }

      isSyncRunning = false;
      return {
        ok: replaySettledCount > 0,
        attemptedCount: pendingItems.length,
        settledCount: replaySettledCount,
        rejectedCount: replayRejectedCount,
        results: replayResults,
        error: replaySettledCount === 0 && replayRejectedCount === 0 ? error.message : undefined,
      };
    }

    const batchResponse = data as unknown as OfflineSyncBatchResponse;
    const results = batchResponse?.results ?? [];

    // 5. Update local queue per item result
    let settledCount = 0;
    let rejectedCount = 0;

    for (const result of results) {
      if (result.status === 'settled' || result.status === 'already_settled') {
        settledCount++;
        await updateQueueItemStatus({
          merchantId: merchantEntityId,
          nonce: result.nonce,
          status: 'settled',
          transactionHash: result.transactionHash,
        });

        const matchedItem = pendingItems.find((p) => p.envelope.nonce === result.nonce);
        if (matchedItem) {
          void notifyVoucherRedeemed({
            programId: matchedItem.envelope.programId,
            beneficiaryIdentifier: matchedItem.envelope.beneficiaryWallet || matchedItem.envelope.beneficiaryId,
            amountPhp: matchedItem.envelope.amountPhp,
          });
        }
      } else if (result.status === 'rejected') {
        rejectedCount++;
        await updateQueueItemStatus({
          merchantId: merchantEntityId,
          nonce: result.nonce,
          status: 'rejected',
          errorReason: result.errorReason || 'BENEFICIARY_OVERSPENT_REJECTED',
        });
      }
    }

    isSyncRunning = false;
    return {
      ok: true,
      attemptedCount: pendingItems.length,
      settledCount,
      rejectedCount,
      results,
    };
  } catch (caught) {
    isSyncRunning = false;
    const message = caught instanceof Error ? caught.message : 'Unknown sync failure';
    return {
      ok: false,
      attemptedCount: 0,
      settledCount: 0,
      rejectedCount: 0,
      results: [],
      error: message,
    };
  }
}
