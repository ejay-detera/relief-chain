// prepare-payment Edge Function.
//
// Validates: Requirements 10.6, 11.5, 11.6, 11.7, 12.2, 14.1, 18.4, 18.8

import { createCashReconcilerBundle } from '../_shared/edge-cash-reconciler.ts';
import {
    createEdgeServiceBinding,
    createEdgeSignerRegistry,
    createEdgeTransactionProtocol,
    handleEdgeRequest,
    parseJsonBody,
    type EdgeRequestScope,
} from '../_shared/edge.ts';
import { FinancialErrorException } from '../_shared/errors.ts';
import { jsonResponse } from '../_shared/response.ts';
import { serveEdge } from '../_shared/runtime.ts';
import {
    assertNotExpired,
    assertVerifiedInvoice,
    canonicalInvoiceBytes,
    computeInvoiceId,
    parseInvoiceObject,
    type InvoiceV1,
} from '../_shared/stellar/invoice.ts';
import {
    createMerchantPayment,
    createMerchantPaymentStrategy,
    makeMerchantPaymentKey,
} from '../_shared/stellar/merchant-payment.ts';

interface PaymentPrepareBody {
  readonly invoice?: unknown;
  readonly fundingSourceId?: unknown;
  readonly fundingSourceKind?: unknown;
}

const STELLAR_ACCOUNT = /^G[A-Z2-7]{55}$/;

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

const base64ToBytes = (value: string): Uint8Array => {
  const clean = value.replace(/=+$/g, '').replace(/-/g, '+').replace(/_/g, '/');
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const index: Record<string, number> = {};
  for (let i = 0; i < chars.length; i += 1) {
    index[chars.charAt(i)] = i;
  }
  const out: number[] = [];
  for (let i = 0; i < clean.length; i += 4) {
    const c0 = index[clean.charAt(i)];
    const c1 = index[clean.charAt(i + 1)];
    if (c0 === undefined || c1 === undefined) {
      throw new Error('Invalid base64 characters');
    }
    out.push((c0 << 2) | (c1 >> 4));
    const c2 = i + 2 < clean.length ? index[clean.charAt(i + 2)] : undefined;
    if (c2 !== undefined) {
      out.push(((c1 & 0x0f) << 4) | (c2 >> 2));
      const c3 = i + 3 < clean.length ? index[clean.charAt(i + 3)] : undefined;
      if (c3 !== undefined) {
        out.push(((c2 & 0x03) << 6) | c3);
      }
    }
  }
  return new Uint8Array(out);
};

