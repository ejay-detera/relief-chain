// abandon-beneficiary-balance Edge Function (operator-approved disposition).
//
// Marks one `beneficiary_balance_projection` cash row abandoned while
// preserving its distributed/redeemed history. The UPDATE reuses the row's
// existing reconciliation evidence and bumps `projection_version` by one, so
// `validate_financial_projection` passes without fabricating any run or issue
// row. Idempotent: an already-abandoned row returns success without a write.
// Operator roles only; beneficiaries can never self-serve (they hold no
// organization role, so `requireOrganizationRole` fails closed).
//
// Body: { projectionId, note, evidenceRef? }
// Testnet only; RCPHP has no monetary value.
//
// PUSH-REQUIRED: deploy with `supabase functions deploy abandon-beneficiary-balance` (NOT run here).

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
import { planAbandonmentUpdate } from '../_shared/stellar/beneficiary-abandonment.ts';
import type { OrganizationRole } from '../_shared/tenant-authorization.ts';

interface AbandonBody {
  readonly projectionId?: unknown;
  readonly note?: unknown;
  readonly evidenceRef?: unknown;
}

const ALLOWED_ROLES: readonly OrganizationRole[] = [
  'organization_administrator',
  'finance_approver',
  'program_manager',
];

const abandonBeneficiaryBalance = async (scope: EdgeRequestScope): Promise<Response> => {
  const { request, context, session, correlationId } = scope;
  const body = await parseJsonBody<AbandonBody>(request);

  const projectionId = typeof body.projectionId === 'string' ? body.projectionId : '';
  const note = typeof body.note === 'string' ? body.note : '';
  const evidenceRef = typeof body.evidenceRef === 'string' ? body.evidenceRef : null;

  if (projectionId.length === 0) {
    throw FinancialErrorException.of('validation_failed', 'A projectionId is required.', { correlationId });
  }

  const binding = createEdgeServiceBinding(context, correlationId);
  const service = binding.serviceClient;

  const { data: row, error: rowError } = await service
    .from('beneficiary_balance_projection')
    .select('*')
    .eq('id', projectionId)
    .maybeSingle();

  if (rowError || !row) {
    throw FinancialErrorException.of('validation_failed', 'The balance projection was not found.', {
      correlationId,
    });
  }

  await requireOrganizationRole(service, session, row.organization_id, ALLOWED_ROLES);

  const plan = planAbandonmentUpdate(
    {
      id: row.id,
      organization_id: row.organization_id,
      program_id: row.program_id,
      beneficiary_identity_id: row.beneficiary_identity_id,
      asset_code: row.asset_code,
      aid_type: row.aid_type,
      allocated_stroops: Number(row.allocated_stroops),
      distributed_stroops: Number(row.distributed_stroops),
      redeemed_stroops: Number(row.redeemed_stroops),
      refunded_stroops: Number(row.refunded_stroops),
      available_balance_stroops: Number(row.available_balance_stroops),
      confirmed_transaction_count: Number(row.confirmed_transaction_count),
      reconciliation_run_id: row.reconciliation_run_id,
      as_of_ledger: Number(row.as_of_ledger),
      reconciled_at: row.reconciled_at,
      projection_version: Number(row.projection_version),
      is_quarantined: row.is_quarantined,
      quarantine_issue_id: row.quarantine_issue_id,
      is_abandoned: (row as { is_abandoned?: boolean | null }).is_abandoned ?? false,
      abandoned_at: (row as { abandoned_at?: string | null }).abandoned_at ?? null,
      abandoned_by: (row as { abandoned_by?: string | null }).abandoned_by ?? null,
      abandonment_note: (row as { abandonment_note?: string | null }).abandonment_note ?? null,
      abandonment_evidence_ref:
        (row as { abandonment_evidence_ref?: string | null }).abandonment_evidence_ref ?? null,
    },
    {
      note,
      evidenceRef,
      operatorUserId: session.userId,
    },
  );

  if (plan.status === 'already_abandoned') {
    return jsonResponse({ projectionId: plan.rowId, status: 'already_abandoned' }, 200, correlationId);
  }
  if (plan.status === 'rejected') {
    throw FinancialErrorException.of('validation_failed', plan.message, { correlationId });
  }

  const { error: updateError } = await service
    .from('beneficiary_balance_projection')
    .update(plan.update)
    .eq('id', plan.rowId);

  if (updateError) {
    throw FinancialErrorException.of('dependency_unavailable', 'Unable to mark the balance abandoned.', {
      correlationId,
      retryable: true,
    });
  }

  return jsonResponse({ projectionId: plan.rowId, status: 'abandoned' }, 200, correlationId);
};

serveEdge((request) => handleEdgeRequest(request, abandonBeneficiaryBalance));
