import { supabase } from '../../lib/supabase';
import { parseStroopAmount, type StroopAmount } from '../../types/blockchain';
import type { OfflineBeneficiaryLookupRecord, OfflineVoucherBalanceItem } from '../../types/offline-sync';
import { formatStroops, ZERO_STROOPS } from '../../utils/format-stroops';
import { resolveCanonicalVoucherType } from '../../utils/voucher-category-matcher';
import { preloadBeneficiaryManifest } from './offline-balance-manager';

export interface ManifestSyncResult {
  ok: boolean;
  count: number;
  syncedAt: string;
  error?: string;
}

let lastManifestSyncTime = 0;
const SYNC_THROTTLE_MS = 60_000; // 1 minute throttle unless forced

interface ManifestRow {
  beneficiary_identity_id: string;
  beneficiary_name: string;
  beneficiary_wallet: string;
  program_id: string;
  program_name: string;
  organization_id?: string;
  aid_type?: string;
  voucher_type?: string;
  category?: string;
  available_balance_stroops?: number | string | bigint;
}

/**
 * Automatically pre-fetches and caches all approved beneficiary voucher entitlements
 * for every program this merchant is accredited for into local SecureStore.
 * Eliminates the need for manual one-by-one pre-scanning prior to going offline.
 */
export async function preloadMerchantBeneficiariesCache(
  merchantEntityId: string,
  options?: { force?: boolean }
): Promise<ManifestSyncResult> {
  if (!merchantEntityId) {
    return { ok: false, count: 0, syncedAt: new Date().toISOString(), error: 'No merchant entity ID provided' };
  }

  const now = Date.now();
  if (!options?.force && now - lastManifestSyncTime < SYNC_THROTTLE_MS) {
    return { ok: true, count: 0, syncedAt: new Date(lastManifestSyncTime).toISOString() };
  }

  try {
    // 1. Attempt primary RPC: get_merchant_offline_manifest
    let rows: ManifestRow[] | null = null;
    const { data: rpcData, error: rpcError } = await supabase.rpc(
      'get_merchant_offline_manifest' as never,
      { p_merchant_entity_id: merchantEntityId } as never
    );

    if (!rpcError && Array.isArray(rpcData) && rpcData.length > 0) {
      rows = rpcData as ManifestRow[];
    } else {
      // 2. Fallback direct table query if RPC is not yet deployed
      const { data: directData, error: directError } = await supabase
        .from('program_merchants')
        .select(`
          program_id,
          status,
          programs:program_id (
            id,
            name,
            organization_id,
            voucher_type,
            aid_type,
            voucher_value,
            amount_per_beneficiary,
            enrollments (
              id,
              beneficiary_identity_id,
              voucher_balance,
              allocation_amount_stroops,
              approval_status,
              beneficiary_identities:beneficiary_identity_id (
                id,
                user_id,
                profiles:user_id (
                  full_name
                ),
                wallets (
                  address,
                  is_active
                )
              )
            )
          )
        `)
        .eq('merchant_id', merchantEntityId)
        .eq('status', 'authorized');

      if (!directError && Array.isArray(directData)) {
        rows = [];
        for (const pm of directData) {
          const prog = pm.programs as unknown as {
            id: string;
            name: string;
            organization_id?: string;
            voucher_type?: string;
            aid_type?: string;
            voucher_value?: number;
            amount_per_beneficiary?: number;
            enrollments?: Array<{
              id: string;
              beneficiary_identity_id: string;
              voucher_balance?: number;
              allocation_amount_stroops?: string | number;
              approval_status?: string;
              beneficiary_identities?: {
                id: string;
                profiles?: { full_name?: string };
                wallets?: Array<{ address: string; is_active: boolean }>;
              };
            }>;
          } | null;

          if (!prog || !Array.isArray(prog.enrollments)) continue;

          for (const enr of prog.enrollments) {
            if (enr.approval_status && enr.approval_status !== 'Approved') continue;
            const bi = enr.beneficiary_identities;
            const wallet = bi?.wallets?.find((w) => w.is_active)?.address || enr.id;
            const balStroops =
              enr.allocation_amount_stroops != null
                ? enr.allocation_amount_stroops
                : (Number(enr.voucher_balance ?? prog.voucher_value ?? prog.amount_per_beneficiary ?? 100) * 10_000_000);

            rows.push({
              beneficiary_identity_id: enr.beneficiary_identity_id || bi?.id || enr.id,
              beneficiary_name: bi?.profiles?.full_name || 'Beneficiary',
              beneficiary_wallet: wallet,
              program_id: prog.id,
              program_name: prog.name,
              organization_id: prog.organization_id,
              aid_type: prog.aid_type || 'voucher',
              voucher_type: prog.voucher_type || 'General',
              category: prog.voucher_type || 'General',
              available_balance_stroops: balStroops,
            });
          }
        }
      }
    }

    if (!rows || rows.length === 0) {
      lastManifestSyncTime = now;
      return { ok: true, count: 0, syncedAt: new Date(now).toISOString() };
    }

    // 3. Group rows by beneficiary to assemble OfflineBeneficiaryLookupRecords
    const recordsMap = new Map<string, OfflineBeneficiaryLookupRecord>();

    for (const row of rows) {
      const benKey = row.beneficiary_wallet || row.beneficiary_identity_id;
      if (!benKey) continue;

      let stroops: StroopAmount = ZERO_STROOPS;
      try {
        stroops = parseStroopAmount(String(row.available_balance_stroops ?? '0'));
      } catch {
        stroops = ZERO_STROOPS;
      }

      const vType = row.voucher_type || 'General';
      const cat = row.category || vType;
      const canonical = resolveCanonicalVoucherType(cat);

      const voucherItem: OfflineVoucherBalanceItem = {
        programId: row.program_id,
        programName: row.program_name || 'Relief Program',
        organizationId: row.organization_id || '',
        aidType: (row.aid_type as 'cash' | 'voucher') || 'voucher',
        voucherType: vType,
        category: cat,
        canonicalType: canonical,
        availableStroops: stroops,
        availablePhp: formatStroops(stroops),
        reconciledAt: null,
        isAllowedForMerchant: true,
      };

      const existing = recordsMap.get(benKey);
      if (existing) {
        // Prevent duplicate program vouchers
        const hasProg = existing.balances.some((b) => b.programId === row.program_id);
        if (!hasProg) {
          existing.balances.push(voucherItem);
        }
      } else {
        recordsMap.set(benKey, {
          beneficiaryIdentityId: row.beneficiary_identity_id,
          beneficiaryName: row.beneficiary_name || 'Beneficiary',
          beneficiaryWallet: row.beneficiary_wallet || benKey,
          isOffline: true,
          syncedAt: new Date().toISOString(),
          balances: [voucherItem],
        });
      }
    }

    const records = Array.from(recordsMap.values());
    const savedCount = await preloadBeneficiaryManifest(merchantEntityId, records);

    lastManifestSyncTime = now;
    return {
      ok: true,
      count: savedCount,
      syncedAt: new Date(now).toISOString(),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown manifest sync error';
    console.warn('[manifest-presync] Pre-sync failed:', message);
    return {
      ok: false,
      count: 0,
      syncedAt: new Date().toISOString(),
      error: message,
    };
  }
}
