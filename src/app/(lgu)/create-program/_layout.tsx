import { useAuth } from '@/context/AuthContext';
import {
  LookupData,
  createLguProgram,
  fetchLguPrograms,
  fetchLookupData,
  updateLguProgram,
} from '@/services/programService';
import { ProgramDraft } from '@/types/program';
import { Stack } from 'expo-router';
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Alert } from 'react-native';
import { useActivateCashProgram } from '@/hooks/use-activate-cash-program';

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

  const startEditingProgram = (program: any) => {
    setEditingProgramId(program.id);
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
    });
  };

  const clearEditingState = () => {
    setEditingProgramId(null);
    resetDraft();
  };

  const resetDraft = () => {
    setDraft(initialDraft);
  };

  const publishProgram = async (status: 'draft' | 'published'): Promise<{ success: boolean; programId?: string; organizationId?: string }> => {
    try {
      let result: { success: boolean; programId?: string; organizationId?: string } = { success: false };
      
      // Step 1: ALWAYS save the database row as a draft first. 
      // Financial constraints prevent direct inserts of 'active' status without funding evidence.
      if (editingProgramId) {
        result = await updateLguProgram(editingProgramId, draft, 'draft');
      } else {
        result = await createLguProgram(draft, 'draft', profile?.id || null);
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
