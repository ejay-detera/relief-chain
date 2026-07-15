import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BrandColors, Spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import type { UserProfile } from '@/types/auth';

import { BeneficiaryList } from '@/components/BeneficiaryVerification/BeneficiaryList';
import { BeneficiaryDetailModal } from '@/components/BeneficiaryVerification/BeneficiaryDetailModal';
import { FilterStatus, StatusFilterTabs } from '@/components/BeneficiaryVerification/StatusFilterTabs';
import { VerificationSearch } from '@/components/BeneficiaryVerification/VerificationSearch';

export default function BeneficiariesVerificationScreen() {
  const [beneficiaries, setBeneficiaries] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<FilterStatus>('All');
  const [activeBeneficiary, setActiveBeneficiary] = useState<UserProfile | null>(null);

  const fetchBeneficiaries = async (showLoading = true) => {
    if (showLoading) {
      Promise.resolve().then(() => {
        setLoading(true);
      });
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
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    Promise.resolve().then(() => {
      fetchBeneficiaries();
    });
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchBeneficiaries(false);
  };

  const handleUpdateStatus = async (id: string, status: 'Verified' | 'Rejected' | 'Pending') => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ verification_status: status })
        .eq('id', id);

      if (error) throw error;
      
      // Update local state directly to prevent full loader flash
      setBeneficiaries((current) =>
        current.map((b) => (b.id === id ? { ...b, verification_status: status } : b))
      );
      Alert.alert('Success', `Beneficiary status updated to ${status}.`);
    } catch (err) {
      console.error('Error updating status:', err);
      Alert.alert('Error', 'Failed to update verification status.');
      throw err;
    }
  };

  const filteredData = beneficiaries.filter((b) => {
    const status = b.verification_status || 'Pending';
    const matchesStatus = selectedStatus === 'All' || status === selectedStatus;

    const query = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !query ||
      (b.full_name || '').toLowerCase().includes(query) ||
      (b.gov_id || '').toLowerCase().includes(query) ||
      (b.mobile_number || '').toLowerCase().includes(query);

    return matchesStatus && matchesSearch;
  });

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <ThemedText style={styles.title}>Beneficiary Verification</ThemedText>
          <ThemedText style={styles.subtitle}>
            Review registration submissions and verify citizen identities.
          </ThemedText>
        </View>

        {/* Search */}
        <VerificationSearch value={searchQuery} onChangeText={setSearchQuery} />

        {/* Filter Tabs */}
        <StatusFilterTabs selected={selectedStatus} onSelect={setSelectedStatus} />

        {/* List */}
        <BeneficiaryList
          data={filteredData}
          loading={loading}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          onSelect={setActiveBeneficiary}
        />

        {/* Profile Detail modal */}
        <BeneficiaryDetailModal
          beneficiary={activeBeneficiary}
          onClose={() => setActiveBeneficiary(null)}
          onUpdateStatus={handleUpdateStatus}
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
  },
});
