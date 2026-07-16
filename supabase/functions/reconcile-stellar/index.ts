// reconcile-stellar Edge Function (cash rail).
//
// Observes either a distribution job's or a merchant's in-flight transaction
// attempts on the guarded testnet Horizon and reconciles them.
// Confirmation comes ONLY from matching ledger evidence — never from a
// submission response.
//
// Body: { jobId } or { merchantId, organizationId }
//
// Validates: Requirements 6.4, 8.6, 8.7, 18.1, 18.5, 18.6, 18.8

import { requireOrganizationRole } from '../_shared/auth.ts';
import { createCashReconcilerBundle, createHorizonCashLookup } from '../_shared/edge-cash-reconciler.ts';
import {
  createEdgeServiceBinding,
  handleEdgeRequest,
  parseJsonBody,
  type EdgeRequestScope,
} from '../_shared/edge.ts';
import { FinancialErrorException } from '../_shared/errors.ts';
import { jsonResponse } from '../_shared/response.ts';
import { serveEdge } from '../_shared/runtime.ts';
import {
  buildBeneficiaryCashBalanceRow,
  createCashDistributionReconciler,
  createMerchantSettlementProjector,
  buildMerchantCashBalanceRow,
  type MerchantPaymentStore,
  createCashTransactionObserver,
} from '../_shared/stellar/cash-reconciliation.ts';
import { requireRCPHPIdentifiers } from '../_shared/stellar/config.ts';
import {
  createServiceProjectionWriter,
  createReconciliationWorker,
  createServiceEvidenceStore,
  createServiceReconciliationStores,
  createServiceCursorGateway,
  createServiceIssueGateway,
} from '../_shared/stellar/reconciliation.ts';
import type { OrganizationRole } from '../_shared/tenant-authorization.ts';

interface ReconcileBody {
  readonly jobId?: unknown;
  readonly merchantId?: unknown;
  readonly organizationId?: unknown;
}

const ALLOWED_ROLES: readonly OrganizationRole[] = [
  'organization_administrator',
  'finance_approver',
  'program_manager',
  'auditor',
];

