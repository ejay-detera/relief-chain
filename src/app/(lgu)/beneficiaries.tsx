import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BeneficiaryDetailModal } from '@/components/BeneficiaryVerification/BeneficiaryDetailModal';
import { BeneficiaryManagementView } from '@/components/BeneficiaryVerification/BeneficiaryManagementView';
import type { FilterStatus } from '@/components/BeneficiaryVerification/StatusFilterTabs';
import { AddMerchantModal } from '@/components/MerchantManagement/AddMerchantModal';
import { MerchantDetailModal } from '@/components/MerchantManagement/MerchantDetailModal';
import { MerchantManagementView } from '@/components/MerchantManagement/MerchantManagementView';
import { FadeInView } from '@/components/shared/FadeInView';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import {
  accreditMerchant,
  fetchOrganizationMerchants,
  removeMerchantAccreditation,
  updateMerchantStatus,
} from '@/services/organizationMerchantService';
import type { UserProfile } from '@/types/auth';
import type {
  AccreditationFilterStatus,
  AccreditedMerchant,
  AddMerchantPayload,
  MerchantAccreditationStatus,
} from '@/types/merchant-management';

export default function BeneficiariesVerificationScreen() {
  const { profile } = useAuth();
  const [managementTab, setManagementTab] = useState<
    'beneficiaries' | 'merchants'
  >('beneficiaries');

  // Beneficiary state
  const [beneficiaries, setBeneficiaries] = useState<UserProfile[]>([]);
  const [loadingBeneficiaries, setLoadingBeneficiaries] = useState(true);
  const [refreshingBeneficiaries, setRefreshingBeneficiaries] = useState(false);
  const [beneficiarySearch, setBeneficiarySearch] = useState('');
  const [selectedBeneficiaryStatus, setSelectedBeneficiaryStatus] =
    useState<FilterStatus>('All');
  const [activeBeneficiary, setActiveBeneficiary] =
    useState<UserProfile | null>(null);

  // Merchant state
  const [merchants, setMerchants] = useState<AccreditedMerchant[]>([]);
  const [loadingMerchants, setLoadingMerchants] = useState(true);
  const [refreshingMerchants, setRefreshingMerchants] = useState(false);
  const [merchantSearch, setMerchantSearch] = useState('');
  const [selectedMerchantStatus, setSelectedMerchantStatus] =
    useState<AccreditationFilterStatus>('All');
  const [activeMerchant, setActiveMerchant] =
    useState<AccreditedMerchant | null>(null);
  const [addMerchantModalVisible, setAddMerchantModalVisible] = useState(false);

  // Fetch beneficiaries
  const fetchBeneficiaries = async (showLoading = true) => {
    if (showLoading) {
      Promise.resolve().then(() => setLoadingBeneficiaries(true));
    }
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'beneficiary')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setBeneficiaries(data || []);
    } catch (err) {
      console.error('Error fetching beneficiaries:', err);
      Alert.alert('Error', 'Unable to retrieve beneficiaries from the database.');
    } finally {
      setLoadingBeneficiaries(false);
      setRefreshingBeneficiaries(false);
    }
  };

  // Fetch merchants
  const fetchMerchants = async (showLoading = true) => {
    if (showLoading) {
      Promise.resolve().then(() => setLoadingMerchants(true));
    }
    try {
      const list = await fetchOrganizationMerchants();
      setMerchants(list);
    } catch (err) {
      console.error('Error fetching merchants:', err);
      Alert.alert('Error', 'Unable to retrieve accredited merchants.');
    } finally {
      setLoadingMerchants(false);
      setRefreshingMerchants(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    Promise.resolve().then(() => {
      if (isMounted) {
        void fetchBeneficiaries(false);
        void fetchMerchants(false);
      }
    });
    return () => {
      isMounted = false;
    };
  }, [profile?.id]);

  // Beneficiary actions
  const handleUpdateBeneficiaryStatus = async (
    id: string,
    status: 'Verified' | 'Rejected' | 'Pending',
  ) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ verification_status: status })
        .eq('id', id);

      if (error) throw error;
      setBeneficiaries((current) =>
        current.map((b) =>
          b.id === id ? { ...b, verification_status: status } : b,
        ),
      );
      Alert.alert('Success', `Beneficiary status updated to ${status}.`);
    } catch (err) {
      console.error('Error updating status:', err);
      Alert.alert('Error', 'Failed to update verification status.');
      throw err;
    }
  };

  // Merchant actions
  const handleUpdateMerchantStatus = async (
    accreditationId: string,
    status: MerchantAccreditationStatus,
    remarks?: string,
    category?: string,
  ) => {
    try {
      const res = await updateMerchantStatus(
        accreditationId,
        status,
        remarks,
        category,
      );
      if (!res.success) throw new Error(res.error);

      setMerchants((current) =>
        current.map((m) =>
          m.accreditation_id === accreditationId
            ? {
                ...m,
                status,
                category: category || m.category,
                remarks: remarks !== undefined ? remarks : m.remarks,
              }
            : m,
        ),
      );
      if (activeMerchant?.accreditation_id === accreditationId) {
        setActiveMerchant((prev) =>
          prev
            ? {
                ...prev,
                status,
                category: category || prev.category,
                remarks: remarks !== undefined ? remarks : prev.remarks,
              }
            : null,
        );
      }
      Alert.alert('Success', 'Merchant account updated successfully.');
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to update merchant status.');
      throw err;
    }
  };

  const handleRemoveMerchant = async (accreditationId: string) => {
    try {
      const res = await removeMerchantAccreditation(accreditationId);
      if (!res.success) throw new Error(res.error);

      setMerchants((current) =>
        current.filter((m) => m.accreditation_id !== accreditationId),
      );
      setActiveMerchant(null);
      Alert.alert(
        'Success',
        'Merchant removed. They will no longer appear for aid programs.',
      );
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to remove merchant.');
      throw err;
    }
  };

  const handleAccreditMerchant = async (payload: AddMerchantPayload) => {
    try {
      const res = await accreditMerchant(payload);
      if (!res.success) throw new Error(res.error);

      await fetchMerchants(false);
      Alert.alert('Success', 'Merchant successfully accredited to organization!');
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to accredit merchant.');
      throw err;
    }
  };

  // Filter beneficiaries
  const filteredBeneficiaries = beneficiaries.filter((b) => {
    const status = b.verification_status || 'Pending';
    const matchesStatus =
      selectedBeneficiaryStatus === 'All' || status === selectedBeneficiaryStatus;

    const query = beneficiarySearch.toLowerCase().trim();
    const matchesSearch =
      !query ||
      (b.full_name || '').toLowerCase().includes(query) ||
      (b.gov_id || '').toLowerCase().includes(query) ||
      (b.mobile_number || '').toLowerCase().includes(query);

    return matchesStatus && matchesSearch;
  });

  // Filter merchants
  const filteredMerchants = merchants.filter((m) => {
    const matchesStatus =
      selectedMerchantStatus === 'All' ||
      m.status.toLowerCase() === selectedMerchantStatus.toLowerCase();

    const query = merchantSearch.toLowerCase().trim();
    const matchesSearch =
      !query ||
      m.display_name.toLowerCase().includes(query) ||
      m.category.toLowerCase().includes(query) ||
      (m.owner_name && m.owner_name.toLowerCase().includes(query));

    return matchesStatus && matchesSearch;
  });

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
        {/* Header with Title and Segment Switcher */}
        <FadeInView delay={0}>
          <View style={styles.header}>
            <ThemedText style={styles.title}>
              {managementTab === 'beneficiaries'
                ? 'Beneficiary Verification'
                : 'Merchant Management'}
            </ThemedText>
            <ThemedText style={styles.subtitle}>
              {managementTab === 'beneficiaries'
                ? 'Review registration submissions and verify citizen identities.'
                : 'Accredit, monitor, and manage partner stores for your aid programs.'}
            </ThemedText>

            {/* Segment Switcher Tabs */}
            <View style={styles.segmentContainer}>
              <Pressable
                onPress={() => setManagementTab('beneficiaries')}
                style={[
                  styles.segmentBtn,
                  managementTab === 'beneficiaries' && styles.segmentBtnActive,
                ]}
              >
                <ThemedText
                  style={[
                    styles.segmentText,
                    managementTab === 'beneficiaries' &&
                      styles.segmentTextActive,
                  ]}
                >
                  Beneficiaries
                </ThemedText>
              </Pressable>
              <Pressable
                onPress={() => setManagementTab('merchants')}
                style={[
                  styles.segmentBtn,
                  managementTab === 'merchants' && styles.segmentBtnActive,
                ]}
              >
                <ThemedText
                  style={[
                    styles.segmentText,
                    managementTab === 'merchants' && styles.segmentTextActive,
                  ]}
                >
                  Merchants
                </ThemedText>
              </Pressable>
            </View>
          </View>
        </FadeInView>

        {/* Tab 1: Beneficiary Management */}
        {managementTab === 'beneficiaries' && (
          <BeneficiaryManagementView
            searchQuery={beneficiarySearch}
            onSearchChange={setBeneficiarySearch}
            selectedStatus={selectedBeneficiaryStatus}
            onStatusChange={setSelectedBeneficiaryStatus}
            data={filteredBeneficiaries}
            loading={loadingBeneficiaries}
            refreshing={refreshingBeneficiaries}
            onRefresh={() => {
              setRefreshingBeneficiaries(true);
              fetchBeneficiaries(false);
            }}
            onSelect={setActiveBeneficiary}
          />
        )}

        {/* Tab 2: Merchant Management */}
        {managementTab === 'merchants' && (
          <MerchantManagementView
            searchQuery={merchantSearch}
            onSearchChange={setMerchantSearch}
            onPressAdd={() => setAddMerchantModalVisible(true)}
            selectedStatus={selectedMerchantStatus}
            onStatusChange={setSelectedMerchantStatus}
            data={filteredMerchants}
            loading={loadingMerchants}
            refreshing={refreshingMerchants}
            onRefresh={() => {
              setRefreshingMerchants(true);
              fetchMerchants(false);
            }}
            onSelect={setActiveMerchant}
          />
        )}

        {/* Beneficiary Detail Modal */}
        <BeneficiaryDetailModal
          beneficiary={activeBeneficiary}
          onClose={() => setActiveBeneficiary(null)}
          onUpdateStatus={handleUpdateBeneficiaryStatus}
        />

        {/* Merchant Detail Modal */}
        <MerchantDetailModal
          merchant={activeMerchant}
          onClose={() => setActiveMerchant(null)}
          onUpdateStatus={handleUpdateMerchantStatus}
          onRemove={handleRemoveMerchant}
        />

        {/* Add / Accredit Merchant Modal */}
        <AddMerchantModal
          visible={addMerchantModalVisible}
          onClose={() => setAddMerchantModalVisible(false)}
          onAccredit={handleAccreditMerchant}
        />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFC',
  },
  safeArea: {
    flex: 1,
  },
  header: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.two,
    backgroundColor: 'white',
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: BrandColors.navy,
  },
  subtitle: {
    fontSize: 12,
    color: BrandColors.grey,
    marginTop: 4,
    marginBottom: Spacing.three,
  },
  segmentContainer: {
    flexDirection: 'row',
    backgroundColor: '#EEEDED',
    borderRadius: BorderRadius.lg,
    padding: 3,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentBtnActive: {
    backgroundColor: BrandColors.navy,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '600',
    color: BrandColors.grey,
  },
  segmentTextActive: {
    color: 'white',
    fontWeight: '700',
  },
});
