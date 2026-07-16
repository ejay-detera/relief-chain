// Cash-rail reconciliation wiring.
//
// Assembles the shared reconciliation worker (reconciliation.ts) with the cash
// rail's observer + distribution projector (cash-reconciliation.ts) into a
// concrete, service-backed worker an Edge Function can drive. It supplies the
// two collaborators those modules leave to the runtime:
//   1. a CashTransactionLookup that reads a submitted transaction by hash from
//      the guarded testnet Horizon, and
//   2. a service-backed DistributionRecipientStore over the core
//      `distribution_recipients` / `distribution_jobs` tables.
//
// The worker is the ONLY thing that transitions an attempt to a confirmed
// terminal state, and it does so only from observed ledger evidence — nothing
// here fabricates confirmation.
//
// Validates: Requirements 6.4, 8.6, 8.7, 18.1, 18.5, 18.8

import type { Database } from '../../../src/types/database.types.ts';
import type { EdgeContext, EdgeServiceBinding } from './edge.ts';
import { safeLog } from './redaction.ts';
import {
    createCashDistributionProjector,
    createCashTransactionObserver,
    type CashLedgerLookupResult,
    type CashTransactionLookup,
    type ConfirmRecipientParams,
    type DistributionRecipientStore,
    type FailRecipientParams,
    type RollUpJobParams,
} from './stellar/cash-reconciliation.ts';
import type {
    DistributionRecipientRecord,
} from './stellar/distribution.ts';
import {
    createGuardedHorizonClient,
    type GuardedHorizonClient,
} from './stellar/horizon.ts';
import {
    createServiceReconciliationWorker,
    type ReconciliationWorker,
} from './stellar/reconciliation.ts';

const HEX_64 = /^[0-9a-f]{64}$/;

/**
 * Reads a submitted classic transaction by hash from the guarded testnet
 * Horizon. Returns `null` for a transaction that has not landed in a ledger
 * (Horizon 404); any other transport failure throws so the worker isolates it
 * as a failed observation rather than fabricating evidence.
 */
export const createHorizonCashLookup = (horizon: GuardedHorizonClient): CashTransactionLookup => ({
  async lookup(transactionHash: string): Promise<CashLedgerLookupResult | null> {
    if (!HEX_64.test(transactionHash)) {
      return null;
    }
    try {
      // NOTE: on the Horizon SDK transaction record the ledger SEQUENCE is
      // exposed as `ledger_attr` (a number); `ledger` is an async link fetcher.
      const record = (await horizon.server
        .transactions()
        .transaction(transactionHash)
        .call()) as unknown as {
        hash: string;
        successful: boolean;
        ledger_attr: number;
        created_at: string;
        envelope_xdr: string;
        result_xdr?: string;
        result_code?: string;
      };
      return {
        found: true,
        successful: Boolean(record.successful),
        transactionHash: record.hash,
        ledgerSequence: record.ledger_attr,
        ledgerClosedAt: record.created_at,
        envelopeXdr: record.envelope_xdr,
        resultCode: record.result_code ?? null,
        resultXdr: record.result_xdr ?? null,
        errorCode: record.successful ? null : 'tx_failed',
        errorMessage: null,
      };
    } catch (error) {
      const status = (error as { response?: { status?: number } })?.response?.status;
      if (status === 404) {
        return null;
      }
      safeLog('horizon transaction lookup failed', { transactionHash, error });
      throw error;
    }
  },
});

/**
 * Service-backed store over the core `distribution_recipients` / `distribution_jobs`
 * tables. These are core workflow tables (not read-model projections), so their
 * transitions go through the service client directly; the database status
 * triggers keep every transition legal and idempotent.
 */
