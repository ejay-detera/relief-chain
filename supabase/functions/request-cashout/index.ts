// request-cashout Edge Function.
//
// Validates: Requirements 12.5, 12.6, 12.7, 12.8, 14.1, 18.3, 18.4

import {
  createEdgeServiceBinding,
  handleEdgeRequest,
  parseJsonBody,
  type EdgeRequestScope,
} from '../_shared/edge.ts';
import { FinancialErrorException } from '../_shared/errors.ts';
import { jsonResponse } from '../_shared/response.ts';
import { serveEdge } from '../_shared/runtime.ts';
import { requireRCPHPIdentifiers } from '../_shared/stellar/config.ts';

interface CashOutBody {
  readonly actor?: unknown;
  readonly amountStroops?: unknown;
}

const STELLAR_ACCOUNT = /^G[A-Z2-7]{55}$/;

const requestCashOut = async (scope: EdgeRequestScope): Promise<Response> => {
  const { request, context, session, correlationId } = scope;
  const body = await parseJsonBody<CashOutBody>(request);

  const actor = typeof body.actor === 'string' ? body.actor : '';
  const amountStroopsStr = typeof body.amountStroops === 'string' ? body.amountStroops : '';

  if (!actor || !amountStroopsStr) {
    throw FinancialErrorException.of('validation_failed', 'actor and amountStroops are required.', { correlationId });
  }

  const amountStroops = Number(amountStroopsStr);
  if (Number.isNaN(amountStroops) || amountStroops <= 0) {
    throw FinancialErrorException.of('validation_failed', 'A positive amountStroops is required.', { correlationId });
  }

  const binding = createEdgeServiceBinding(context, correlationId);
  const service = binding.serviceClient;

  // Resolve merchant entity owned by user
  const { data: merchant, error: merchantError } = await service
    .from('merchant_entities')
    .select('id')
    .eq('profile_id', session.userId)
    .maybeSingle();

  if (merchantError || !merchant) {
    throw FinancialErrorException.of('authorization_failed', 'No merchant entity is linked to this account.', { correlationId });
  }

  // Resolve organization ID from active accreditation
  const { data: accreditation, error: accreditationError } = await service
    .from('merchant_accreditations')
    .select('organization_id')
    .eq('merchant_id', merchant.id)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();

  if (accreditationError || !accreditation) {
    throw FinancialErrorException.of('validation_failed', 'Merchant has no active organization accreditations.', { correlationId });
  }

  // Resolve active verified settlement wallet
  const { data: wallet, error: walletError } = await service
    .from('wallets')
    .select('id, address')
    .eq('owner_type', 'merchant_entity')
    .eq('owner_id', merchant.id)
    .eq('purpose', 'merchant_settlement')
    .eq('verification_status', 'verified')
    .eq('is_active', true)
    .eq('network', 'stellar_testnet')
    .maybeSingle();

  if (walletError || !wallet || !STELLAR_ACCOUNT.test(wallet.address)) {
    throw FinancialErrorException.of('validation_failed', 'Merchant has no active verified settlement wallet.', { correlationId });
  }

  const rcphp = requireRCPHPIdentifiers(context.stellar);

  const cashoutId = crypto.randomUUID();
  const { data: newCashout, error: insertError } = await service
    .from('cashout_requests')
    .insert({
      id: cashoutId,
      organization_id: accreditation.organization_id,
      merchant_id: merchant.id,
      settlement_wallet_id: wallet.id,
      amount_stroops: amountStroops,
      asset_code: rcphp.code,
      is_simulated: true,
      status: 'requested',
      requested_by: session.userId,
      correlation_id: correlationId,
    })
    .select('*')
    .single();

  if (insertError) {
    throw FinancialErrorException.of('dependency_unavailable', `Unable to log cash-out request: ${insertError.message}`, { correlationId });
  }

  return jsonResponse({ cashout: newCashout }, 200, correlationId);
};

serveEdge((request) => handleEdgeRequest(request, requestCashOut));
