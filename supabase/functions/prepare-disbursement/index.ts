// prepare-disbursement Edge Function.
//
// Turns an organization user's `{ programId, recipients }` request into a
// resumable distribution job: it resolves each recipient profile to its stable
// beneficiary identity, approved enrollment, and active verified beneficiary
// wallet, then persists an immutable `distribution_jobs` row plus one
// `distribution_recipients` row per valid recipient — each behind a claimed
// idempotency key, so the strict workflow-scope triggers accept them and a
// later authorize/retry can never create duplicate aid.
//
// It performs NO on-chain work and moves NO value; it only prepares the job that
// submit-disbursement will execute. Confirmation stays reconciliation-owned.
//
// Validates: Requirements 6.3, 8.1, 8.2, 8.5, 18.3

import { requireOrganizationRole } from '../_shared/auth.ts';
import {
    createEdgeServiceBinding,
    handleEdgeRequest,
    parseJsonBody,
    type EdgeRequestScope,
} from '../_shared/edge.ts';
import { FinancialErrorException } from '../_shared/errors.ts';
import { jsonResponse } from '../_shared/response.ts';
import { serveEdge } from '../_shared/runtime.ts';
import type { OrganizationRole } from '../_shared/tenant-authorization.ts';

interface RecipientRequest {
  readonly beneficiaryProfileId?: unknown;
  readonly amountStroops?: unknown;
}

interface PrepareBody {
  readonly programId?: unknown;
  readonly recipients?: unknown;
}

const ALLOWED_ROLES: readonly OrganizationRole[] = [
  'organization_administrator',
  'program_manager',
  'finance_approver',
];

const STELLAR_ACCOUNT = /^G[A-Z2-7]{55}$/;

const sha256Hex = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

const parsePositiveStroops = (value: unknown, correlationId: string): number => {
  const amount = typeof value === 'string' ? Number(value) : (value as number);
  if (!Number.isInteger(amount) || amount <= 0) {
    throw FinancialErrorException.of('validation_failed', 'Each recipient amount must be a positive integer of stroops.', {
      correlationId,
    });
  }
  return amount;
};

interface ResolvedRecipient {
  readonly beneficiaryProfileId: string;
  readonly beneficiaryIdentityId: string;
  readonly enrollmentId: string;
  readonly destinationWalletId: string;
  readonly amountStroops: number;
}

