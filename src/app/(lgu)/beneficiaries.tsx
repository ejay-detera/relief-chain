import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BeneficiaryDetailModal } from '@/components/BeneficiaryVerification/BeneficiaryDetailModal';
import { BeneficiaryManagementView } from '@/components/BeneficiaryVerification/BeneficiaryManagementView';
import type { FilterStatus } from '@/components/BeneficiaryVerification/StatusFilterTabs';
import {
  ApplicationFilterStatus,
  MerchantApplicationsView,
} from '@/components/MerchantManagement/MerchantApplicationsView';
import { MerchantDetailModal } from '@/components/MerchantManagement/MerchantDetailModal';
import { MerchantManagementView } from '@/components/MerchantManagement/MerchantManagementView';
import { FadeInView } from '@/components/shared/FadeInView';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import {
  fetchOrganizationMerchantApplications,
  fetchOrganizationMerchants,
  removeMerchantAccreditation,
  reviewMerchantApplication,
  updateMerchantStatus,
} from '@/services/organizationMerchantService';
import type { UserProfile } from '@/types/auth';
import type {
  AccreditationFilterStatus,
  AccreditedMerchant,
  MerchantAccreditationStatus,
  MerchantProgramApplicant,
} from '@/types/merchant-management';

export default function BeneficiariesVerificationScreen() {
  const { profile } = useAuth();
  const [managementTab, setManagementTab] = useState<
    'beneficiaries' | 'merchants'
  >('beneficiaries');

  // Sub-tab inside Merchant Management
  const [merchantSubTab, setMerchantSubTab] = useState<
    'applications' | 'accredited'
  >('applications');

  // Beneficiary state
  const [beneficiaries, setBeneficiaries] = useState<UserProfile[]>([]);
  const [loadingBeneficiaries, setLoadingBeneficiaries] = useState(true);
  const [refreshingBeneficiaries, setRefreshingBeneficiaries] = useState(false);
  const [beneficiarySearch, setBeneficiarySearch] = useState('');
  const [selectedBeneficiaryStatus, setSelectedBeneficiaryStatus] =
    useState<FilterStatus>('All');
  const [activeBeneficiary, setActiveBeneficiary] =
    useState<UserProfile | null>(null);

  // Merchant accreditations state
  const [merchants, setMerchants] = useState<AccreditedMerchant[]>([]);
  const [loadingMerchants, setLoadingMerchants] = useState(true);
  const [refreshingMerchants, setRefreshingMerchants] = useState(false);
  const [merchantSearch, setMerchantSearch] = useState('');
  const [selectedMerchantStatus, setSelectedMerchantStatus] =
    useState<AccreditationFilterStatus>('All');
  const [activeMerchant, setActiveMerchant] =
    useState<AccreditedMerchant | null>(null);

  // Merchant program applications state
  const [applications, setApplications] = useState<MerchantProgramApplicant[]>([]);
  const [loadingApplications, setLoadingApplications] = useState(true);
  const [refreshingApplications, setRefreshingApplications] = useState(false);
  const [applicationSearch, setApplicationSearch] = useState('');
  const [selectedApplicationStatus, setSelectedApplicationStatus] =
    useState<ApplicationFilterStatus>('All');

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

  // Fetch accredited merchants
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

  // Fetch incoming merchant program applications
  const fetchApplications = async (showLoading = true) => {
    if (showLoading) {
      Promise.resolve().then(() => setLoadingApplications(true));
    }
    try {
      const list = await fetchOrganizationMerchantApplications();
      setApplications(list);
    } catch (err) {
      console.error('Error fetching merchant applications:', err);
      Alert.alert('Error', 'Unable to retrieve merchant applications.');
    } finally {
      setLoadingApplications(false);
      setRefreshingApplications(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    Promise.resolve().then(() => {
      if (isMounted) {
        void fetchBeneficiaries(false);
        void fetchMerchants(false);
        void fetchApplications(false);
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

  // Merchant accreditation actions
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

  // Application actions (review: approve or decline)
  const handleApproveApplication = async (applicant: MerchantProgramApplicant) => {
    try {
      const res = await reviewMerchantApplication(applicant.application_id, 'approved');
      if (!res.success) {
        Alert.alert('Error', res.error || 'Failed to approve application.');
        return;
      }
      Alert.alert(
        'Merchant Accredited',
        `"${applicant.display_name}" is now accredited for ${applicant.program_name || 'the aid program'}.`,
      );
      await Promise.all([fetchApplications(false), fetchMerchants(false)]);
    } catch (err: any) {
      console.error('Error approving merchant application:', err);
      Alert.alert('Error', err?.message || 'Failed to approve application.');
    }
  };

  const handleRejectApplication = async (
    applicant: MerchantProgramApplicant,
    reason: string,
  ) => {
    try {
      const res = await reviewMerchantApplication(applicant.application_id, 'rejected', reason);
      if (!res.success) {
        Alert.alert('Error', res.error || 'Failed to decline application.');
        return;
      }
      Alert.alert(
        'Application Declined',
        `Application for "${applicant.display_name}" has been declined.`,
      );
      await fetchApplications(false);
    } catch (err: any) {
      console.error('Error declining merchant application:', err);
      Alert.alert('Error', err?.message || 'Failed to decline application.');
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

  // Filter accredited merchants
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

  // Filter merchant applications
  const filteredApplications = applications.filter((app) => {
    const matchesStatus =
      selectedApplicationStatus === 'All' ||
      app.status.toLowerCase() === selectedApplicationStatus.toLowerCase();

    const query = applicationSearch.toLowerCase().trim();
    const matchesSearch =
      !query ||
      app.display_name.toLowerCase().includes(query) ||
      (app.program_name && app.program_name.toLowerCase().includes(query)) ||
      (app.owner_name && app.owner_name.toLowerCase().includes(query)) ||
      (app.notes && app.notes.toLowerCase().includes(query));

    return matchesStatus && matchesSearch;
  });

  const pendingAppsCount = applications.filter((a) => a.status === 'pending').length;

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
                : 'Review voluntary merchant applications and monitor accredited partner stores.'}
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
                <View style={styles.segmentTextWithBadge}>
                  <ThemedText
                    style={[
                      styles.segmentText,
                      managementTab === 'merchants' && styles.segmentTextActive,
                    ]}
                  >
                    Merchants
                  </ThemedText>
                  {pendingAppsCount > 0 && (
                    <View style={styles.headerCountBadge}>
                      <ThemedText style={styles.headerCountBadgeText}>
                        {pendingAppsCount}
                      </ThemedText>
                    </View>
                  )}
                </View>
              </Pressable>
            </View>

            {/* Sub-Segment Switcher for Merchants */}
            {managementTab === 'merchants' && (
              <View style={styles.subSegmentWrapper}>
                <View style={styles.subSegmentContainer}>
                  <Pressable
                    onPress={() => setMerchantSubTab('applications')}
                    style={[
                      styles.subSegmentBtn,
                      merchantSubTab === 'applications' && styles.subSegmentBtnActive,
                    ]}
                  >
                    <View style={styles.subSegmentBtnRow}>
                      <ThemedText
                        style={[
                          styles.subSegmentText,
                          merchantSubTab === 'applications' && styles.subSegmentTextActive,
                        ]}
                      >
                        Applications
                      </ThemedText>
                      {pendingAppsCount > 0 && (
                        <View
                          style={[
                            styles.subCountBadge,
                            merchantSubTab === 'applications'
                              ? styles.subCountBadgeActive
                              : styles.subCountBadgeInactive,
                          ]}
                        >
                          <ThemedText
                            style={[
                              styles.subCountBadgeText,
                              merchantSubTab === 'applications'
                                ? styles.subCountBadgeTextActive
                                : styles.subCountBadgeTextInactive,
                            ]}
                          >
                            {pendingAppsCount}
                          </ThemedText>
                        </View>
                      )}
                    </View>
                  </Pressable>

                  <Pressable
                    onPress={() => setMerchantSubTab('accredited')}
                    style={[
                      styles.subSegmentBtn,
                      merchantSubTab === 'accredited' && styles.subSegmentBtnActive,
                    ]}
                  >
                    <ThemedText
                      style={[
                        styles.subSegmentText,
                        merchantSubTab === 'accredited' && styles.subSegmentTextActive,
                      ]}
                    >
                      Accredited Stores ({merchants.length})
                    </ThemedText>
                  </Pressable>
                </View>
              </View>
            )}
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
        {managementTab === 'merchants' && merchantSubTab === 'applications' && (
          <MerchantApplicationsView
            searchQuery={applicationSearch}
            onSearchChange={setApplicationSearch}
            selectedStatus={selectedApplicationStatus}
            onStatusChange={setSelectedApplicationStatus}
            data={filteredApplications}
            loading={loadingApplications}
            refreshing={refreshingApplications}
            onRefresh={() => {
              setRefreshingApplications(true);
              fetchApplications(false);
            }}
            onApprove={handleApproveApplication}
            onReject={handleRejectApplication}
          />
        )}

        {managementTab === 'merchants' && merchantSubTab === 'accredited' && (
          <MerchantManagementView
            searchQuery={merchantSearch}
            onSearchChange={setMerchantSearch}
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
  segmentTextWithBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerCountBadge: {
    backgroundColor: BrandColors.green,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 6,
    paddingVertical: 1,
    minWidth: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCountBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
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
  subSegmentWrapper: {
    marginTop: Spacing.two,
    paddingTop: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E7EB',
  },
  subSegmentContainer: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: BorderRadius.md,
    padding: 3,
  },
  subSegmentBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subSegmentBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
    elevation: 1,
  },
  subSegmentBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  subSegmentText: {
    fontSize: 12,
    fontWeight: '600',
    color: BrandColors.grey,
  },
  subSegmentTextActive: {
    color: BrandColors.navy,
    fontWeight: '700',
  },
  subCountBadge: {
    borderRadius: BorderRadius.full,
    paddingHorizontal: 6,
    paddingVertical: 1,
    minWidth: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subCountBadgeActive: {
    backgroundColor: BrandColors.green,
  },
  subCountBadgeInactive: {
    backgroundColor: '#E5E7EB',
  },
  subCountBadgeText: {
    fontSize: 9,
    fontWeight: 'bold',
  },
  subCountBadgeTextActive: {
    color: '#FFFFFF',
  },
  subCountBadgeTextInactive: {
    color: BrandColors.navy,
  },
});
