import { FontAwesome } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { DisbursementHistoryCard } from '@/components/DisbursementHistory/DisbursementHistoryCard';
import { DistributeAidWizard } from '@/components/DistributeAid/DistributeAidWizard';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BrandColors, FloatingTabBarGap, FloatingTabBarHeight, Spacing } from '@/constants/theme';
import { Disbursement, fetchDisbursements } from '@/services/disbursementService';

export default function DistributeScreen() {
  const insets = useSafeAreaInsets();
  const [showWizard, setShowWizard] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [pastDistributions, setPastDistributions] = useState<Disbursement[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadDisbursements = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await fetchDisbursements();
      setPastDistributions(data);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Disbursement history is unavailable.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    Promise.resolve().then(() => {
      void loadDisbursements();
    });
  }, [loadDisbursements]);

  const handleCopyHash = useCallback(async (hash: string) => {
    await Clipboard.setStringAsync(hash);
  }, []);

  const handleOpenJob = useCallback((jobId: string) => {
    setSelectedJobId(jobId);
    setShowWizard(true);
  }, []);

  const handleCreate = useCallback(() => {
    setSelectedJobId(null);
    setShowWizard(true);
  }, []);

  const handleCloseWizard = useCallback(() => {
    setShowWizard(false);
    setSelectedJobId(null);
  }, []);

  const handleJobCompleted = useCallback(() => {
    setShowWizard(false);
    setSelectedJobId(null);
    void loadDisbursements();
  }, [loadDisbursements]);

  const query = searchQuery.toLowerCase();
  const filteredDistributions = pastDistributions.filter(
    (d) =>
      d.programName.toLowerCase().includes(query) ||
      d.disasterEvent.toLowerCase().includes(query) ||
      (d.txHash || '').toLowerCase().includes(query) ||
      d.status.toLowerCase().includes(query),
  );

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
      <ThemedView style={styles.content}>
        <View style={styles.header}>
          <View>
            <ThemedText style={styles.title}>Disbursement History</ThemedText>
            <ThemedText style={styles.subtitle}>Track past aid distributions on the Stellar blockchain.</ThemedText>
          </View>
        </View>

        <View style={styles.searchBar}>
          <FontAwesome name="search" size={14} color={BrandColors.grey} style={styles.searchIcon} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search disbursements history..."
            placeholderTextColor={BrandColors.grey}
            style={styles.searchInput}
          />
        </View>

        <FlatList
          data={filteredDistributions}
          renderItem={({ item }) => (
            <DisbursementHistoryCard item={item} onCopyHash={handleCopyHash} onOpen={handleOpenJob} />
          )}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: insets.bottom + FloatingTabBarGap + FloatingTabBarHeight + Spacing.six },
          ]}
          ListEmptyComponent={
            loading ? (
              <View style={styles.center}>
                <ActivityIndicator size="large" color={BrandColors.navy} />
              </View>
            ) : loadError ? (
              <ErrorState message={loadError} onRetry={loadDisbursements} />
            ) : (
              <EmptyState
                title="No disbursements yet"
                description="Distributions you authorize will appear here with their reconciled status. Start your first distribution to see it."
                actionLabel="Start a distribution"
                onAction={handleCreate}
              />
            )
          }
        />

        <Pressable
          accessibilityLabel="Start a distribution"
          accessibilityRole="button"
          onPress={handleCreate}
          style={[
            styles.fab,
            { bottom: insets.bottom + FloatingTabBarGap + FloatingTabBarHeight + Spacing.three },
          ]}
        >
          <FontAwesome name="plus" size={20} color="white" />
        </Pressable>

        <Modal
          visible={showWizard}
          animationType="slide"
          presentationStyle="fullScreen"
          onRequestClose={handleCloseWizard}
        >
          <SafeAreaView style={styles.wizardContainer}>
            <DistributeAidWizard
              key={selectedJobId ?? 'new'}
              onClose={handleCloseWizard}
              onCompleted={handleJobCompleted}
              initialJobId={selectedJobId}
            />
          </SafeAreaView>
        </Modal>
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFC',
  },
  wizardContainer: {
    flex: 1,
    backgroundColor: '#FAFAFC',
  },
  content: {
    flex: 1,
    backgroundColor: '#FAFAFC',
  },
  header: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.two,
    backgroundColor: 'white',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  fab: {
    position: 'absolute',
    right: 16,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: BrandColors.navy,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    margin: Spacing.four,
    paddingHorizontal: Spacing.three,
    borderRadius: 12,
    height: 46,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  searchIcon: {
    marginRight: Spacing.two,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_400Regular',
  },
  list: {
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 80,
  },
});
