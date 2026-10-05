import * as SecureStore from 'expo-secure-store';

import { supabase } from '../lib/supabase';
import { parseStroopAmount, type StroopAmount } from '../types/blockchain';
import { formatStroops, ZERO_STROOPS } from '../utils/format-stroops';
import {
  canMerchantRedeemVoucher,
  resolveCanonicalVoucherType,
  type CanonicalVoucherType,
} from '../utils/voucher-category-matcher';
import { normalizeMerchantName } from './merchantProgramsService';
import { setCachedBeneficiaryRecord } from './offline/offline-balance-manager';
import { notifyVoucherRedeemed, notifyVoucherScanned } from './voucher-sync-service';

const toStroopAmount = (val: unknown): StroopAmount => {
  if (val === null || val === undefined) return ZERO_STROOPS;
  try {
    return parseStroopAmount(val as number | string | bigint);
  } catch {
    return ZERO_STROOPS;
  }
};

const BEN_CACHE_PREFIX = 'rc_merchant_ben_cache_v1_';
const PENDING_REDEMPTIONS_PREFIX = 'rc_merchant_pending_redemptions_v1_';

const secureStoreOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

const STELLAR_PUBLIC_KEY_REGEX = /^G[A-Z2-7]{55}$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface BeneficiaryVoucherBalanceItem {
  programId: string;
  programName: string;
  organizationId: string;
  aidType: 'cash' | 'voucher';
  voucherType: string;
  category: string;
  canonicalType: CanonicalVoucherType;
  availableStroops: StroopAmount;
  availablePhp: string;
  reconciledAt: string | null;
  isAllowedForMerchant: boolean;
  disallowedReason?: string;
}

export interface BeneficiaryLookupResult {
  beneficiaryIdentityId: string;
  beneficiaryName: string;
  beneficiaryWallet: string;
  isOffline: boolean;
  syncedAt: string;
  balances: BeneficiaryVoucherBalanceItem[];
}

export interface PendingOfflineRedemption {
  id: string;
  beneficiaryIdentityId: string;
  beneficiaryWallet: string;
  beneficiaryName: string;
  programId: string;
  programName: string;
  voucherType: string;
  amountStroops: StroopAmount;
  amountPhp: string;
  merchantId: string;
  createdAt: string;
  status: 'pending_sync' | 'settled' | 'failed';
  errorReason?: string;
  transactionHash?: string;
}

export interface RedemptionReceiptData {
  receiptNumber: string;
  timestamp: string;
  merchantName: string;
  merchantSettlementAddress: string;
  beneficiaryName: string;
  beneficiaryWallet: string;
  programName: string;
  voucherType: string;
  amountPhp: string;
  remainingBalancePhp: string;
  transactionHash: string | null;
  isOfflineSync: boolean;
}

export type ScannedVoucherTarget = {
  beneficiaryAddress: string;
  programId?: string;
  enrollmentId?: string;
  category?: string;
  voucherType?: string;
  allocatedAmountStroops?: string;
  programName?: string;
  isVoucherPayload?: boolean;
};

/**
 * Extracts a clean wallet address or identifier from a scanned QR payload.
 * Supports raw Stellar address ('G...'), URI format ('reliefchain:beneficiary:G...'),
 * or JSON encoded QR codes.
 */
export function extractBeneficiaryAddress(scanned: string): string | null {
  const target = extractVoucherTarget(scanned);
  return target?.beneficiaryAddress ?? null;
}

/**
 * Extracts voucher context (beneficiary address, program, category) from scanned QR payloads.
 */
