// submit-disbursement Edge Function.
//
// Executes a prepared distribution job. It drives the resumable per-recipient
// disbursement processor: for every eligible recipient it prepares an immutable
// financial intent, builds the exact RCPHP payment from the cash-program
// treasury, institutionally signs it, wraps it in a sponsor fee-bump, and
// submits it. Each recipient row is then moved `pending -> submitted` (or
// `failed`), and the job is left `reconciling` — confirmation is owned by the
// reconciler, never by this response.
//
// `mode: 'authorize'` runs the still-`pending` recipients; `mode: 'retry'`
// re-drives `pending`/`failed` recipients only, under their existing
// deterministic idempotency keys, so a confirmed transfer is never duplicated.
//
// Validates: Requirements 6.1, 6.2, 8.4, 8.5, 8.6, 14.1, 18.4, 18.8

import { requireOrganizationRole } from '../_shared/auth.ts';
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
    createCashDisbursement,
    createCashDisbursementStrategy,
} from '../_shared/stellar/cash-disbursement.ts';
import {
    DEFAULT_DISTRIBUTION_BATCH_SIZE,
    makeDistributionRecipientKey,
    runDistributionExecution,
    type RecipientWork,
} from '../_shared/stellar/distribution.ts';
import type { OrganizationRole } from '../_shared/tenant-authorization.ts';

interface SubmitBody {
  readonly jobId?: unknown;
  readonly mode?: unknown;
}

const ALLOWED_ROLES: readonly OrganizationRole[] = [
  'organization_administrator',
  'finance_approver',
];

