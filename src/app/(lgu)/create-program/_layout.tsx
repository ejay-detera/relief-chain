import { StepUpModal } from '@/components/Mfa/StepUpModal';
import { useAuth } from '@/context/AuthContext';
import { useActivateCashProgram } from '@/hooks/use-activate-cash-program';
import { useMfa } from '@/hooks/use-mfa';
import { useStepUp } from '@/hooks/use-step-up';
import {
    LookupData,
    createLguProgram,
    fetchLguPrograms,
    fetchLookupData,
    updateLguProgram,
} from '@/services/programService';
import type { StepUpEvaluation } from '@/types/mfa';
import { ProgramDraft } from '@/types/program';
import { evaluateStepUp } from '@/utils/step-up';
import { Stack } from 'expo-router';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';

const initialDraft: ProgramDraft = {
  name: '',
  description: '',
  disasterType: '',
  disasterTypeId: null,
  affectedAreas: [],
  affectedAreaIds: [],
  affectedBarangays: [],
  affectedBarangayIds: [],
  districtId: null,
  implementingAgency: '',
  implementingAgencyId: null,
  fundingSource: '',
  fundingSourceId: null,
  totalBudget: 0,
  aidPerHousehold: 0,
  maxBeneficiaries: 0,
  startDate: '',
  endDate: '',
  registrationOpen: '',
  registrationClose: '',
  distributionStart: '',
  distributionEnd: '',
  eligibilityCriteria: [
    'Resident of selected municipality',
    'Government-issued ID required',
    'Household affected by disaster',
    'Not already receiving aid from this program'
  ],
  voucherTypes: [],
  voucherValue: 0,
  voucherQuantity: 1,
  voucherExpiration: '',
  redemptionType: 'cash',
  selectedMerchants: [],
  distributionMethod: 'automatic',
  walletTypeToggle: false,
  autoDistributeToggle: true,
  supportingDocuments: [],
  isPrivate: false,
  requirements: [
    { label: 'Government-Issued Valid ID', type: 'document', isMandatory: true, description: 'Clear photo or PDF copy' },
    { label: 'Current Evacuation / Shelter Address', type: 'text', isMandatory: true },
    { label: 'Number of Dependent Children', type: 'number', isMandatory: true },
    { label: 'Household includes Senior Citizen or PWD', type: 'boolean', isMandatory: false },
  ],
  csvBeneficiaries: [],
};

interface CreateProgramContextProps {
  draft: ProgramDraft;
  updateDraft: (updates: Partial<ProgramDraft>) => void;
  resetDraft: () => void;
  publishProgram: (status: 'draft' | 'published') => Promise<{ success: boolean; programId?: string; organizationId?: string }>;
  programsList: any[];
  setProgramsList: React.Dispatch<React.SetStateAction<any[]>>;
  lookups: LookupData;
  isLoadingLookups: boolean;
  fetchProgramsList: () => Promise<void>;
  editingProgramId: string | null;
  startEditingProgram: (program: any) => void;
  clearEditingState: () => void;
}

const CreateProgramContext = createContext<CreateProgramContextProps | undefined>(undefined);

