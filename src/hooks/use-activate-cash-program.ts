import { supabase } from '@/lib/supabase';
import { useState } from 'react';

export const useActivateCashProgram = () => {
  const [isActivating, setIsActivating] = useState(false);

  const activateProgram = async (organizationId: string, programId: string) => {
    setIsActivating(true);
    try {
      // 1. Prepare
      const { data: prepareData, error: prepareError } = await supabase.functions.invoke('prepare-cash-activation', {
        body: { organizationId, programId },
      });

      if (prepareError) {
        throw new Error(prepareError.message || 'Prepare activation failed');
      }

      if (prepareData?.error) {
        throw new Error(prepareData.error.message || 'Prepare activation failed');
      }

      const { intentId, attemptId } = prepareData.activation;

      if (!attemptId) {
        if (prepareData.activation.isReplay) {
           return true; 
        }
        throw new Error('No attempt generated');
      }

      // 2. Submit
      const { data: submitData, error: submitError } = await supabase.functions.invoke('submit-cash-activation', {
        body: { intentId, attemptId },
      });

      if (submitError) {
        throw new Error(submitError.message || 'Submit activation failed');
      }

      if (submitData?.error) {
        throw new Error(submitData.error.message || 'Submit activation failed');
      }

      // 3. Reconcile
      await supabase.functions.invoke('reconcile-stellar', {
        body: { programId },
      });

      // 4. Mark program as active
      const { error: statusError } = await supabase
        .from('programs')
        .update({ status: 'active' })
        .eq('id', programId);
      if (statusError) {
        console.error('Failed to update program status to active:', statusError);
        // Continue without throwing to keep activation flow intact
      }

      return true;
    } catch (e: any) {
      console.error('Activation Error:', e);
      throw e;
    } finally {
      setIsActivating(false);
    }
  };

  return { activateProgram, isActivating };
};