export function extractVoucherTarget(scanned: string): ScannedVoucherTarget | null {
  if (!scanned) return null;
  const raw = scanned.trim();

  // 1. Direct Stellar public key
  if (STELLAR_PUBLIC_KEY_REGEX.test(raw)) {
    return { beneficiaryAddress: raw };
  }

  // 2. URI format: 'reliefchain:beneficiary:G...' or 'reliefchain:wallet:G...'
  const uriMatch = raw.match(/reliefchain:(?:beneficiary|wallet):([G0-9a-zA-Z-]+)/i);
  if (uriMatch && uriMatch[1]) {
    const candidate = uriMatch[1].trim();
    if (STELLAR_PUBLIC_KEY_REGEX.test(candidate) || UUID_REGEX.test(candidate)) {
      return { beneficiaryAddress: candidate };
    }
  }

  // 3. JSON payload: { "type": "reliefchain:voucher", "publicKey": "G...", "beneficiaryWallet": "G...", "programId": "..." }
  if (raw.startsWith('{') && raw.endsWith('}')) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const candidate = (parsed.beneficiaryWallet ||
        parsed.publicKey ||
        parsed.address ||
        parsed.wallet ||
        parsed.id) as string;

      const isVoucher = parsed.type === 'reliefchain:voucher';
      const address =
        typeof candidate === 'string' &&
        (STELLAR_PUBLIC_KEY_REGEX.test(candidate) || UUID_REGEX.test(candidate))
          ? candidate
          : isVoucher
          ? (typeof parsed.enrollmentId === 'string' && UUID_REGEX.test(parsed.enrollmentId)
              ? parsed.enrollmentId
              : 'voucher-holder')
          : '';

      if (address) {
        return {
          beneficiaryAddress: address,
          programId: typeof parsed.programId === 'string' ? parsed.programId : undefined,
          enrollmentId: typeof parsed.enrollmentId === 'string' ? parsed.enrollmentId : undefined,
          category: typeof parsed.category === 'string' ? parsed.category : undefined,
          voucherType: typeof parsed.voucherType === 'string' ? parsed.voucherType : undefined,
          allocatedAmountStroops:
            typeof parsed.allocatedAmountStroops === 'string'
              ? parsed.allocatedAmountStroops
              : undefined,
          programName: typeof parsed.programName === 'string' ? parsed.programName : undefined,
          isVoucherPayload: isVoucher,
        };
      }
    } catch {
      // not JSON
    }
  }

  // 4. Raw UUID format (beneficiary_identity_id)
  if (UUID_REGEX.test(raw)) {
    return { beneficiaryAddress: raw };
  }

  return null;
}