export function CreateProgramProvider({ children }: { children: React.ReactNode }) {
  const { session, profile } = useAuth();
  const [draft, setDraft] = useState<ProgramDraft>(initialDraft);
  const [programsList, setProgramsList] = useState<any[]>([]);
  const [isLoadingLookups, setIsLoadingLookups] = useState(true);
  const { activateProgram } = useActivateCashProgram();

  // Editing an already-active program requires a fresh MFA step-up before any
  // write (restrictive RLS policy "Active program changes require recent
  // AAL2" on public.programs). This gate prompts for re-verification inline
  // instead of letting the save fail with PGRST116 (0 rows returned by RLS).
  const mfa = useMfa();
  const evaluation: StepUpEvaluation = mfa.assurance
    ? evaluateStepUp(mfa.assurance)
    : { isFresh: false, secondsRemaining: 0, requiresEnrollment: !mfa.isEnabled };
  const stepUp = useStepUp(mfa.factors, evaluation);
  const pendingStepUpResolveRef = useRef<((verified: boolean) => void) | null>(null);

  const waitForStepUp = useCallback((): Promise<boolean> => {
    return new Promise((resolve) => {
      pendingStepUpResolveRef.current = resolve;
      stepUp.begin();
    });
  }, [stepUp]);

  const handleSubmitStepUpCode = useCallback(
    async (code: string) => {
      const verified = await stepUp.submitCode(code);
      if (verified) {
        await mfa.refresh();
        pendingStepUpResolveRef.current?.(true);
        pendingStepUpResolveRef.current = null;
      }
    },
    [mfa, stepUp],
  );

  const handleCancelStepUp = useCallback(() => {
    stepUp.cancel();
    pendingStepUpResolveRef.current?.(false);
    pendingStepUpResolveRef.current = null;
  }, [stepUp]);

  const handleEnrollInsteadOfStepUp = useCallback(() => {
    stepUp.cancel();
    pendingStepUpResolveRef.current?.(false);
    pendingStepUpResolveRef.current = null;
    Alert.alert(
      'Authenticator required',
      'Set up an authenticator app in Settings → Security before editing an active program.',
    );
  }, [stepUp]);

  const [lookups, setLookups] = useState<LookupData>({
    disasterTypes: [],
    cities: [],
    areas: [],
    agencies: [],
    fundingSources: [],
    barangays: [],
  });

  const fetchProgramsList = useCallback(async () => {
    if (!session || !profile) return;
    try {
      const data = await fetchLguPrograms();
      setProgramsList(data);
    } catch (err) {
      console.error('Error fetching programs:', err);
    }
  }, [session, profile]);

  useEffect(() => {
    if (!session || !profile) return;
    let active = true;
    const initialize = async () => {
      try {
        const lookupRes = await fetchLookupData();
        if (active) {
          setLookups(lookupRes);
          setIsLoadingLookups(false);
        }
      } catch (err) {
        console.error('Error loading lookup tables:', err);
      }

      try {
        const programsRes = await fetchLguPrograms();
        if (active) {
          setProgramsList(programsRes);
        }
      } catch (err) {
        console.error('Error fetching programs:', err);
      }
    };

    initialize();

    return () => {
      active = false;
    };
  }, [session, profile]);

  const updateDraft = (updates: Partial<ProgramDraft>) => {
    setDraft((prev) => {
      const next = { ...prev, ...updates };
      if (updates.totalBudget !== undefined || updates.aidPerHousehold !== undefined) {
        const budget = next.totalBudget;
        const aid = next.aidPerHousehold;
        next.maxBeneficiaries = aid > 0 ? Math.floor(budget / aid) : 0;
      }
      return next;
    });
  };

  const [editingProgramId, setEditingProgramId] = useState<string | null>(null);
  // Raw mapped status of the program being edited (fetchLguPrograms maps the
  // database's 'active' to 'published'). Used only to decide whether the
  // step-up gate applies — the server policy remains the sole authority.
  const [editingProgramStatus, setEditingProgramStatus] = useState<string | null>(null);

  const startEditingProgram = (program: any) => {
    setEditingProgramId(program.id);
    setEditingProgramStatus(program.status ?? null);
    setDraft({
      name: program.name,
      description: program.description,
      disasterType: program.disasterType,
      disasterTypeId: program.disasterTypeId,
      affectedAreas: program.affectedAreas || [],
      affectedAreaIds: program.affectedAreaIds || [],
      affectedBarangays: program.affectedBarangays || [],
      affectedBarangayIds: program.affectedBarangayIds || [],
      districtId: program.districtId || null,
      implementingAgency: program.implementingAgency,
      implementingAgencyId: program.implementingAgencyId,
      fundingSource: program.fundingSource,
      fundingSourceId: program.fundingSourceId,
      totalBudget: program.totalBudget,
      aidPerHousehold: program.aidPerHousehold,
      maxBeneficiaries: program.maxBeneficiaries,
      startDate: program.startDate,
      endDate: program.endDate,
      registrationOpen: program.registrationOpen || '',
      registrationClose: program.registrationClose || '',
      distributionStart: program.distributionStart || '',
      distributionEnd: program.distributionEnd || '',
      eligibilityCriteria: program.eligibilityCriteria || [],
      voucherTypes: program.voucherTypes || [],
      voucherValue: program.voucherValue || 0,
      voucherQuantity: program.voucherQuantity || 1,
      voucherExpiration: program.voucherExpiration || '',
      redemptionType: program.redemptionType || 'cash',
      selectedMerchants: program.selectedMerchants || [],
      distributionMethod: program.distributionMethod || 'automatic',
      walletTypeToggle: program.walletTypeToggle || false,
      autoDistributeToggle: program.autoDistributeToggle || true,
      supportingDocuments: program.supportingDocuments || [],
      isPrivate: program.is_private || false,
      requirements: program.requirements || [],
      csvBeneficiaries: [],
    });
  };

  const clearEditingState = () => {
    setEditingProgramId(null);
    setEditingProgramStatus(null);
    resetDraft();
  };

  const resetDraft = () => {
    setDraft(initialDraft);
  };

  const publishProgram = async (status: 'draft' | 'published'): Promise<{ success: boolean; programId?: string; organizationId?: string }> => {
    try {
      // Editing a program that is currently active requires a fresh step-up
      // (restrictive RLS). Prompt before attempting the write so the user
      // gets a clear re-verification step instead of a bare PGRST116 error.
      const requiresStepUpGate = !!editingProgramId && editingProgramStatus === 'published';
      if (requiresStepUpGate && !evaluation.isFresh) {
        const verified = await waitForStepUp();
        if (!verified) {
          return { success: false };
        }
      }

      let result: { success: boolean; programId?: string; organizationId?: string } = { success: false };

      // Step 1: ALWAYS save the database row as a draft first. 
      // Financial constraints prevent direct inserts of 'active' status without funding evidence.
      if (editingProgramId) {
        result = await updateLguProgram(editingProgramId, draft, 'draft');
      } else {
        result = await createLguProgram(draft, 'draft', profile?.id || null);
        if (result.success && result.programId) {
          setEditingProgramId(result.programId);
        }
      }

      if (!result.success || !result.programId || !result.organizationId) {
        return { success: false };
      }

      // Step 2: If the user requested to publish, we invoke the Edge Function activation flow.
      if (status === 'published') {
        await activateProgram(result.organizationId, result.programId);
      }

      await fetchProgramsList();
      clearEditingState();
      return result;
    } catch (err: any) {
      console.error('Error saving program:', err);
      Alert.alert('Database Error', err.message || 'Could not save program details to the database.');
      return { success: false };
    }
  };

  return (
    <CreateProgramContext.Provider
      value={{
        draft,
        updateDraft,
        resetDraft,
        publishProgram,
        programsList,
        setProgramsList,
        lookups,
        isLoadingLookups,
        fetchProgramsList,
        editingProgramId,
        startEditingProgram,
        clearEditingState,
      }}>
      {children}
      <StepUpModal
        actionDescription="save changes to this active program"
        errorMessage={stepUp.error}
        isVerifying={stepUp.phase === 'verifying'}
        onCancel={handleCancelStepUp}
        onEnrollInstead={handleEnrollInsteadOfStepUp}
        onSubmitCode={handleSubmitStepUpCode}
        requiresEnrollment={evaluation.requiresEnrollment}
        visible={stepUp.phase === 'prompting' || stepUp.phase === 'verifying'}
      />
    </CreateProgramContext.Provider>
  );
}

export function useCreateProgram() {
  const context = useContext(CreateProgramContext);
  if (!context) {
    throw new Error('useCreateProgram must be used within a CreateProgramProvider');
  }
  return context;
}

export default function CreateProgramLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
