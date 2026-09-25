import { supabase } from '@/lib/supabase';
import type { FinancialError } from '@/types/errors';
import { useState } from 'react';

type PrepareActivation = Readonly<{
  intentId: string;
  attemptId: string | null;
  isReplay: boolean;
}>;

type PrepareActivationResponse = Readonly<{
  activation?: PrepareActivation;
  error?: FinancialError;
}>;

type FunctionInvokeError = Error & Readonly<{
  context?: Readonly<{
    status?: number;
    error?: Partial<FinancialError>;
  }> & Record<string, unknown>;
}>;

const getInvokeStatus = (error: unknown): number | undefined => {
  if (error && typeof error === 'object' && 'context' in error) {
    const context = (error as FunctionInvokeError).context;
    if (context && typeof context.status === 'number') {
      return context.status;
    }
  }
  return undefined;
};

export const useActivateCashProgram = () => {
  const [isActivating, setIsActivating] = useState(false);

  const activateProgram = async (organizationId: string, programId: string) => {
    setIsActivating(true);
    try {
      // 1. Prepare
      const { data: prepareData, error: prepareError } = await supabase.functions.invoke<PrepareActivationResponse>('prepare-cash-activation', {
        body: { organizationId, programId },
      });

      if (prepareError) {
        console.log('activate-cash-program prepare ERROR:', JSON.stringify(prepareError, null, 2));
        console.log(
          'activate-cash-program prepare ERROR context:',
          JSON.stringify((prepareError as FunctionInvokeError).context ?? null, null, 2),
        );
        console.log('activate-cash-program prepare ERROR message:', prepareError.message);
        const status = getInvokeStatus(prepareError);
        throw new Error(
          `Prepare activation failed${status !== undefined ? ` (status ${status})` : ''}: ${prepareError.message || 'Edge Function returned a non-2xx status code'}`,
        );
      }

      if (prepareData?.error) {
        console.log('activate-cash-program prepare ERROR envelope:', JSON.stringify(prepareData.error, null, 2));
        const envelope = prepareData.error;
        throw new Error(
          `Prepare activation failed (${envelope.code}, correlationId: ${envelope.correlationId}): ${envelope.message || 'Prepare activation failed'}`,
        );
      }

      const activation = prepareData?.activation;
      if (!activation?.intentId) {
        console.log('activate-cash-program prepare missing activation:', JSON.stringify(prepareData ?? null, null, 2));
        throw new Error('Prepare activation returned no intent');
      }

      const { intentId, attemptId } = activation;

      if (!attemptId) {
        if (activation.isReplay) {
          return true;
        }
        throw new Error('No attempt generated');
      }

      // 2. Submit
      const { data: submitData, error: submitError } = await supabase.functions.invoke<PrepareActivationResponse>('submit-cash-activation', {
        body: { intentId, attemptId },
      });

      if (submitError) {
        console.log('activate-cash-program submit ERROR:', JSON.stringify(submitError, null, 2));
        console.log(
          'activate-cash-program submit ERROR context:',
          JSON.stringify((submitError as FunctionInvokeError).context ?? null, null, 2),
        );
        const status = getInvokeStatus(submitError);
        throw new Error(
          `Submit activation failed${status !== undefined ? ` (status ${status})` : ''}: ${submitError.message || 'Submit activation failed'}`,
        );
      }

      if (submitData?.error) {
        console.log('activate-cash-program submit ERROR envelope:', JSON.stringify(submitData.error, null, 2));
        throw new Error(
          `Submit activation failed (${submitData.error.code}, correlationId: ${submitData.error.correlationId}): ${submitData.error.message || 'Submit activation failed'}`,
        );
      }

      // 3. Reconcile — the reconciler owns the funding → active transition
      // (markFunded) after verifying full-budget on-chain evidence. The client
      // must never write status='active' directly (trigger 23514 by design).
      await supabase.functions.invoke('reconcile-stellar', {
        body: { programId },
      });

      return true;
    } catch (e: unknown) {
      console.error('Activation Error:', e);
      throw e instanceof Error ? e : new Error('Activation failed');
    } finally {
      setIsActivating(false);
    }
  };

  return { activateProgram, isActivating };
};
