import { useAuth } from '@/context/AuthContext';
import { applyToProgram, fetchOrganizationPrograms } from '@/services/organizationService';
import { OrganizationProgram } from '@/types/organization';
import { useCallback, useEffect, useState } from 'react';

export function useOrganizationPrograms() {
  const { session, profile } = useAuth();
  const [organizations, setOrganizations] = useState<OrganizationProgram[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const barangayId = profile?.barangay_id ?? null;

  const load = useCallback(async () => {
    if (!session) return;

    setIsLoading(true);
    try {
      const data = await fetchOrganizationPrograms(session.user.id, barangayId);
      setOrganizations(data);
      setError(null);
    } catch (e) {
      console.error('Error fetching organization programs', e);
      setOrganizations([]);
      setError(e instanceof Error ? e : new Error('Unable to load organizations.'));
    } finally {
      setIsLoading(false);
    }
  }, [session, barangayId]);

  useEffect(() => {
    void load();
  }, [load]);

  const apply = useCallback(
    async (program: OrganizationProgram) => {
      if (!session) throw new Error('You must be signed in to apply.');
      await applyToProgram(session.user.id, program);
      await load();
    },
    [session, load]
  );

  return { organizations, isLoading, error, retry: load, applyToProgram: apply };
}
