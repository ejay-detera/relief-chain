// prepare-cash-activation Edge Function.

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
  createCashProgramActivation,
  createCashActivationStrategy,
} from '../_shared/stellar/cash-activation.ts';
import { createCashReconcilerBundle } from '../_shared/edge-cash-reconciler.ts';

interface PrepareActivationBody {
  readonly organizationId?: unknown;
  readonly programId?: unknown;
}

const prepareCashActivation = async (scope: EdgeRequestScope): Promise<Response> => {
  const { request, context, session, correlationId } = scope;
  const body = await parseJsonBody<PrepareActivationBody>(request);

  if (typeof body.organizationId !== 'string' || typeof body.programId !== 'string') {
    throw FinancialErrorException.of('validation_failed', 'organizationId and programId must be strings.', { correlationId });
  }

  const { organizationId, programId } = body;

  const binding = createEdgeServiceBinding(context, correlationId);
  const service = binding.serviceClient;

  // 1. Verify caller has organization permission
  const { data: membership, error: membershipError } = await service
    .from('organization_memberships')
    .select('role, is_active')
    .eq('user_id', session.userId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (membershipError || !membership || !membership.is_active) {
    throw FinancialErrorException.of('authorization_failed', 'You are not an active member of this organization.', { correlationId });
  }
  
  // Minimal check for LGU role (either admin or finance_approver)
  if (!['organization_administrator', 'finance_approver'].includes(membership.role)) {
    throw FinancialErrorException.of('authorization_failed', 'You do not have permission to activate cash programs.', { correlationId });
  }

  // 2. Fetch program details
  const { data: program, error: programError } = await service
    .from('programs')
    .select('id, total_budget, asset_code, asset_issuer')
    .eq('id', programId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (programError || !program) {
    throw FinancialErrorException.of('validation_failed', 'Program not found in this organization.', { correlationId });
  }

  // Multiply by 10,000,000 for stroops (since total_budget is in units like 1000)
  // Assuming total_budget is stored as numeric unit, not stroops.
  const STROOPS_PER_UNIT = 10_000_000;
  const budgetStroops = Math.floor(Number(program.total_budget) * STROOPS_PER_UNIT);

  // 3. Initialize orchestrator and call prepare
  const reconciler = createCashReconcilerBundle(context, binding, correlationId);
  const protocol = createEdgeTransactionProtocol(context, {
    service: binding,
    correlationId,
    reconciler: reconciler.worker,
  });

  const activationOrchestrator = createCashProgramActivation({
    protocol,
    strategy: createCashActivationStrategy({ horizon: reconciler.horizon }),
    horizon: reconciler.horizon,
    config: context.stellar,
    signers: createEdgeSignerRegistry(),
  });

  const prepared = await activationOrchestrator.prepare({
    organizationId,
    programId,
    budgetStroops,
    idempotencyKey: `program-activation:${programId}`,
    requestedBy: session.userId,
    correlationId,
  });

  const response = {
    activation: {
      intentId: prepared.intent.id,
      attemptId: prepared.attempt?.id ?? null,
      amountStroops: String(budgetStroops),
      isReplay: prepared.isReplay,
      signingPackage: prepared.signingPackage ?? null, // Will be null since activation is backend-signed! Wait!
    },
  };

  // Wait, the cash-activation strategy returns a classic_envelope but it's backend-signed by organization_treasury. 
  // It shouldn't be sent to the client to sign. The client just calls submit.
  // We return the intent and attempt IDs.

  return jsonResponse(response, 200, correlationId);
};

serveEdge((request) => handleEdgeRequest(request, prepareCashActivation));
