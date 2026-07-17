// submit-cash-activation Edge Function.

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
import {
  createCashReconcilerBundle,
  createServiceProgramFundingStore,
} from '../_shared/edge-cash-reconciler.ts';

interface SubmitActivationBody {
  readonly intentId?: unknown;
  readonly attemptId?: unknown;
}

const submitCashActivation = async (scope: EdgeRequestScope): Promise<Response> => {
  const { request, context, session, correlationId } = scope;
  const body = await parseJsonBody<SubmitActivationBody>(request);

  const intentId = typeof body.intentId === 'string' ? body.intentId : '';
  const attemptId = typeof body.attemptId === 'string' ? body.attemptId : '';

  if (!intentId || !attemptId) {
    throw FinancialErrorException.of('validation_failed', 'intentId and attemptId are required.', { correlationId });
  }

  const binding = createEdgeServiceBinding(context, correlationId);
  const service = binding.serviceClient;

  // 1. Load the intent and attempt from DB
  const { data: intent, error: intentError } = await service
    .from('financial_intents')
    .select('*')
    .eq('id', intentId)
    .maybeSingle();

  if (intentError || !intent) {
    throw FinancialErrorException.of('validation_failed', 'The activation intent was not found.', { correlationId });
  }

  // 2. Verify caller has organization permission
  const { data: membership, error: membershipError } = await service
    .from('organization_memberships')
    .select('role, is_active')
    .eq('user_id', session.userId)
    .eq('organization_id', intent.organization_id)
    .maybeSingle();

  if (membershipError || !membership || !membership.is_active) {
    throw FinancialErrorException.of('authorization_failed', 'You are not an active member of this organization.', { correlationId });
  }
  
  if (!['organization_administrator', 'finance_approver'].includes(membership.role)) {
    throw FinancialErrorException.of('authorization_failed', 'You do not have permission to activate cash programs.', { correlationId });
  }

  const { data: attempt, error: attemptError } = await service
    .from('transaction_attempts')
    .select('*')
    .eq('id', attemptId)
    .maybeSingle();

  if (attemptError || !attempt) {
    throw FinancialErrorException.of('validation_failed', 'The transaction attempt was not found.', { correlationId });
  }

  if (attempt.financial_intent_id !== intent.id) {
    throw FinancialErrorException.of('validation_failed', 'The attempt does not match the intent.', { correlationId });
  }

  // 3. Assemble and submit activation
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
    funding: createServiceProgramFundingStore(binding),
  });

  let submitted: { status: 'submitted'; attemptId: string; transactionHash: string };
  try {
    // Institutional signature is added automatically inside the orchestrator
    submitted = await activationOrchestrator.submit({
      intent,
      attempt,
    });
  } catch (error) {
    throw error;
  }

  return jsonResponse({
    activation: {
      intentId: intent.id,
      transactionHash: submitted.transactionHash,
    },
  }, 200, correlationId);
};

serveEdge((request) => handleEdgeRequest(request, submitCashActivation));