const prepareDisbursement = async (scope: EdgeRequestScope): Promise<Response> => {
  const { request, context, client, session, correlationId } = scope;
  const body = await parseJsonBody<PrepareBody>(request);

  const programId = typeof body.programId === 'string' ? body.programId : '';
  if (!programId) {
    throw FinancialErrorException.of('validation_failed', 'A programId is required.', { correlationId });
  }
  const rawRecipients = Array.isArray(body.recipients) ? (body.recipients as RecipientRequest[]) : [];
  if (rawRecipients.length === 0) {
    throw FinancialErrorException.of('validation_failed', 'At least one recipient is required.', { correlationId });
  }

  const binding = createEdgeServiceBinding(context, correlationId);
  const service = binding.serviceClient;

  // Resolve the program with the service client, then authorize the caller
  // explicitly by organization role (its membership read runs under RLS). This
  // keeps authorization strict while allowing a draft program to be targeted.
  const { data: program, error: programError } = await service
    .from('programs')
    .select('id, organization_id, aid_type, policy_version')
    .eq('id', programId)
    .maybeSingle();
  if (programError || !program) {
    throw FinancialErrorException.of('validation_failed', 'The program was not found.', { correlationId });
  }
  if (program.aid_type !== 'cash') {
    throw FinancialErrorException.of('validation_failed', 'This endpoint distributes cash-aid programs only.', {
      correlationId,
    });
  }
  await requireOrganizationRole(client, session, program.organization_id, ALLOWED_ROLES);

  // Resolve each recipient profile -> stable identity -> approved enrollment ->
  // active verified beneficiary wallet. A recipient missing any of these is
  // excluded with a reason rather than silently dropped.
  const resolved: ResolvedRecipient[] = [];
  const excluded: { readonly beneficiaryProfileId: string; readonly reason: string }[] = [];

  for (const entry of rawRecipients) {
    const profileId = typeof entry.beneficiaryProfileId === 'string' ? entry.beneficiaryProfileId : '';
    if (!profileId) {
      throw FinancialErrorException.of('validation_failed', 'Each recipient needs a beneficiaryProfileId.', {
        correlationId,
      });
    }
    const amountStroops = parsePositiveStroops(entry.amountStroops, correlationId);

    const { data: enrollment } = await service
      .from('enrollments')
      .select('id, beneficiary_identity_id, approval_status')
      .eq('program_id', programId)
      .eq('beneficiary_id', profileId)
      .maybeSingle();
    if (!enrollment || enrollment.approval_status !== 'Approved') {
      excluded.push({ beneficiaryProfileId: profileId, reason: 'no_approved_enrollment' });
      continue;
    }

    const { data: wallet } = await service
      .from('wallets')
      .select('id, address')
      .eq('owner_type', 'beneficiary_identity')
      .eq('owner_id', enrollment.beneficiary_identity_id)
      .eq('purpose', 'beneficiary')
      .eq('network', 'stellar_testnet')
      .eq('verification_status', 'verified')
      .eq('is_active', true)
      .maybeSingle();
    if (!wallet || !STELLAR_ACCOUNT.test(wallet.address)) {
      excluded.push({ beneficiaryProfileId: profileId, reason: 'no_active_verified_wallet' });
      continue;
    }

    resolved.push({
      beneficiaryProfileId: profileId,
      beneficiaryIdentityId: enrollment.beneficiary_identity_id,
      enrollmentId: enrollment.id,
      destinationWalletId: wallet.id,
      amountStroops,
    });
  }

  if (resolved.length === 0) {
    throw FinancialErrorException.of(
      'validation_failed',
      'No recipient had an approved enrollment and an active verified wallet.',
      { correlationId },
    );
  }

  const totalAmountStroops = resolved.reduce((sum, recipient) => sum + recipient.amountStroops, 0);
  const jobCorrelationId = crypto.randomUUID();
  const jobId = crypto.randomUUID();

  // Claim the job-level idempotency key (operation type must be cash_distribution
  // for the workflow-scope trigger to accept the job).
  const jobPayloadHash = await sha256Hex(
    `cash_distribution_job|${programId}|${jobCorrelationId}|${totalAmountStroops}`,
  );
  const { data: jobKey, error: jobKeyError } = await service.rpc('claim_financial_idempotency_key', {
    p_organization_id: program.organization_id,
    p_program_id: programId,
    p_scope: 'cash_distribution',
    p_idempotency_key: `cash_distribution_job:${programId}:${jobCorrelationId}`,
    p_payload_hash: jobPayloadHash,
    p_operation_type: 'cash_distribution',
    p_correlation_id: jobCorrelationId,
  });
  if (jobKeyError || !jobKey) {
    throw FinancialErrorException.of('dependency_unavailable', 'Unable to claim the distribution job key.', {
      correlationId,
      retryable: true,
    });
  }

  const { error: jobInsertError } = await service.from('distribution_jobs').insert({
    id: jobId,
    organization_id: program.organization_id,
    program_id: programId,
    idempotency_key_id: jobKey.id,
    status: 'awaiting_approval',
    recipient_count: resolved.length,
    pending_count: resolved.length,
    total_amount_stroops: totalAmountStroops,
    batch_size: 100,
    correlation_id: jobCorrelationId,
    created_by: session.userId,
  });
  if (jobInsertError) {
    throw FinancialErrorException.of('dependency_unavailable', 'Unable to create the distribution job.', {
      correlationId,
      retryable: true,
    });
  }

  // One recipient row per resolved recipient, each behind its own idempotency
  // key on a DISTINCT scope from the per-recipient financial intent (which the
  // executor claims under scope `cash_distribution`), so the two never collide.
  for (const recipient of resolved) {
    const recipientPayloadHash = await sha256Hex(
      `distribution_recipient|${jobId}|${recipient.beneficiaryIdentityId}|${recipient.amountStroops}`,
    );
    const { data: recipientKey, error: recipientKeyError } = await service.rpc(
      'claim_financial_idempotency_key',
      {
        p_organization_id: program.organization_id,
        p_program_id: programId,
        p_scope: 'distribution_recipient',
        p_idempotency_key: `distribution_recipient:${jobId}:${recipient.beneficiaryIdentityId}`,
        p_payload_hash: recipientPayloadHash,
        p_operation_type: 'cash_distribution',
        p_correlation_id: crypto.randomUUID(),
      },
    );
    if (recipientKeyError || !recipientKey) {
      throw FinancialErrorException.of('dependency_unavailable', 'Unable to claim a recipient key.', {
        correlationId,
        retryable: true,
      });
    }

    const { error: recipientInsertError } = await service.from('distribution_recipients').insert({
      organization_id: program.organization_id,
      program_id: programId,
      distribution_job_id: jobId,
      beneficiary_identity_id: recipient.beneficiaryIdentityId,
      enrollment_id: recipient.enrollmentId,
      destination_wallet_id: recipient.destinationWalletId,
      idempotency_key_id: recipientKey.id,
      amount_stroops: recipient.amountStroops,
      status: 'pending',
      correlation_id: crypto.randomUUID(),
    });
    if (recipientInsertError) {
      throw FinancialErrorException.of('dependency_unavailable', 'Unable to create a distribution recipient.', {
        correlationId,
        retryable: true,
      });
    }
  }

  return jsonResponse(
    {
      job: {
        jobId,
        programId,
        recipientCount: resolved.length,
        totalAmountStroops: String(totalAmountStroops),
        status: 'awaiting_approval',
      },
      excluded,
    },
    200,
    correlationId,
  );
};

serveEdge((request) => handleEdgeRequest(request, prepareDisbursement));