export const createServiceDistributionRecipientStore = (
  binding: EdgeServiceBinding,
): DistributionRecipientStore => {
  const client = binding.serviceClient;

  const getRecipient = async (
    recipientId: string,
  ): Promise<DistributionRecipientRecord | null> => {
    const { data, error } = await client
      .from('distribution_recipients')
      .select('*')
      .eq('id', recipientId)
      .maybeSingle();
    if (error) {
      throw new Error(`Unable to load distribution recipient: ${error.message}`);
    }
    return data ?? null;
  };

  const confirmRecipient = async (params: ConfirmRecipientParams): Promise<void> => {
    const { error } = await client
      .from('distribution_recipients')
      .update({
        status: 'confirmed',
        transaction_hash: params.transactionHash,
        confirmed_ledger: params.confirmedLedger,
        confirmed_at: new Date().toISOString(),
      })
      .eq('id', params.recipientId)
      .eq('status', 'submitted');
    if (error) {
      throw new Error(`Unable to confirm recipient: ${error.message}`);
    }
  };

  const failRecipient = async (params: FailRecipientParams): Promise<void> => {
    const { error } = await client
      .from('distribution_recipients')
      .update({
        status: 'failed',
        failure_code: params.failureCode,
        failure_reason: params.failureReason,
      })
      .eq('id', params.recipientId)
      .eq('status', 'submitted');
    if (error) {
      throw new Error(`Unable to fail recipient: ${error.message}`);
    }
  };

  const listJobRecipients = async (
    jobId: string,
  ): Promise<DistributionRecipientRecord[]> => {
    const { data, error } = await client
      .from('distribution_recipients')
      .select('*')
      .eq('distribution_job_id', jobId)
      .order('created_at', { ascending: true });
    if (error) {
      throw new Error(`Unable to list job recipients: ${error.message}`);
    }
    return data ?? [];
  };

  const rollUpJob = async (params: RollUpJobParams): Promise<void> => {
    const patch: Database['public']['Tables']['distribution_jobs']['Update'] = {
      status: params.status,
      pending_count: params.counts.pendingCount,
      submitted_count: params.counts.submittedCount,
      confirmed_count: params.counts.confirmedCount,
      failed_count: params.counts.failedCount,
      cancelled_count: params.counts.cancelledCount,
    };
    if (params.status === 'completed' || params.status === 'partial_failed') {
      patch.completed_at = new Date().toISOString();
    }
    const { error } = await client
      .from('distribution_jobs')
      .update(patch)
      .eq('id', params.jobId);
    if (error) {
      throw new Error(`Unable to roll up distribution job: ${error.message}`);
    }
  };

  const currentJobProjectionVersion = async (jobId: string): Promise<number | null> => {
    const { data, error } = await client
      .from('distribution_job_projection')
      .select('projection_version')
      .eq('distribution_job_id', jobId)
      .maybeSingle();
    if (error) {
      throw new Error(`Unable to read job projection version: ${error.message}`);
    }
    return data?.projection_version ?? null;
  };

  return {
    getRecipient,
    confirmRecipient,
    failRecipient,
    listJobRecipients,
    rollUpJob,
    currentJobProjectionVersion,
  };
};

/** The assembled cash reconciler collaborators an Edge Function drives. */
export interface CashReconcilerBundle {
  readonly worker: ReconciliationWorker;
  readonly recipients: DistributionRecipientStore;
  readonly horizon: GuardedHorizonClient;
}

/**
 * Builds a fully service-backed cash reconciliation worker: the guarded Horizon
 * lookup, the cash observer, the distribution projector, and the recipient
 * store, composed through {@link createServiceReconciliationWorker}.
 */
export const createCashReconcilerBundle = (
  context: EdgeContext,
  binding: EdgeServiceBinding,
  correlationId: string,
): CashReconcilerBundle => {
  const horizon = createGuardedHorizonClient(context.stellar, context.guard);
  const recipients = createServiceDistributionRecipientStore(binding);
  const observer = createCashTransactionObserver({
    config: context.stellar,
    guard: context.guard,
    lookup: createHorizonCashLookup(horizon),
  });
  const projector = createCashDistributionProjector({ recipients });
  const worker = createServiceReconciliationWorker({
    serviceClient: binding.serviceClient,
    serviceWriter: binding.serviceWriter,
    correlationId,
    config: context.stellar,
    guard: context.guard,
    observer,
    projector,
  });
  return { worker, recipients, horizon };
};
