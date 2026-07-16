// prepare-payment Edge Function.
//
// Validates: Requirements 10.6, 11.5, 11.6, 11.7, 12.2, 14.1, 18.4, 18.8

import {
  createEdgeServiceBinding,
  handleEdgeRequest,
  parseJsonBody,
  type EdgeRequestScope,
  createEdgeSignerRegistry,
  createEdgeTransactionProtocol,
} from '../_shared/edge.ts';
import { FinancialErrorException } from '../_shared/errors.ts';
import { jsonResponse } from '../_shared/response.ts';
import { serveEdge } from '../_shared/runtime.ts';
import {
  parseInvoiceObject,
  assertVerifiedInvoice,
  assertNotExpired,
  computeInvoiceId,
  canonicalInvoiceBytes,
  type InvoiceV1,
} from '../_shared/stellar/invoice.ts';
import {
  createMerchantPayment,
  createMerchantPaymentStrategy,
  makeMerchantPaymentKey,
} from '../_shared/stellar/merchant-payment.ts';
import { createCashReconcilerBundle } from '../_shared/edge-cash-reconciler.ts';

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
  let parsedInvoice: InvoiceV1;
  try {
    parsedInvoice = parseInvoiceObject(body.invoice);
    assertVerifiedInvoice(parsedInvoice);
    assertNotExpired(parsedInvoice);
  } catch (error) {
    throw FinancialErrorException.of('validation_failed', `Invoice validation failed: ${(error as Error).message}`, { correlationId });
  }

  const binding = createEdgeServiceBinding(context, correlationId);
  const service = binding.serviceClient;

  // 2. Resolve caller beneficiary identity and active verified wallet
  const { data: identity, error: identityError } = await service
    .from('beneficiary_identities')
    .select('id')
    .eq('user_id', session.userId)
    .maybeSingle();

  console.log('debug prepare-payment:', { userId: session.userId, identity, identityError });

  if (identityError || !identity) {
    throw FinancialErrorException.of('authorization_failed', 'No beneficiary identity is linked to this account.', { correlationId });
  }

  // Get organization_id via the beneficiary's enrollment
  const { data: enrollment, error: enrollmentError } = await service
    .from('enrollments')
    .select('program_id')
    .eq('beneficiary_identity_id', identity.id)
    .limit(1)
    .maybeSingle();

  if (enrollmentError || !enrollment) {
    throw FinancialErrorException.of('validation_failed', 'Beneficiary is not enrolled in any program.', { correlationId });
  }

  const { data: program, error: programError } = await service
    .from('programs')
    .select('organization_id')
    .eq('id', enrollment.program_id)
    .maybeSingle();

  if (programError || !program) {
    throw FinancialErrorException.of('validation_failed', 'Associated program not found.', { correlationId });
  }

  const organizationId = program.organization_id;

  const { data: beneficiaryWallet, error: walletError } = await service
    .from('wallets')
    .select('id, address')
    .eq('owner_type', 'beneficiary_identity')
    .eq('owner_id', identity.id)
    .eq('purpose', 'beneficiary')
    .eq('verification_status', 'verified')
    .eq('is_active', true)
    .eq('network', 'stellar_testnet')
    .maybeSingle();

  if (walletError || !beneficiaryWallet || !STELLAR_ACCOUNT.test(beneficiaryWallet.address)) {
    throw FinancialErrorException.of('validation_failed', 'Beneficiary has no active verified wallet.', { correlationId });
  }

  // 3. Resolve merchant and active verified settlement wallet
  const { data: accreditation, error: accreditationError } = await service
    .from('merchant_accreditations')
    .select('id')
    .eq('merchant_id', parsedInvoice.merchantId)
    .eq('organization_id', organizationId)
    .eq('status', 'active')
    .lte('valid_from', parsedInvoice.issuedAt)
    .gte('valid_until', parsedInvoice.issuedAt)
    .maybeSingle();

  if (accreditationError || !accreditation) {
    throw FinancialErrorException.of('validation_failed', 'Merchant is not active or accredited for this organization.', { correlationId });
  }

  const { data: merchantWallet, error: merchantWalletError } = await service
    .from('wallets')
    .select('id, address')
    .eq('owner_type', 'merchant_entity')
    .eq('owner_id', parsedInvoice.merchantId)
    .eq('purpose', 'merchant_settlement')
    .eq('verification_status', 'verified')
    .eq('is_active', true)
    .eq('network', 'stellar_testnet')
    .maybeSingle();

  if (merchantWalletError || !merchantWallet || !STELLAR_ACCOUNT.test(merchantWallet.address)) {
    throw FinancialErrorException.of('validation_failed', 'Merchant has no active verified settlement wallet.', { correlationId });
  }

  if (merchantWallet.address !== parsedInvoice.settlementWallet) {
    throw FinancialErrorException.of('validation_failed', 'Invoice settlement wallet does not match merchant verified wallet.', { correlationId });
  }

  // 4. Insert or get existing invoice row
  let dbInvoiceId = '';
  const { data: existingInvoice } = await service
    .from('invoices')
    .select('id, status')
    .eq('merchant_id', parsedInvoice.merchantId)
    .eq('nonce', parsedInvoice.nonce)
    .maybeSingle();

  if (existingInvoice) {
    dbInvoiceId = existingInvoice.id;
  } else {
    const canonicalBytes = canonicalInvoiceBytes(parsedInvoice);
    const canonicalHex = '\\x' + toHex(canonicalBytes);
    const sigBytes = base64ToBytes(parsedInvoice.merchantSignature);
    const sigHex = '\\x' + toHex(sigBytes);

    const generatedId = crypto.randomUUID();
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
      throw FinancialErrorException.of('dependency_unavailable', `Unable to insert invoice: ${insertInvoiceError.message}`, { correlationId });
    }
    dbInvoiceId = generatedId;
  }

  // 5. Initialize the orchestrator and call prepare
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

serveEdge((request) => handleEdgeRequest(request, preparePayment));