const preparePayment = async (scope: EdgeRequestScope): Promise<Response> => {
  const { request, context, session, correlationId } = scope;
  const body = await parseJsonBody<PaymentPrepareBody>(request);

  if (!body.invoice || !isRecord(body.invoice)) {
    throw FinancialErrorException.of('validation_failed', 'An invoice object is required.', { correlationId });
  }
  const fundingSourceId = typeof body.fundingSourceId === 'string' ? body.fundingSourceId : '';
  const fundingSourceKind = typeof body.fundingSourceKind === 'string' ? body.fundingSourceKind : '';

  if (!fundingSourceId || !fundingSourceKind) {
    throw FinancialErrorException.of('validation_failed', 'fundingSourceId and fundingSourceKind are required.', { correlationId });
  }

  if (fundingSourceKind !== 'cash') {
    throw FinancialErrorException.of('validation_failed', 'Only cash funding source is supported in MVP.', { correlationId });
  }

  // 1. Decode & verify invoice
  console.log('[prepare-payment] Parsing invoice object');
  console.log('[prepare-payment] Invoice body asset:', JSON.stringify((body.invoice as any)?.asset));
  let parsedInvoice: InvoiceV1;
  try {
    parsedInvoice = parseInvoiceObject(body.invoice);
    console.log('[prepare-payment] Invoice parsed successfully');
    console.log('[prepare-payment] Parsed invoice asset:', JSON.stringify(parsedInvoice.asset));
    assertVerifiedInvoice(parsedInvoice);
    console.log('[prepare-payment] Invoice signature verified');
    assertNotExpired(parsedInvoice);
    console.log('[prepare-payment] Invoice not expired');
  } catch (error) {
    console.error('[prepare-payment] Invoice validation error:', error);
    throw FinancialErrorException.of('validation_failed', `Invoice validation failed: ${(error as Error).message}`, { correlationId });
  }

  const binding = createEdgeServiceBinding(context, correlationId);
  const service = binding.serviceClient;

  // 2. Resolve beneficiary identity and wallet
  console.log('[prepare-payment] Looking up beneficiary identity for user:', session.userId);
  const { data: identity, error: identityError } = await service
    .from('beneficiary_identities')
    .select('id')
    .eq('user_id', session.userId)
    .maybeSingle();

  if (identityError) {
    console.log('[prepare-payment] Beneficiary identity lookup error:', identityError);
    throw FinancialErrorException.of('authorization_failed', `Database error: ${identityError.message}`, { correlationId });
  }
  if (!identity) {
    console.log('[prepare-payment] No beneficiary identity found for user');
    throw FinancialErrorException.of('authorization_failed', 'No beneficiary identity is linked to this account.', { correlationId });
  }
  console.log('[prepare-payment] Found beneficiary identity:', identity.id);

  // Batch fetch enrollment + program + beneficiary wallet in parallel
  console.log('[prepare-payment] Fetching enrollment and beneficiary wallet for identity:', identity.id);
  const [enrollmentResult, walletResult] = await Promise.all([
    service
      .from('enrollments')
      .select('program_id, programs!inner(organization_id)')
      .eq('beneficiary_identity_id', identity.id)
      .limit(1)
      .maybeSingle(),
    service
      .from('wallets')
      .select('id, address')
      .eq('owner_type', 'beneficiary_identity')
      .eq('owner_id', identity.id)
      .eq('purpose', 'beneficiary')
      .eq('verification_status', 'verified')
      .eq('is_active', true)
      .eq('network', 'stellar_testnet')
      .maybeSingle()
  ]);

  const { data: enrollment, error: enrollmentError } = enrollmentResult;
  const { data: beneficiaryWallet, error: walletError } = walletResult;

  if (enrollmentError) {
    console.log('[prepare-payment] Enrollment lookup error:', enrollmentError);
    throw FinancialErrorException.of('validation_failed', `Enrollment error: ${enrollmentError.message}`, { correlationId });
  }
  if (!enrollment) {
    console.log('[prepare-payment] No enrollment found for beneficiary');
    throw FinancialErrorException.of('validation_failed', 'Beneficiary is not enrolled in any program.', { correlationId });
  }
  console.log('[prepare-payment] Found enrollment, program_id:', enrollment.program_id);

  if (walletError) {
    console.log('[prepare-payment] Beneficiary wallet lookup error:', walletError);
    throw FinancialErrorException.of('validation_failed', `Wallet error: ${walletError.message}`, { correlationId });
  }
  if (!beneficiaryWallet || !STELLAR_ACCOUNT.test(beneficiaryWallet.address)) {
    console.log('[prepare-payment] No beneficiary wallet found or invalid address:', beneficiaryWallet?.address);
    throw FinancialErrorException.of('validation_failed', 'Beneficiary has no active verified wallet.', { correlationId });
  }
  console.log('[prepare-payment] Found beneficiary wallet:', beneficiaryWallet.address);

  const program = enrollment.programs;
  if (!program || typeof program !== 'object' || !program.organization_id) {
    throw FinancialErrorException.of('validation_failed', 'Associated program not found.', { correlationId });
  }

  const organizationId = program.organization_id;
  const beneficiaryIdentityId = identity.id;

  // 3. Batch fetch merchant accreditation + wallet in parallel
  console.log('[prepare-payment] Fetching merchant accreditation and wallet for merchant:', parsedInvoice.merchantId);
  const [accreditationResult, merchantWalletResult] = await Promise.all([
    service
      .from('merchant_accreditations')
      .select('id')
      .eq('merchant_id', parsedInvoice.merchantId)
      .eq('organization_id', organizationId)
      .eq('status', 'active')
      .lte('valid_from', parsedInvoice.issuedAt)
      .gte('valid_until', parsedInvoice.issuedAt)
      .maybeSingle(),
    service
      .from('wallets')
      .select('id, address')
      .eq('owner_type', 'merchant_entity')
      .eq('owner_id', parsedInvoice.merchantId)
      .eq('purpose', 'merchant_settlement')
      .eq('verification_status', 'verified')
      .eq('is_active', true)
      .eq('network', 'stellar_testnet')
      .maybeSingle()
  ]);

  const { data: accreditation, error: accreditationError } = accreditationResult;
  const { data: merchantWallet, error: merchantWalletError } = merchantWalletResult;

  if (accreditationError) {
    console.log('[prepare-payment] Merchant accreditation lookup error:', accreditationError);
    throw FinancialErrorException.of('validation_failed', `Accreditation error: ${accreditationError.message}`, { correlationId });
  }
  if (!accreditation) {
    console.log('[prepare-payment] No merchant accreditation found for merchant:', parsedInvoice.merchantId, 'org:', organizationId);
    throw FinancialErrorException.of('validation_failed', 'Merchant is not active or accredited for this organization.', { correlationId });
  }
  console.log('[prepare-payment] Found merchant accreditation:', accreditation.id);

  if (merchantWalletError) {
    console.log('[prepare-payment] Merchant wallet lookup error:', merchantWalletError);
    throw FinancialErrorException.of('validation_failed', `Merchant wallet error: ${merchantWalletError.message}`, { correlationId });
  }
  if (!merchantWallet || !STELLAR_ACCOUNT.test(merchantWallet.address)) {
    console.log('[prepare-payment] No merchant wallet found or invalid address. Merchant:', parsedInvoice.merchantId, 'Wallet:', merchantWallet?.address);
    throw FinancialErrorException.of('validation_failed', 'Merchant has no active verified settlement wallet.', { correlationId });
  }
  console.log('[prepare-payment] Found merchant wallet:', merchantWallet.address, 'Invoice settlement wallet:', parsedInvoice.settlementWallet);

  if (merchantWallet.address !== parsedInvoice.settlementWallet) {
    console.log('[prepare-payment] Wallet mismatch! DB:', merchantWallet.address, 'Invoice:', parsedInvoice.settlementWallet);
    throw FinancialErrorException.of('validation_failed', 'Invoice settlement wallet does not match merchant verified wallet.', { correlationId });
  }

  // 4. Check/insert invoice and payment intent atomically
  console.log('[prepare-payment] Checking for existing invoice. Merchant:', parsedInvoice.merchantId, 'Nonce:', parsedInvoice.nonce);
  let dbInvoiceId = '';
  const { data: existingInvoice } = await service
    .from('invoices')
    .select('id, status')
    .eq('merchant_id', parsedInvoice.merchantId)
    .eq('nonce', parsedInvoice.nonce)
    .maybeSingle();

  if (existingInvoice) {
    console.log('[prepare-payment] Found existing invoice:', existingInvoice.id);
    dbInvoiceId = existingInvoice.id;
  } else {
    console.log('[prepare-payment] No existing invoice, creating new one');
    console.log('[prepare-payment] Asset code to insert:', parsedInvoice.asset.code);
    console.log('[prepare-payment] Asset code length:', parsedInvoice.asset.code.length);
    console.log('[prepare-payment] Asset code type:', typeof parsedInvoice.asset.code);
    console.log('[prepare-payment] Asset issuer:', parsedInvoice.asset.issuer);
    console.log('[prepare-payment] Asset SAC:', parsedInvoice.asset.sacAddress);
    
    const canonicalBytes = canonicalInvoiceBytes(parsedInvoice);
    const canonicalHex = '\\x' + toHex(canonicalBytes);
    const sigBytes = base64ToBytes(parsedInvoice.merchantSignature);
    const sigHex = '\\x' + toHex(sigBytes);

    const generatedId = crypto.randomUUID();
    console.log('[prepare-payment] Inserting invoice into database with ID:', generatedId);
    const { error: insertInvoiceError } = await service
      .from('invoices')
      .insert({
        id: generatedId,
        organization_id: organizationId,
        merchant_id: parsedInvoice.merchantId,
        program_id: null,
        settlement_wallet_id: merchantWallet.id,
        kind: parsedInvoice.kind,
        network: 'stellar_testnet',
        asset_code: parsedInvoice.asset.code,
        asset_issuer: parsedInvoice.asset.issuer,
        asset_sac_address: parsedInvoice.asset.sacAddress,
        settlement_address: parsedInvoice.settlementWallet,
        invoice_signer_address: parsedInvoice.invoiceSigner,
        amount_stroops: Number(parsedInvoice.amountStroops),
        nonce: parsedInvoice.nonce,
        canonical_payload: canonicalHex,
        payload_hash: computeInvoiceId(parsedInvoice),
        merchant_signature: sigHex,
        receipt_digest: parsedInvoice.receiptDigest ?? null,
        issued_at: parsedInvoice.issuedAt,
        expires_at: parsedInvoice.expiresAt,
        status: 'issued',
      });

    if (insertInvoiceError) {
      console.log('[prepare-payment] Failed to insert invoice:', insertInvoiceError);
      console.log('[prepare-payment] Error message:', insertInvoiceError.message);
      console.log('[prepare-payment] Error details:', JSON.stringify(insertInvoiceError.details));
      console.log('[prepare-payment] Error hint:', insertInvoiceError.hint);
      throw FinancialErrorException.of('dependency_unavailable', `Unable to insert invoice: ${insertInvoiceError.message}`, { correlationId });
    }
    console.log('[prepare-payment] Created new invoice:', generatedId);
    dbInvoiceId = generatedId;
  }

  // 5. Initialize the orchestrator and call prepare
  console.log('[prepare-payment] Initializing payment orchestrator');
  const reconciler = createCashReconcilerBundle(context, binding, correlationId);
  const protocol = createEdgeTransactionProtocol(context, {
    service: binding,
    correlationId,
    reconciler: reconciler.worker,
  });

  const paymentOrchestrator = createMerchantPayment({
    protocol,
    strategy: createMerchantPaymentStrategy({ horizon: reconciler.horizon }),
    config: context.stellar,
    signers: createEdgeSignerRegistry(),
  });

  console.log('[prepare-payment] Calling paymentOrchestrator.prepare()');
  const prepared = await paymentOrchestrator.prepare({
    organizationId,
    programId: null,
    invoiceId: computeInvoiceId(parsedInvoice),
    beneficiaryIdentityId: identity.id,
    beneficiaryWallet: beneficiaryWallet.address,
    merchantSettlementWallet: merchantWallet.address,
    amountStroops: Number(parsedInvoice.amountStroops),
    correlationId,
    requestedBy: session.userId,
  });
  console.log('[prepare-payment] paymentOrchestrator.prepare() completed. isReplay:', prepared.isReplay, 'intentId:', prepared.intent.id);

  // 6. Insert payment_intents row if not a replay and doesn't exist
  if (!prepared.isReplay && prepared.intent) {
    const { data: existingIntent } = await service
      .from('payment_intents')
      .select('id')
      .eq('financial_intent_id', prepared.intent.id)
      .maybeSingle();

    if (!existingIntent) {
      const idempotencyKey = makeMerchantPaymentKey(computeInvoiceId(parsedInvoice));
      const { error: insertIntentError } = await service
        .from('payment_intents')
        .insert({
          id: crypto.randomUUID(),
          financial_intent_id: prepared.intent.id,
          organization_id: organizationId,
          invoice_id: dbInvoiceId,
          program_id: null,
          beneficiary_identity_id: identity.id,
          beneficiary_wallet_id: beneficiaryWallet.id,
          merchant_id: parsedInvoice.merchantId,
          settlement_wallet_id: merchantWallet.id,
          enrollment_id: null,
          funding_source: 'cash',
          amount_stroops: Number(parsedInvoice.amountStroops),
          idempotency_key: idempotencyKey,
          payload_hash: prepared.intent.payload_hash,
          status: 'requested',
          correlation_id: correlationId,
        });

      if (insertIntentError) {
        throw FinancialErrorException.of('dependency_unavailable', `Unable to insert payment intent: ${insertIntentError.message}`, { correlationId });
      }

      // Now update payment intent status to 'prepared'
      const { error: updateIntentError } = await service
        .from('payment_intents')
        .update({ status: 'prepared' })
        .eq('financial_intent_id', prepared.intent.id)
        .eq('status', 'requested');

      if (updateIntentError) {
        throw FinancialErrorException.of('dependency_unavailable', `Unable to update payment intent: ${updateIntentError.message}`, { correlationId });
      }
    }
  }

  const response = {
    payment: {
      intentId: prepared.intent.id,
      attemptId: prepared.attempt?.id ?? null,
      amountStroops: String(parsedInvoice.amountStroops),
      expectedSigner: beneficiaryWallet.address,
      signingPackage: prepared.signingPackage ?? null,
      isReplay: prepared.isReplay,
    },
  };

  return jsonResponse(response, 200, correlationId);
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

serveEdge((request) => handleEdgeRequest(request, preparePayment));
