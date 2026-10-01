import { useCallback, useEffect, useState } from 'react';
import { BeneficiaryAppeal, CreateAppealInput } from '@/types/appeal';
import { fetchBeneficiaryAppeals, submitAppeal } from '@/services/appeal-service';
import { useAuth } from '@/context/AuthContext';

export function useAppeals() {
  const { session } = useAuth();
  const [appeals, setAppeals] = useState<BeneficiaryAppeal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(async () => {
    if (!session) {
      setAppeals([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const items = await fetchBeneficiaryAppeals();
      setAppeals(items);
    } catch (err: unknown) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, [session]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const submit = async (input: CreateAppealInput): Promise<BeneficiaryAppeal> => {
    const res = await submitAppeal(input);
    await load();
    return res;
  };

  return {
    appeals,
    isLoading,
    error,
    refresh: load,
    submit,
  };
}
