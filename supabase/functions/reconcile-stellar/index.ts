// reconcile-stellar Edge Function (cash rail).
//
// Observes a distribution job's in-flight transaction attempts on the guarded
// testnet Horizon and reconciles them: confirmed ledger success transitions each
// recipient `submitted -> confirmed`, on-chain failure marks it `failed`
// (eligible for a resume retry), the job is rolled up, and the reconciled
// `distribution_job_projection` the app reads is written with the completed
// run's evidence. Confirmation comes ONLY from matching ledger evidence — never
// from a submission response.
//
// Body: { jobId }.
//
// Validates: Requirements 6.4, 8.6, 8.7, 18.1, 18.5, 18.6, 18.8

import { requireOrganizationRole } from '../_shared/auth.ts';
import { createCashReconcilerBundle } from '../_shared/edge-cash-reconciler.ts';
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
} from '../_shared/stellar/cash-reconciliation.ts';
import { requireRCPHPIdentifiers } from '../_shared/stellar/config.ts';
import { createServiceProjectionWriter } from '../_shared/stellar/reconciliation.ts';
import type { OrganizationRole } from '../_shared/tenant-authorization.ts';

interface ReconcileBody {
  readonly jobId?: unknown;
}

const ALLOWED_ROLES: readonly OrganizationRole[] = [
  'organization_administrator',
  'finance_approver',
  'program_manager',
  'auditor',
];

const reconcileStellar = async (scope: EdgeRequestScope): Promise<Response> => {
  const { request, context, client, session, correlationId } = scope;
  const body = await parseJsonBody<ReconcileBody>(request);

  const jobId = typeof body.jobId === 'string' ? body.jobId : '';
  if (!jobId) {
    throw FinancialErrorException.of('validation_failed', 'A jobId is required.', { correlationId });
  }

  const binding = createEdgeServiceBinding(context, correlationId);
  const service = binding.serviceClient;

  const { data: job, error: jobError } = await service
    .from('distribution_jobs')
    .select('id, organization_id, program_id, total_amount_stroops')
    .eq('id', jobId)
    .maybeSingle();
  if (jobError || !job) {
    throw FinancialErrorException.of('validation_failed', 'The distribution job was not found.', { correlationId });
  }
  await requireOrganizationRole(client, session, job.organization_id, ALLOWED_ROLES);

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
  // whose transfer this job confirmed, using the completed run's evidence (the
  // projection trigger requires reconciled_at == run.completed_at and
  // as_of_ledger <= run end ledger).
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
};

serveEdge((request) => handleEdgeRequest(request, reconcileStellar));