const submitDisbursement = async (scope: EdgeRequestScope): Promise<Response> => {
  const { request, context, client, session, correlationId } = scope;
  const body = await parseJsonBody<SubmitBody>(request);

  const jobId = typeof body.jobId === 'string' ? body.jobId : '';
  const mode = body.mode === 'retry' ? 'retry' : 'authorize';
  if (!jobId) {
    throw FinancialErrorException.of('validation_failed', 'A jobId is required.', { correlationId });
  }

  const binding = createEdgeServiceBinding(context, correlationId);
  const service = binding.serviceClient;

  // Resolve the job with the service client, then authorize the caller by
  // organization role (its membership read runs under RLS).
  const { data: job, error: jobError } = await service
    .from('distribution_jobs')
    .select('id, organization_id, program_id, status, recipient_count, total_amount_stroops')
    .eq('id', jobId)
    .maybeSingle();
  if (jobError || !job) {
    throw FinancialErrorException.of('validation_failed', 'The distribution job was not found.', {
      correlationId,
    });
  }
  await requireOrganizationRole(client, session, job.organization_id, ALLOWED_ROLES);

  const { data: program } = await service
    .from('programs')
    .select('policy_version')
    .eq('id', job.program_id)
    .maybeSingle();
  const policyVersion = program?.policy_version ?? 1;

  // Select the recipients this pass may drive: only `pending` on authorize;
  // `pending` or `failed` on retry. Confirmed/submitted recipients are never
  // re-driven.
  const eligibleStatuses: ('pending' | 'failed')[] = mode === 'retry' ? ['pending', 'failed'] : ['pending'];
  const { data: recipientRows, error: recipientError } = await service
    .from('distribution_recipients')
    .select('id, beneficiary_identity_id, destination_wallet_id, amount_stroops, status')
    .eq('distribution_job_id', jobId)
    .in('status', eligibleStatuses);
  if (recipientError) {
    throw FinancialErrorException.of('dependency_unavailable', 'Unable to load recipients.', {
      correlationId,
      retryable: true,
    });
  }
  const recipients = recipientRows ?? [];

  // Resolve each recipient's destination wallet address once, up front.
  const walletAddressById = new Map<string, string>();
  for (const recipient of recipients) {
    if (walletAddressById.has(recipient.destination_wallet_id)) continue;
    const { data: wallet } = await service
      .from('wallets')
      .select('address')
      .eq('id', recipient.destination_wallet_id)
      .maybeSingle();
    if (wallet?.address) {
      walletAddressById.set(recipient.destination_wallet_id, wallet.address);
    }
  }

  // Assemble the cash disbursement orchestrator around the reusable protocol.
  const reconciler = createCashReconcilerBundle(context, binding, correlationId);
  const protocol = createEdgeTransactionProtocol(context, {
    service: binding,
    correlationId,
    reconciler: reconciler.worker,
  });
  const disbursement = createCashDisbursement({
    protocol,
    strategy: createCashDisbursementStrategy({ horizon: reconciler.horizon }),
    config: context.stellar,
    signers: createEdgeSignerRegistry(),
  });

  const works: RecipientWork[] = recipients.map((recipient) => ({
    recipientId: recipient.id,
    beneficiaryIdentityId: recipient.beneficiary_identity_id,
    destinationWalletId: recipient.destination_wallet_id,
    amountStroops: recipient.amount_stroops,
    idempotencyKey: makeDistributionRecipientKey(job.program_id, recipient.beneficiary_identity_id, policyVersion),
  }));

  const processor = disbursement.createRecipientProcessor({
    organizationId: job.organization_id,
    programId: job.program_id,
    distributionJobId: jobId,
    correlationId,
    resolveDestinationAddress: async (work) => {
      const address = walletAddressById.get(work.destinationWalletId);
      if (!address) {
        throw FinancialErrorException.of('validation_failed', 'The recipient wallet address is unavailable.', {
          correlationId,
        });
      }
      return address;
    },
  });

  if (works.length === 0) {
    throw FinancialErrorException.of('validation_failed', 'No eligible recipients to submit.', { correlationId });
  }

  const nowIso = () => new Date().toISOString();
  const setJobStatus = async (
    status: 'queued' | 'submitting' | 'reconciling' | 'partial_failed',
    extra: Record<string, unknown> = {},
  ): Promise<void> => {
    const { error } = await service.from('distribution_jobs').update({ status, ...extra }).eq('id', jobId);
    if (error) {
      throw FinancialErrorException.of('dependency_unavailable', `Unable to advance job to ${status}.`, {
        correlationId,
        retryable: true,
      });
    }
  };

  // Advance the job to `submitting` through the valid state machine before any
  // on-chain work: awaiting_approval -> queued -> submitting (authorize) or
  // partial_failed/queued -> submitting (retry).
  if (job.status === 'awaiting_approval') {
    await setJobStatus('queued', { approved_by: session.userId, approved_at: nowIso() });
    await setJobStatus('submitting', { started_at: nowIso() });
  } else if (job.status === 'queued') {
    await setJobStatus('submitting', { started_at: nowIso() });
  } else if (job.status === 'partial_failed') {
    await setJobStatus('submitting');
  }

  const report = await runDistributionExecution({
    works,
    processor,
    batchSize: DEFAULT_DISTRIBUTION_BATCH_SIZE,
  });

  // Reflect submission results into the durable recipient rows. Confirmation
  // remains reconciliation-owned; here we only move pending -> submitted/failed.
  // Recipient state machine: pending -> prepared -> submitted (no direct jump).
  // A retry recipient starts `failed`; failed -> prepared is also valid.
  for (const submitted of report.submitted) {
    await service
      .from('distribution_recipients')
      .update({ status: 'prepared' })
      .eq('id', submitted.recipientId)
      .in('status', ['pending', 'failed']);
    await service
      .from('distribution_recipients')
      .update({ status: 'submitted', transaction_hash: submitted.transactionHash })
      .eq('id', submitted.recipientId)
      .eq('status', 'prepared');
  }
  for (const failure of report.failed) {
    await service
      .from('distribution_recipients')
      .update({ status: 'failed', failure_code: failure.failureCode, failure_reason: failure.failureReason })
      .eq('id', failure.recipientId)
      .in('status', ['pending', 'prepared', 'submitted']);
  }

  // From `submitting`, move to `reconciling` (something submitted) or
  // `partial_failed` (all failed) — both valid single-step transitions.
  const jobStatus = report.submitted.length > 0 ? 'reconciling' : 'partial_failed';
  await setJobStatus(jobStatus, {
    submitted_count: report.submitted.length,
    failed_count: report.failed.length,
    pending_count: 0,
  });

  return jsonResponse(
    {
      job: {
        jobId,
        programId: job.program_id,
        recipientCount: job.recipient_count,
        totalAmountStroops: String(job.total_amount_stroops),
        status: jobStatus,
      },
      submittedCount: report.submitted.length,
      failedCount: report.failed.length,
    },
    200,
    correlationId,
  );
};

serveEdge((request) => handleEdgeRequest(request, submitDisbursement));
