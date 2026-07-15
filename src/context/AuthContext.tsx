import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { isUserRole, type AuthContextValue, type UserProfile } from '@/types/auth';
import type { Session } from '@supabase/supabase-js';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

const AuthContext = createContext<AuthContextValue>({
  session: null,
  profile: null,
  isLoading: true,
  profileError: null,
  signOut: async () => null,
  refreshProfile: async () => undefined,
});

const nullableString = (value: unknown): string | null =>
  typeof value === 'string' ? value : null;

const nullableNumber = (value: unknown): number | null =>
  typeof value === 'number' ? value : null;

const toUserProfile = (value: unknown): UserProfile | null => {
  if (!value || typeof value !== 'object') return null;

  const row = value as Record<string, unknown>;
  if (typeof row.id !== 'string' || !isUserRole(row.role)) return null;

  return {
    id: row.id,
    role: row.role,
    full_name: nullableString(row.full_name),
    gov_id: nullableString(row.gov_id),
    location: nullableString(row.location),
    stellar_pubkey: nullableString(row.stellar_pubkey),
    created_at: nullableString(row.created_at),
    first_name: nullableString(row.first_name),
    last_name: nullableString(row.last_name),
    middle_initial: nullableString(row.middle_initial),
    mobile_number: nullableString(row.mobile_number),
    sex: nullableString(row.sex),
    civil_status: nullableString(row.civil_status),
    birthdate: nullableString(row.birthdate),
    gov_id_url: nullableString(row.gov_id_url),
    complete_address: nullableString(row.complete_address),
    municipality_city: nullableString(row.municipality_city),
    verification_status: nullableString(row.verification_status) as UserProfile['verification_status'],
    city_id: nullableNumber(row.city_id),
    area_id: nullableNumber(row.area_id),
    barangay_id: nullableNumber(row.barangay_id),
  };
};

const toProfileError = (error: unknown): Error =>
  error instanceof Error ? error : new Error('Unable to load the authenticated user profile.');

export const useAuth = (): AuthContextValue => useContext(AuthContext);

type AuthProviderProps = { children: React.ReactNode };

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(isSupabaseConfigured);
  const [profileError, setProfileError] = useState<Error | null>(null);
  const authRevision = useRef(0);
  const profileRequest = useRef(0);
  const sessionRef = useRef<Session | null>(null);

  const fetchProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, role, full_name, gov_id, location, stellar_pubkey, created_at, first_name, last_name, middle_initial, mobile_number, sex, civil_status, birthdate, gov_id_url, complete_address, municipality_city, verification_status, city_id, area_id, barangay_id')
      .eq('id', userId)
      .maybeSingle();

    if (error) throw error;

    const nextProfile = toUserProfile(data);
    if (!nextProfile) throw new Error('No valid profile found for the authenticated user.');
    return nextProfile;
  }, []);

  useEffect(() => {
    let isActive = true;

    const applySession = async (nextSession: Session | null) => {
      const request = ++profileRequest.current;
      if (!isActive) return;

      sessionRef.current = nextSession;
      setSession(nextSession);
      setProfile(null);
      setProfileError(null);

      if (!nextSession?.user) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        const nextProfile = await fetchProfile(nextSession.user.id);
        if (!isActive || request !== profileRequest.current) return;

        setProfile(nextProfile);
        setProfileError(null);
      } catch (error: unknown) {
        if (!isActive || request !== profileRequest.current) return;
        console.error('Error fetching profile:', error);
        setProfile(null);
        setProfileError(toProfileError(error));
      } finally {
        if (isActive && request === profileRequest.current) setIsLoading(false);
      }
    };

    if (!isSupabaseConfigured) {
      return () => {
        isActive = false;
        profileRequest.current += 1;
      };
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      authRevision.current += 1;
      void applySession(nextSession);
    });

    const initialRevision = authRevision.current;
    void supabase.auth.getSession()
      .then(({ data, error }) => {
        if (!isActive || initialRevision !== authRevision.current) return;
        if (error) throw error;
        void applySession(data.session);
      })
      .catch((error: unknown) => {
        if (!isActive || initialRevision !== authRevision.current) return;
        console.error('Error loading initial session:', error);
        profileRequest.current += 1;
        setSession(null);
        setProfile(null);
        setProfileError(null);
        setIsLoading(false);
      });

    return () => {
      isActive = false;
      profileRequest.current += 1;
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    return error;
  }, []);

  const refreshProfile = useCallback(async () => {
    const currentSession = sessionRef.current;
    if (!currentSession?.user) return;

    try {
      const nextProfile = await fetchProfile(currentSession.user.id);
      setProfile(nextProfile);
      setProfileError(null);
    } catch (error: unknown) {
      console.error('Error refreshing profile:', error);
      setProfileError(toProfileError(error));
    }
  }, [fetchProfile]);

  return (
    <AuthContext.Provider value={{ session, profile, isLoading, profileError, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
};