const reconcileStellar = async (scope: EdgeRequestScope): Promise<Response> => {
  const { request, context, session, correlationId } = scope;
  const body = await parseJsonBody<ReconcileBody>(request);

  const jobId = typeof body.jobId === 'string' ? body.jobId : '';
  const merchantId = typeof body.merchantId === 'string' ? body.merchantId : '';
  const bodyOrgId = typeof body.organizationId === 'string' ? body.organizationId : '';

  if (!jobId && !merchantId) {
    throw FinancialErrorException.of('validation_failed', 'Either a jobId or a merchantId is required.', { correlationId });
  }

  const binding = createEdgeServiceBinding(context, correlationId);
  const service = binding.serviceClient;

  if (jobId) {
    // -------------------------------------------------------------------------
    // 1. Reconcile Distribution Job
    // -------------------------------------------------------------------------
    const { data: job, error: jobError } = await service
      .from('distribution_jobs')
      .select('id, organization_id, program_id, total_amount_stroops')
      .eq('id', jobId)
      .maybeSingle();
    if (jobError || !job) {
      throw FinancialErrorException.of('validation_failed', 'The distribution job was not found.', { correlationId });
    }
    await requireOrganizationRole(service, session, job.organization_id, ALLOWED_ROLES);

    // The in-flight attempts for this job's recipients.
    const { data: attempts, error: attemptsError } = await service
      .from('transaction_attempts')
      .select('*')
      .eq('distribution_job_id', jobId)
      .in('status', ['submitted', 'unknown']);
    if (attemptsError) {
      throw FinancialErrorException.of('dependency_unavailable', 'Unable to load in-flight attempts.', {
        correlationId,
        retryable: true,
      });
    }

    const bundle = createCashReconcilerBundle(context, binding, correlationId);
    const reconciler = createCashDistributionReconciler({
      worker: bundle.worker,
      recipients: bundle.recipients,
      intents: {
        loadIntent: async (intentId) => {
          const { data } = await service.from('financial_intents').select('*').eq('id', intentId).maybeSingle();
          return data ?? null;
        },
      },
      projections: createServiceProjectionWriter(binding.serviceWriter),
      runReader: {
        load: async (runId) => {
          const { data } = await service.from('reconciliation_runs').select('*').eq('id', runId).maybeSingle();
          return data ?? null;
        },
      },
    });

    const result = await reconciler.reconcileJob({
      jobId,
      organizationId: job.organization_id,
      programId: job.program_id,
      totalAmountStroops: Number(job.total_amount_stroops),
      attempts: attempts ?? [],
      correlationId,
    });

    // Write the reconciled beneficiary cash-balance projection for each beneficiary
    // whose transfer this job confirmed.
    let beneficiaryProjectionsWritten = 0;
    const { data: runRow } = await service
      .from('reconciliation_runs')
      .select('id, completed_at, end_ledger_sequence')
      .eq('id', result.summary.run.id)
      .maybeSingle();

    if (runRow?.completed_at && runRow.end_ledger_sequence && runRow.end_ledger_sequence > 0) {
      const rcphp = requireRCPHPIdentifiers(context.stellar);
      const runStatus = result.summary.status === 'completed' ? 'completed' : 'partial';
      const projectionWriter = createServiceProjectionWriter(binding.serviceWriter);

      const { data: confirmedRecipients } = await service
        .from('distribution_recipients')
        .select('beneficiary_identity_id')
        .eq('distribution_job_id', jobId)
        .eq('status', 'confirmed');

      const seen = new Set<string>();
      for (const recipient of confirmedRecipients ?? []) {
        const identityId = recipient.beneficiary_identity_id;
        if (seen.has(identityId)) continue;
        seen.add(identityId);

        // Confirmed cash distributed to this beneficiary across the whole program.
        const { data: distributed } = await service
          .from('distribution_recipients')
          .select('amount_stroops')
          .eq('program_id', job.program_id)
          .eq('beneficiary_identity_id', identityId)
          .eq('status', 'confirmed');
        const distributedStroops = (distributed ?? []).reduce((sum, row) => sum + row.amount_stroops, 0);
        const confirmedTransactionCount = (distributed ?? []).length;

        const { data: enrollment } = await service
          .from('enrollments')
          .select('allocation_amount_stroops')
          .eq('program_id', job.program_id)
          .eq('beneficiary_identity_id', identityId)
          .maybeSingle();
        const allocatedStroops = enrollment?.allocation_amount_stroops ?? distributedStroops;

        const { data: existing } = await service
          .from('beneficiary_balance_projection')
          .select('projection_version')
          .eq('organization_id', job.organization_id)
          .eq('program_id', job.program_id)
          .eq('beneficiary_identity_id', identityId)
          .eq('asset_code', rcphp.code)
          .maybeSingle();

        const row = buildBeneficiaryCashBalanceRow({
          organizationId: job.organization_id,
          programId: job.program_id,
          beneficiaryIdentityId: identityId,
          assetCode: rcphp.code,
          assetIssuer: rcphp.issuer,
          allocatedStroops,
          distributedStroops,
          confirmedTransactionCount,
          reconciliationRunId: runRow.id,
          asOfLedger: runRow.end_ledger_sequence,
          reconciledAt: runRow.completed_at,
          network: 'stellar_testnet',
          runStatus,
          projectionVersion: (existing?.projection_version ?? 0) + 1,
        });
        await projectionWriter.write([
          {
            table: 'beneficiary_balance_projection',
            rows: row,
            onConflict: 'organization_id,program_id,beneficiary_identity_id,asset_code',
          },
        ]);
        beneficiaryProjectionsWritten += 1;
      }
    }

    return jsonResponse(
      {
        jobStatus: result.jobStatus,
        counts: result.counts,
        confirmedAmountStroops: String(result.confirmedAmountStroops),
        failedAmountStroops: String(result.failedAmountStroops),
        failedRecipientIds: result.failedRecipientIds,
        projectionWritten: result.projectionWritten,
        beneficiaryProjectionsWritten,
      },
      200,
      correlationId,
    );
  } else {
    // -------------------------------------------------------------------------
    // 2. Reconcile Merchant Settlement
    // -------------------------------------------------------------------------
    const { data: merchant, error: merchantError } = await service
      .from('merchant_entities')
      .select('id, profile_id')
      .eq('id', merchantId)
      .maybeSingle();

    if (merchantError || !merchant) {
      throw FinancialErrorException.of('validation_failed', 'The merchant entity was not found.', { correlationId });
    }

    let organizationId = bodyOrgId;
    if (!organizationId) {
      const { data: accreditations } = await service
        .from('merchant_accreditations')
        .select('organization_id')
        .eq('merchant_id', merchantId)
        .eq('status', 'active')
        .limit(1);
      organizationId = accreditations?.[0]?.organization_id ?? '';
    }

    if (!organizationId) {
      throw FinancialErrorException.of('validation_failed', 'Could not resolve organizationId for the merchant.', { correlationId });
    }

    // Authorize
    let isMerchantSelf = merchant.profile_id === session.userId;
    if (!isMerchantSelf) {
      await requireOrganizationRole(service, session, organizationId, ALLOWED_ROLES);
    }

    // Fetch in-flight payment intents for this merchant & organization
    const { data: intents, error: intentsError } = await service
      .from('payment_intents')
      .select('financial_intent_id')
      .eq('merchant_id', merchantId)
      .eq('organization_id', organizationId)
      .eq('status', 'submitted');

    if (intentsError) {
      throw FinancialErrorException.of('dependency_unavailable', 'Unable to load payment intents.', { correlationId });
    }

    const intentIds = (intents ?? []).map((x) => x.financial_intent_id);
    let attempts: any[] = [];
    if (intentIds.length > 0) {
      const { data: attemptsData, error: attemptsError } = await service
        .from('transaction_attempts')
        .select('*')
        .in('financial_intent_id', intentIds)
        .in('status', ['submitted', 'unknown']);
      if (attemptsError) {
        throw FinancialErrorException.of('dependency_unavailable', 'Unable to load transaction attempts.', { correlationId });
      }
      attempts = attemptsData ?? [];
    }

    const horizon = createCashReconcilerBundle(context, binding, correlationId).horizon;
    const observer = createCashTransactionObserver({
      config: context.stellar,
      guard: context.guard,
      lookup: createHorizonCashLookup(horizon),
    });

    const merchantPaymentStore: MerchantPaymentStore = {
      async confirmPayment(params) {
        const { error } = await service
          .from('payment_intents')
          .update({
            status: 'confirmed',
            confirmed_ledger: params.confirmedLedger,
            confirmed_at: new Date().toISOString(),
            transaction_hash: params.transactionHash,
            ledger_transaction_id: params.ledgerTransactionId,
          })
          .eq('id', params.paymentIntentId)
          .eq('status', 'submitted');
        if (error) {
          throw new Error(`Unable to confirm payment intent: ${error.message}`);
        }
      },
      async insertSettlement(params) {
        const { error } = await service
          .from('settlements')
          .insert({
            id: crypto.randomUUID(),
            organization_id: params.organizationId,
            payment_intent_id: params.paymentIntentId,
            program_id: null,
            merchant_id: params.merchantId,
            settlement_wallet_id: params.settlementWalletId,
            kind: 'cash_payment',
            amount_stroops: params.amountStroops,
            transaction_hash: params.transactionHash,
            ledger: params.confirmedLedger,
            ledger_transaction_id: params.ledgerTransactionId,
            status: 'confirmed',
            correlation_id: params.correlationId,
            confirmed_at: new Date().toISOString(),
          });
        if (error) {
          throw new Error(`Unable to insert settlement: ${error.message}`);
        }
      }
    };

    const merchantProjector = createMerchantSettlementProjector({
      payments: merchantPaymentStore,
      serviceClient: service,
    });

    const depsObj = {
      serviceClient: service,
      serviceWriter: binding.serviceWriter,
      correlationId,
    };
    const baseStores = createServiceReconciliationStores(depsObj);
    const customStores = {
      ...baseStores,
      async completeRun(params: any) {
        let endLedgerSequence = params.endLedgerSequence;
        if (params.status !== 'failed' && (endLedgerSequence === null || endLedgerSequence === 0)) {
          try {
            const ledgerPage = await horizon.server.ledgers().order('desc').limit(1).call();
            if (ledgerPage.records && ledgerPage.records.length > 0) {
              endLedgerSequence = ledgerPage.records[0].sequence;
            }
          } catch (err) {
            console.error('Failed to resolve latest ledger sequence from Horizon for completion:', err);
          }
        }
        return baseStores.completeRun({
          ...params,
          endLedgerSequence,
        });
      }
    };

    const worker = createReconciliationWorker({
      config: context.stellar,
      guard: context.guard,
      observer,
      projector: merchantProjector,
      evidence: createServiceEvidenceStore(depsObj),
      stores: customStores,
      cursors: createServiceCursorGateway(service, correlationId),
      issues: createServiceIssueGateway(service, correlationId),
      projections: createServiceProjectionWriter(binding.serviceWriter),
    });

    const summary = await worker.runStream({
      attempts,
      streamName: `merchant_payment:${merchantId}`,
      network: 'stellar_testnet',
      organizationId,
      programId: null,
      cursorValue: null,
      correlationId,
    });

    // Write the reconciled merchant cash-balance projection
    let merchantProjectionWritten = false;
    const { data: runRow } = await service
      .from('reconciliation_runs')
      .select('id, completed_at, end_ledger_sequence')
      .eq('id', summary.run.id)
      .maybeSingle();

    let endLedger = runRow?.end_ledger_sequence ? Number(runRow.end_ledger_sequence) : 0;
    if (runRow?.completed_at && endLedger === 0) {
      try {
        const ledgerPage = await horizon.server.ledgers().order('desc').limit(1).call();
        if (ledgerPage.records && ledgerPage.records.length > 0) {
          const latestSeq = ledgerPage.records[0].sequence;
          const { error: updateError } = await service
            .from('reconciliation_runs')
            .update({ end_ledger_sequence: latestSeq })
            .eq('id', runRow.id);
          if (!updateError) {
            endLedger = latestSeq;
          }
        }
      } catch (err) {
        console.error('Failed to resolve latest ledger sequence from Horizon:', err);
      }
    }

    if (runRow?.completed_at && endLedger > 0) {
      const rcphp = requireRCPHPIdentifiers(context.stellar);
      const runStatus = summary.status === 'completed' ? 'completed' : 'partial';
      const projectionWriter = createServiceProjectionWriter(binding.serviceWriter);

      // 1. gross_settled_stroops: sum of all confirmed settlements
      const { data: settlements } = await service
        .from('settlements')
        .select('amount_stroops')
        .eq('merchant_id', merchantId)
        .eq('status', 'confirmed');
      const grossSettledStroops = (settlements ?? []).reduce((sum, row) => sum + BigInt(row.amount_stroops), 0n);
      const confirmedSettlementCount = (settlements ?? []).length;

      // 2. completed_cashout_stroops: sum of completed cashout requests
      const { data: completedCashouts } = await service
        .from('cashout_requests')
        .select('amount_stroops')
        .eq('merchant_id', merchantId)
        .eq('status', 'completed');
      const completedCashoutStroops = (completedCashouts ?? []).reduce((sum, row) => sum + BigInt(row.amount_stroops), 0n);

      // 3. pending_cashout_stroops: sum of requested/processing cashout requests
      const { data: pendingCashouts } = await service
        .from('cashout_requests')
        .select('amount_stroops')
        .eq('merchant_id', merchantId)
        .in('status', ['requested', 'processing']);
      const pendingCashoutStroops = (pendingCashouts ?? []).reduce((sum, row) => sum + BigInt(row.amount_stroops), 0n);

      // 4. refunded_stroops: sum of confirmed refunds
      const { data: refunds } = await service
        .from('refunds')
        .select('amount_stroops')
        .eq('merchant_id', merchantId)
        .eq('status', 'confirmed');
      const refundedStroops = (refunds ?? []).reduce((sum, row) => sum + BigInt(row.amount_stroops), 0n);

      // 5. settled_balance_stroops
      const settledBalanceStroopsVal = grossSettledStroops - completedCashoutStroops - refundedStroops;
      const settledBalanceStroops = settledBalanceStroopsVal < 0n ? 0n : settledBalanceStroopsVal;

      // Get projection version
      const { data: existing } = await service
        .from('merchant_balance_projection')
        .select('projection_version')
        .eq('organization_id', organizationId)
        .eq('merchant_id', merchantId)
        .eq('asset_code', rcphp.code)
        .maybeSingle();

      const row = buildMerchantCashBalanceRow({
        organizationId,
        programId: null,
        merchantId,
        assetCode: rcphp.code,
        assetIssuer: rcphp.issuer,
        settledBalanceStroops: Number(settledBalanceStroops),
        grossSettledStroops: Number(grossSettledStroops),
        refundedStroops: Number(refundedStroops),
        pendingCashoutStroops: Number(pendingCashoutStroops),
        completedCashoutStroops: Number(completedCashoutStroops),
        confirmedSettlementCount,
        reconciliationRunId: runRow.id,
        asOfLedger: endLedger,
        reconciledAt: runRow.completed_at,
        network: 'stellar_testnet',
        runStatus,
        projectionVersion: (existing?.projection_version ?? 0) + 1,
      });

      await projectionWriter.write([
        {
          table: 'merchant_balance_projection',
          rows: row,
          onConflict: 'organization_id,program_id,merchant_id,asset_code',
        },
      ]);
      merchantProjectionWritten = true;
    }

    return jsonResponse(
      {
        summary,
        merchantProjectionWritten,
      },
      200,
      correlationId,
    );
  }
};

serveEdge((request) => handleEdgeRequest(request, reconcileStellar));
