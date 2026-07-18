import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

export const useOrganizationId = () => {
  const { session } = useAuth();
  const [organizationId, setOrganizationId] = useState<string | null>(null);

  useEffect(() => {
    const fetchOrgId = async () => {
      if (!session?.user?.id) return;
      const { data, error } = await supabase
        .from('organization_memberships')
        .select('organization_id')
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (!error && data) {
        setOrganizationId(data.organization_id);
      }
    };
    void fetchOrgId();
  }, [session?.user?.id]);

  return organizationId;
};