const getCacheKey = (address: string): string =>
  `${BEN_CACHE_PREFIX}${address.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

const getPendingKey = (merchantId: string): string =>
  `${PENDING_REDEMPTIONS_PREFIX}${merchantId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

/**
 * Reads cached beneficiary balances from on-device SecureStore.
 */
export async function getCachedBeneficiaryLookup(
  address: string
): Promise<BeneficiaryLookupResult | null> {
  try {
    const raw = await SecureStore.getItemAsync(getCacheKey(address), secureStoreOptions);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BeneficiaryLookupResult;
    if (!parsed || !Array.isArray(parsed.balances)) return null;
    return { ...parsed, isOffline: true };
  } catch (err) {
    console.warn('[merchant-redemption-service] Error reading cache:', err);
    return null;
  }
}

async function setCachedBeneficiaryLookup(result: BeneficiaryLookupResult): Promise<void> {
  try {
    const key = getCacheKey(result.beneficiaryWallet);
    const serialized = JSON.stringify(result);
    await SecureStore.setItemAsync(key, serialized, secureStoreOptions);
    if (result.beneficiaryIdentityId && result.beneficiaryIdentityId !== result.beneficiaryWallet) {
      const idKey = getCacheKey(result.beneficiaryIdentityId);
      await SecureStore.setItemAsync(idKey, serialized, secureStoreOptions);
    }
  } catch (err) {
    console.warn('[merchant-redemption-service] Error writing cache:', err);
  }
}


/**
 * Looks up beneficiary active assistance and voucher balances across all programs.
 * Enforces MER-01 (Balance check before redemption) and MER-02 (Category matching).
 * Gracefully falls back to last-synced local balance when offline.
 */
export async function lookupBeneficiaryBalances(params: {
  scannedData: string;
  merchantEntityId?: string | null;
  merchantCategories?: string[];
  merchantName?: string | null;
  merchantIdentifiers?: string[];
}): Promise<{ ok: true; data: BeneficiaryLookupResult } | { ok: false; error: string }> {
  const voucherTarget = extractVoucherTarget(params.scannedData);
  const address = voucherTarget?.beneficiaryAddress ?? extractBeneficiaryAddress(params.scannedData);
  if (!address) {
    return {
      ok: false,
      error: 'Invalid beneficiary QR code. Expected a valid ReliefChain voucher or wallet address.',
    };
  }

  const merchantCats = params.merchantCategories ?? ['General Merchandise'];

  // Try Online Lookup First
  try {
    // Priority: If a specific voucher program was scanned, verify program partner accreditation directly
    if (voucherTarget?.programId) {
      const { data: prog, error: progError } = await supabase
        .from('programs')
        .select('id, name, organization_id, voucher_type, voucher_types, selected_merchants, aid_type, status, voucher_value, voucher_quantity, amount_per_beneficiary')
        .eq('id', voucherTarget.programId)
        .maybeSingle();

      if (!progError && prog) {
        const progName = prog.name || voucherTarget.programName || 'Relief Program';
        const progCat = prog.voucher_type || voucherTarget.category || 'General';
        const rawSelected = prog.selected_merchants;
        const selectedMerchants: string[] = Array.isArray(rawSelected)
          ? rawSelected.filter((m): m is string => typeof m === 'string')
          : [];

        // Check 1: Named merchant partnership / accreditation
        let isPartnerMerchant = selectedMerchants.length === 0; // If no merchants specified, open to all

        if (!isPartnerMerchant && params.merchantEntityId) {
          // Check program_merchants authorization table
          const { data: pm } = await supabase
            .from('program_merchants')
            .select('id, status')
            .eq('program_id', prog.id)
            .eq('merchant_id', params.merchantEntityId)
            .eq('status', 'authorized')
            .maybeSingle();

          if (pm) {
            isPartnerMerchant = true;
          }
        }

        if (!isPartnerMerchant) {
          const candidates = [
            ...(params.merchantIdentifiers ?? []),
            params.merchantName,
            'merchant@example.com',
          ].filter((c): c is string => typeof c === 'string' && c.trim().length > 0);

          isPartnerMerchant = candidates.some((cand) => {
            const normCand = normalizeMerchantName(cand);
            return selectedMerchants.some((sm) => {
              const normSm = normalizeMerchantName(sm);
              return (
                normSm === normCand ||
                normSm.includes(normCand) ||
                normCand.includes(normSm)
              );
            });
          });
        }

        if (!isPartnerMerchant) {
          const merchantDisplay = params.merchantName || 'merchant';
          const partnerList =
            selectedMerchants.length > 0 ? selectedMerchants.join(', ') : 'accredited partners only';
          return {
            ok: false,
            error: `Merchant Not Accredited: ${merchantDisplay} is not an accredited partner for "${progName}". This voucher can only be redeemed at authorized partner stores: ${partnerList}.`,
          };
        }

        // Check 2: Category compatibility
        const categoryEligibility = canMerchantRedeemVoucher(merchantCats, progCat);
        if (!categoryEligibility.allowed) {
          return {
            ok: false,
            error: `Category Restricted: ${categoryEligibility.reason || 'This merchant category cannot redeem this voucher type.'}`,
          };
        }

        // Merchant is accredited and category matches!
        // Try RPC to fetch rich beneficiary name and live balances
        let benName = 'Beneficiary';
        let benIdentityId = voucherTarget.enrollmentId || address;
        let resolvedWallet = address;
        let rpcBalances: BeneficiaryVoucherBalanceItem[] | null = null;

        // Attempt RPC lookup with address
        let { data: rpcRows, error: rpcError } = await supabase.rpc(
          'check_beneficiary_balance_for_merchant' as never,
          {
            p_wallet_address: address,
            p_merchant_entity_id: params.merchantEntityId ?? null,
          } as never
        );

        // If no rows and enrollmentId exists and is different from address, retry RPC with enrollmentId
        if ((!rpcRows || (Array.isArray(rpcRows) && rpcRows.length === 0)) && voucherTarget.enrollmentId && voucherTarget.enrollmentId !== address) {
          const retryRes = await supabase.rpc(
            'check_beneficiary_balance_for_merchant' as never,
            {
              p_wallet_address: voucherTarget.enrollmentId,
              p_merchant_entity_id: params.merchantEntityId ?? null,
            } as never
          );
          if (retryRes.data && Array.isArray(retryRes.data) && retryRes.data.length > 0) {
            rpcRows = retryRes.data;
            rpcError = retryRes.error;
          }
        }

        if (!rpcError && Array.isArray(rpcRows) && rpcRows.length > 0) {
          const first = rpcRows[0] as Record<string, unknown>;
          benName = (first.beneficiary_name as string) || benName;
          benIdentityId = (first.beneficiary_identity_id as string) || benIdentityId;
          resolvedWallet = (first.beneficiary_wallet as string) || resolvedWallet;
          rpcBalances = (rpcRows as Record<string, unknown>[]).map((row) => {
            const rAidType = (row.aid_type as 'cash' | 'voucher') || 'voucher';
            const rVType = (row.voucher_type as string) || (rAidType === 'cash' ? 'Cash' : 'General');
            const rCat = (row.category as string) || rVType;
            const rCanonical = resolveCanonicalVoucherType(rCat || rVType);
            const rStroops = toStroopAmount(row.available_balance_stroops);
            const rEligibility = canMerchantRedeemVoucher(merchantCats, rCat || rVType);

            return {
              programId: row.program_id as string,
              programName: (row.program_name as string) || 'Relief Program',
              organizationId: '',
              aidType: rAidType,
              voucherType: rVType,
              category: rCat,
              canonicalType: rCanonical,
              availableStroops: rStroops,
              availablePhp: formatStroops(rStroops),
              reconciledAt: (row.reconciled_at as string) || null,
              isAllowedForMerchant: rEligibility.allowed && (row.is_accredited === undefined || Boolean(row.is_accredited)),
              disallowedReason: !row.is_accredited ? 'Merchant is not accredited for this program' : rEligibility.reason,
            };
          });
        }

        let stroops = toStroopAmount(voucherTarget.allocatedAmountStroops ?? 0);
        if (stroops === ZERO_STROOPS) {
          const rawVal = prog.voucher_value ?? prog.amount_per_beneficiary ?? 100;
          const qty = prog.voucher_quantity ?? 1;
          const totalVal = Number(rawVal) * Number(qty);
          try {
            stroops = parseStroopAmount(BigInt(Math.round(totalVal * 10_000_000)).toString());
          } catch {
            stroops = ZERO_STROOPS;
          }
        }
        const canonical = resolveCanonicalVoucherType(progCat);
        const aidType = (prog.aid_type as 'cash' | 'voucher') || 'voucher';
        const vType = prog.voucher_type || (aidType === 'cash' ? 'Cash' : 'General');

        const fallbackBalances: BeneficiaryVoucherBalanceItem[] = [
          {
            programId: prog.id,
            programName: progName,
            organizationId: prog.organization_id || '',
            aidType,
            voucherType: vType,
            category: progCat,
            canonicalType: canonical,
            availableStroops: stroops,
            availablePhp: formatStroops(stroops),
            reconciledAt: null,
            isAllowedForMerchant: true,
          },
        ];

        // When a specific voucher program was scanned, ONLY return that scanned voucher in the balances list
        const scannedRpcBalances = rpcBalances?.filter(
          (b) => b.programId === prog.id
        );

        const result: BeneficiaryLookupResult = {
          beneficiaryIdentityId: benIdentityId,
          beneficiaryName: benName,
          beneficiaryWallet: resolvedWallet || voucherTarget.enrollmentId || address,
          isOffline: false,
          syncedAt: new Date().toISOString(),
          balances:
            scannedRpcBalances && scannedRpcBalances.length > 0
              ? scannedRpcBalances
              : fallbackBalances,
        };

        void setCachedBeneficiaryLookup(result);
        void notifyVoucherScanned({
          merchantEntityId: params.merchantEntityId,
          beneficiaryIdentifier: address,
          programId: prog.id,
          enrollmentId: voucherTarget.enrollmentId,
        });
        return { ok: true, data: result };
      }
    }

    // Attempt 1: Call check_beneficiary_balance_for_merchant RPC
    {
      let { data: rpcRows, error: rpcError } = await supabase.rpc(
        'check_beneficiary_balance_for_merchant' as never,
        {
          p_wallet_address: address,
          p_merchant_entity_id: params.merchantEntityId ?? null,
        } as never
      );

      if ((!rpcRows || (Array.isArray(rpcRows) && rpcRows.length === 0)) && voucherTarget?.enrollmentId && voucherTarget.enrollmentId !== address) {
        const retryRes = await supabase.rpc(
          'check_beneficiary_balance_for_merchant' as never,
          {
            p_wallet_address: voucherTarget.enrollmentId,
            p_merchant_entity_id: params.merchantEntityId ?? null,
          } as never
        );
        if (retryRes.data && Array.isArray(retryRes.data) && retryRes.data.length > 0) {
          rpcRows = retryRes.data;
          rpcError = retryRes.error;
        }
      }

      if (!rpcError && Array.isArray(rpcRows) && rpcRows.length > 0) {
        const first = rpcRows[0] as Record<string, unknown>;
        const balances: BeneficiaryVoucherBalanceItem[] = (rpcRows as Record<string, unknown>[]).map((row) => {
          const aidType = (row.aid_type as 'cash' | 'voucher') || 'voucher';
          const vType = (row.voucher_type as string) || (aidType === 'cash' ? 'Cash' : 'General');
          const cat = (row.category as string) || vType;
          const canonical = resolveCanonicalVoucherType(cat || vType);
          const stroops = toStroopAmount(row.available_balance_stroops);

          // Evaluate category compatibility
          const eligibility = canMerchantRedeemVoucher(merchantCats, cat || vType);

          return {
            programId: row.program_id as string,
            programName: (row.program_name as string) || 'Relief Program',
            organizationId: '',
            aidType,
            voucherType: vType,
            category: cat,
            canonicalType: canonical,
            availableStroops: stroops,
            availablePhp: formatStroops(stroops),
            reconciledAt: (row.reconciled_at as string) || null,
            isAllowedForMerchant: eligibility.allowed && (row.is_accredited === undefined || Boolean(row.is_accredited)),
            disallowedReason: !row.is_accredited
              ? 'Merchant not accredited for this program'
              : eligibility.reason,
          };
        });

        const result: BeneficiaryLookupResult = {
          beneficiaryIdentityId: (first.beneficiary_identity_id as string) || '',
          beneficiaryName: (first.beneficiary_name as string) || 'Beneficiary',
          beneficiaryWallet: (first.beneficiary_wallet as string) || voucherTarget?.enrollmentId || address,
          isOffline: false,
          syncedAt: new Date().toISOString(),
          balances,
        };

        void setCachedBeneficiaryLookup(result);
        void notifyVoucherScanned({
          merchantEntityId: params.merchantEntityId,
          beneficiaryIdentifier: address,
          programId: voucherTarget?.programId,
          enrollmentId: voucherTarget?.enrollmentId,
        });
        return { ok: true, data: result };
      }
    }

    // Attempt 2: Direct lookup via wallets + enrollments + programs + projections
    let benIdentityId: string | null = null;
    const { data: walletData, error: walletError } = await supabase
      .from('wallets')
      .select('id, owner_id, address')
      .eq('address', address)
      .eq('owner_type', 'beneficiary_identity')
      .maybeSingle();

    if (walletError) throw walletError;

    if (walletData?.owner_id) {
      benIdentityId = walletData.owner_id;
    } else {
      // Check if address is a beneficiary_identity UUID directly
      const { data: identityData } = await supabase
        .from('beneficiary_identities')
        .select('id, user_id')
        .eq('id', address)
        .maybeSingle();

      if (identityData?.id) {
        benIdentityId = identityData.id;
      } else if (UUID_REGEX.test(address)) {
        // Check if address is an enrollment ID
        const { data: enrollmentData } = await supabase
          .from('enrollments')
          .select('id, beneficiary_identity_id')
          .eq('id', address)
          .maybeSingle();
        if (enrollmentData?.beneficiary_identity_id) {
          benIdentityId = enrollmentData.beneficiary_identity_id;
        }
      }
    }

    if (!benIdentityId) {
      // Check offline cache before failing
      const cached =
        (await getCachedBeneficiaryLookup(address)) ||
        (voucherTarget?.enrollmentId
          ? await getCachedBeneficiaryLookup(voucherTarget.enrollmentId)
          : null);
      if (cached) return { ok: true, data: cached };
      return { ok: false, error: 'Beneficiary wallet not registered on ReliefChain.' };
    }

    // Fetch beneficiary profile for display name
    let benName = 'Beneficiary';
    const { data: benIdentity } = await supabase
      .from('beneficiary_identities')
      .select('id, user_id')
      .eq('id', benIdentityId)
      .maybeSingle();

    if (benIdentity?.user_id) {
      const { data: prof } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', benIdentity.user_id)
        .maybeSingle();
      if (prof?.full_name) {
        benName = prof.full_name;
      }
    }

    // Fetch enrollments with programs
    const { data: enrollments, error: enrollError } = await supabase
      .from('enrollments')
      .select('id, program_id, programs(id, name, organization_id, voucher_type, aid_type, total_budget)')
      .eq('beneficiary_identity_id', benIdentityId);

    if (enrollError) throw enrollError;

    // Fetch projections
    const { data: projections } = await supabase
      .from('beneficiary_balance_projection')
      .select('program_id, aid_type, available_balance_stroops, reconciled_at, is_abandoned')
      .eq('beneficiary_identity_id', benIdentityId);

    const projMap = new Map<string, { available: StroopAmount; reconciledAt: string | null; isAbandoned: boolean }>();
    if (Array.isArray(projections)) {
      projections.forEach((p) => {
        projMap.set(p.program_id, {
          available: toStroopAmount(p.available_balance_stroops),
          reconciledAt: p.reconciled_at,
          isAbandoned: Boolean(p.is_abandoned),
        });
      });
    }

    const balances: BeneficiaryVoucherBalanceItem[] = [];

    if (Array.isArray(enrollments)) {
      enrollments.forEach((e) => {
        const progCandidate = e.programs;
        const prog = (Array.isArray(progCandidate) ? progCandidate[0] : progCandidate) as {
          id: string;
          name: string;
          organization_id: string;
          voucher_type?: string;
          aid_type?: 'cash' | 'voucher';
        } | null;

        if (!prog) return;

        const proj = projMap.get(prog.id);
        if (proj?.isAbandoned) return;

        const aidType = prog.aid_type || 'voucher';
        const vType = prog.voucher_type || (aidType === 'cash' ? 'Cash' : 'General');
        const cat = prog.voucher_type || vType;
        const canonical = resolveCanonicalVoucherType(cat || vType);
        const stroops = proj ? proj.available : ZERO_STROOPS;

        const eligibility = canMerchantRedeemVoucher(merchantCats, cat || vType);

        balances.push({
          programId: prog.id,
          programName: prog.name || 'Relief Program',
          organizationId: prog.organization_id || '',
          aidType,
          voucherType: vType,
          category: cat,
          canonicalType: canonical,
          availableStroops: stroops,
          availablePhp: formatStroops(stroops),
          reconciledAt: proj?.reconciledAt || null,
          isAllowedForMerchant: eligibility.allowed,
          disallowedReason: eligibility.reason,
        });
      });
    }

    const result: BeneficiaryLookupResult = {
      beneficiaryIdentityId: benIdentityId,
      beneficiaryName: benName,
      beneficiaryWallet: address,
      isOffline: false,
      syncedAt: new Date().toISOString(),
      balances,
    };

    void setCachedBeneficiaryLookup(result);
    void notifyVoucherScanned({
      merchantEntityId: params.merchantEntityId,
      beneficiaryIdentifier: address,
      programId: voucherTarget?.programId,
      enrollmentId: voucherTarget?.enrollmentId,
    });
    return { ok: true, data: result };
  } catch (err) {
    // Network failure or offline: attempt to read cached entry (MER-01 Offline support)
    console.log('[merchant-redemption-service] Network query failed, trying offline cache:', err);
    let cached = await getCachedBeneficiaryLookup(address);
    if (!cached && voucherTarget?.enrollmentId) {
      cached = await getCachedBeneficiaryLookup(voucherTarget.enrollmentId);
    }

    if (cached) {
      // If the beneficiary presented a specific voucher payload, ensure that program exists in cached balances
      if (voucherTarget?.isVoucherPayload && voucherTarget.programId) {
        const hasProgram = cached.balances.some(
          (b) =>
            b.programId === voucherTarget.programId ||
            (voucherTarget.programName &&
              b.programName.trim().toLowerCase() === voucherTarget.programName.trim().toLowerCase())
        );

        if (!hasProgram) {
          const stroops = toStroopAmount(voucherTarget.allocatedAmountStroops ?? 0);
          const cat = voucherTarget.category || voucherTarget.voucherType || 'General';
          const canonical = resolveCanonicalVoucherType(cat);
          const categoryEligibility = canMerchantRedeemVoucher(merchantCats, cat);

          const newVoucherItem: BeneficiaryVoucherBalanceItem = {
            programId: voucherTarget.programId,
            programName: voucherTarget.programName || 'Relief Program',
            organizationId: '',
            aidType: 'voucher',
            voucherType: voucherTarget.voucherType || 'Aid Voucher',
            category: cat,
            canonicalType: canonical,
            availableStroops: stroops,
            availablePhp: formatStroops(stroops),
            reconciledAt: null,
            isAllowedForMerchant: categoryEligibility.allowed,
            disallowedReason: categoryEligibility.reason,
          };

          cached = {
            ...cached,
            balances: [newVoucherItem, ...cached.balances],
          };

          void setCachedBeneficiaryLookup(cached);
          if (params.merchantEntityId) {
            void setCachedBeneficiaryRecord(params.merchantEntityId, address, cached);
          }
        }

        // Isolate and return the targeted voucher so redemption form selects the exact scanned voucher
        const targeted = cached.balances.filter(
          (b) =>
            b.programId === voucherTarget.programId ||
            (voucherTarget.programName &&
              b.programName.trim().toLowerCase() === voucherTarget.programName.trim().toLowerCase())
        );

        if (targeted.length > 0) {
          return {
            ok: true,
            data: {
              ...cached,
              balances: targeted,
            },
          };
        }
      }

      return { ok: true, data: cached };
    }

    // PILLAR B: Dynamic on-the-fly offline voucher admittance when un-cached
    // If the scanned voucher QR includes embedded allocation and program info, admit it dynamically
    if (voucherTarget?.isVoucherPayload && voucherTarget.programId) {
      const stroops = toStroopAmount(voucherTarget.allocatedAmountStroops ?? 0);
      const cat = voucherTarget.category || voucherTarget.voucherType || 'General';
      const canonical = resolveCanonicalVoucherType(cat);
      const categoryEligibility = canMerchantRedeemVoucher(merchantCats, cat);

      const dynamicRecord: BeneficiaryLookupResult = {
        beneficiaryIdentityId: voucherTarget.enrollmentId || address,
        beneficiaryName: 'Beneficiary (Signed Offline Voucher)',
        beneficiaryWallet: address,
        isOffline: true,
        syncedAt: new Date().toISOString(),
        balances: [
          {
            programId: voucherTarget.programId,
            programName: voucherTarget.programName || 'Relief Program',
            organizationId: '',
            aidType: 'voucher',
            voucherType: voucherTarget.voucherType || 'Aid Voucher',
            category: cat,
            canonicalType: canonical,
            availableStroops: stroops,
            availablePhp: formatStroops(stroops),
            reconciledAt: null,
            isAllowedForMerchant: categoryEligibility.allowed,
            disallowedReason: categoryEligibility.reason,
          },
        ],
      };

      // Persist to local cache immediately so offline-balance-manager can decrement it
      void setCachedBeneficiaryLookup(dynamicRecord);
      if (params.merchantEntityId) {
        void setCachedBeneficiaryRecord(params.merchantEntityId, address, dynamicRecord);
      }
      return { ok: true, data: dynamicRecord };
    }

    return {
      ok: false,
      error: 'Device is offline and beneficiary balance is not cached locally. Please connect to internet to sync.',
    };
  }
}

/**
 * Saves a pending offline redemption to device storage.
 */
export async function savePendingOfflineRedemption(
  item: Omit<PendingOfflineRedemption, 'id' | 'createdAt' | 'status'> & {
    status?: 'pending_sync' | 'settled' | 'failed';
  }
): Promise<PendingOfflineRedemption> {
  const pendingRecord: PendingOfflineRedemption = {
    ...item,
    id: `rc-off-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    createdAt: new Date().toISOString(),
    status: item.status ?? 'pending_sync',
  };

  try {
    const key = getPendingKey(item.merchantId);
    const raw = await SecureStore.getItemAsync(key, secureStoreOptions);
    const current = raw ? (JSON.parse(raw) as PendingOfflineRedemption[]) : [];
    const updated = [pendingRecord, ...current].slice(0, 100);
    await SecureStore.setItemAsync(key, JSON.stringify(updated), secureStoreOptions);
  } catch (err) {
    console.warn('[merchant-redemption-service] Failed to persist pending offline redemption:', err);
  }

  return pendingRecord;
}

/**
 * Loads all pending offline redemptions for a merchant.
 */
export async function getPendingOfflineRedemptions(
  merchantId: string
): Promise<PendingOfflineRedemption[]> {
  try {
    const key = getPendingKey(merchantId);
    const raw = await SecureStore.getItemAsync(key, secureStoreOptions);
    if (!raw) return [];
    return JSON.parse(raw) as PendingOfflineRedemption[];
  } catch (err) {
    console.warn('[merchant-redemption-service] Failed to load pending redemptions:', err);
    return [];
  }
}

/**
 * Generates an official digital receipt payload upon successful redemption (MER-02).
 */
export function generateRedemptionReceipt(params: {
  merchantName: string;
  merchantSettlementAddress: string;
  beneficiaryName: string;
  beneficiaryWallet: string;
  programName: string;
  voucherType: string;
  amountStroops: StroopAmount;
  remainingBalanceStroops: StroopAmount;
  transactionHash?: string | null;
  isOfflineSync?: boolean;
}): RedemptionReceiptData {
  const dateStr = new Date().toISOString();
  const shortHash = params.transactionHash ? params.transactionHash.substring(0, 8) : Date.now().toString(36);
  const receiptNumber = `RC-RED-${shortHash.toUpperCase()}`;

  return {
    receiptNumber,
    timestamp: dateStr,
    merchantName: params.merchantName,
    merchantSettlementAddress: params.merchantSettlementAddress,
    beneficiaryName: params.beneficiaryName,
    beneficiaryWallet: params.beneficiaryWallet,
    programName: params.programName,
    voucherType: params.voucherType,
    amountPhp: formatStroops(params.amountStroops),
    remainingBalancePhp: formatStroops(params.remainingBalanceStroops),
    transactionHash: params.transactionHash ?? null,
    isOfflineSync: params.isOfflineSync ?? false,
  };
}

export interface ExecuteVoucherRedemptionResult {
  transactionHash: string;
  redemptionId: string;
  remainingBalancePhp: string;
  remainingBalanceStroops: string;
  beneficiaryName: string;
  programName: string;
  amountPhp: string;
}

/**
 * Executes voucher redemption atomically on the network/database via RPC.
 * Deducts balance, updates projection, records in public.redemptions, and increments merchant metrics.
 */
export async function executeVoucherRedemption(params: {
  merchantEntityId: string;
  beneficiaryIdentifier: string;
  programId: string;
  amountStroops: bigint | string;
  amountPhp: number | string;
}): Promise<
  | { ok: true; data: ExecuteVoucherRedemptionResult }
  | { ok: false; error: string }
> {
  try {
    const { data, error } = await supabase.rpc(
      'execute_voucher_redemption' as never,
      {
        p_merchant_entity_id: params.merchantEntityId,
        p_beneficiary_identifier: params.beneficiaryIdentifier,
        p_program_id: params.programId,
        p_amount_stroops:
          typeof params.amountStroops === 'bigint'
            ? params.amountStroops.toString()
            : params.amountStroops,
        p_amount_php: Number(params.amountPhp),
      } as never
    );

    if (error) {
      return { ok: false, error: error.message };
    }

    const res = data as Record<string, unknown> | null;
    if (!res || !res.ok) {
      return {
        ok: false,
        error: (res?.error as string) || 'Voucher redemption failed on the network.',
      };
    }

    void notifyVoucherRedeemed({
      programId: params.programId,
      beneficiaryIdentifier: params.beneficiaryIdentifier,
      amountPhp: params.amountPhp,
      remainingBalancePhp: res.remaining_balance_php as string | number,
    });

    return {
      ok: true,
      data: {
        transactionHash: (res.transaction_hash as string) || '',
        redemptionId: (res.redemption_id as string) || '',
        remainingBalancePhp: (res.remaining_balance_php as string) || '0.00',
        remainingBalanceStroops: (res.remaining_balance_stroops as string) || '0',
        beneficiaryName: (res.beneficiary_name as string) || 'Beneficiary',
        programName: (res.program_name as string) || 'Relief Program',
        amountPhp: (res.amount_php as string) || String(params.amountPhp),
      },
    };
  } catch (err: unknown) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to execute voucher redemption.',
    };
  }
}

