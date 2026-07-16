import { FontAwesome } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { DistributeAidWizard } from '@/components/DistributeAid/DistributeAidWizard';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BorderRadius, BrandColors, FloatingTabBarGap, FloatingTabBarHeight, Spacing } from '@/constants/theme';
import { Disbursement, fetchDisbursements } from '@/services/disbursementService';

export default function DistributeScreen() {
  const insets = useSafeAreaInsets();
  const [showWizard, setShowWizard] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [pastDistributions, setPastDistributions] = useState<Disbursement[]>([]);
  const [loading, setLoading] = useState(true);

  const loadDisbursements = async () => {
    try {
      const data = await fetchDisbursements();
      setPastDistributions(data);
    } catch (err) {
      console.error('Error fetching disbursements:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    Promise.resolve().then(() => {
      loadDisbursements();
    });
  }, []);

  const handleCopyHash = async (hash: string) => {
    await Clipboard.setStringAsync(hash);
  };

  const handleJobCompleted = () => {
    setShowWizard(false);
    // Refresh history from reconciled server state rather than a client-fabricated row.
    void loadDisbursements();
  };

  const filteredDistributions = pastDistributions.filter((d) =>
    d.programName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    d.disasterEvent.toLowerCase().includes(searchQuery.toLowerCase()) ||
    d.txHash.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderItem = ({ item }: { item: Disbursement }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <FontAwesome name="check-circle" size={16} color={BrandColors.green} />
          <ThemedText style={styles.programName}>{item.programName}</ThemedText>
        </View>
        <ThemedText style={styles.dateText}>{item.date}</ThemedText>
      </View>

      <ThemedText style={styles.eventText}>Disaster: {item.disasterEvent}</ThemedText>

      <View style={styles.cardBody}>
        <View style={styles.stat}>
          <ThemedText style={styles.statLabel}>Total Payout</ThemedText>
          <ThemedText style={styles.statValuePayout}>₱{item.amount.toLocaleString()}</ThemedText>
        </View>
        <View style={styles.stat}>
          <ThemedText style={styles.statLabel}>Households Served</ThemedText>
          <ThemedText style={styles.statValue}>{item.recipientsCount} Families</ThemedText>
        </View>
      </View>

      <View style={styles.hashRow}>
        <ThemedText numberOfLines={1} style={styles.hashText}>Hash: {item.txHash}</ThemedText>
        <Pressable onPress={() => handleCopyHash(item.txHash)} style={styles.copyBtn}>
          <FontAwesome name="copy" size={12} color={BrandColors.navy} />
        </Pressable>
      </View>
    </View>
  );

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
      <ThemedView style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <ThemedText style={styles.title}>Disbursement History</ThemedText>
            <ThemedText style={styles.subtitle}>Track past aid distributions on the Stellar blockchain.</ThemedText>
          </View>
        </View>

        {/* Search */}
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

        {/* List */}
        <FlatList
          data={filteredDistributions}
          renderItem={renderItem}
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
            ) : (
              <View style={styles.center}>
                <FontAwesome name="history" size={48} color={BrandColors.lightGray} style={styles.emptyIcon} />
                <ThemedText style={styles.emptyText}>No distribution records found</ThemedText>
              </View>
            )
          }
        />

        {/* FAB - Distribute Aid */}
        <Pressable
          onPress={() => setShowWizard(true)}
          style={[
            styles.fab,
            { bottom: insets.bottom + FloatingTabBarGap + FloatingTabBarHeight + Spacing.three },
          ]}
        >
          <FontAwesome name="plus" size={20} color="white" />
        </Pressable>

        {/* Wizard Modal (hides bottom navbar/tab bar because it is a fullScreen Modal) */}
        <Modal
          visible={showWizard}
          animationType="slide"
          presentationStyle="fullScreen"
          onRequestClose={() => setShowWizard(false)}
        >
          <SafeAreaView style={styles.wizardContainer}>
            <DistributeAidWizard
              onClose={() => setShowWizard(false)}
              onCompleted={handleJobCompleted}
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
  card: {
    backgroundColor: 'white',
    borderRadius: BorderRadius.lg,
    padding: Spacing.four,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    flex: 1,
    marginRight: Spacing.two,
  },
  programName: {
    fontSize: 15,
    fontWeight: 'bold',
    color: BrandColors.navy,
  },
  dateText: {
    fontSize: 12,
    color: BrandColors.grey,
  },
  eventText: {
    fontSize: 12,
    color: BrandColors.grey,
    marginBottom: Spacing.three,
    marginLeft: 22,
  },
  cardBody: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#FAFAFC',
    borderRadius: BorderRadius.md,
    padding: Spacing.three,
    marginBottom: Spacing.three,
  },
  stat: {
    flex: 1,
  },
  statLabel: {
    fontSize: 11,
    color: BrandColors.grey,
    marginBottom: 2,
  },
  statValue: {
    fontSize: 13,
    fontWeight: 'bold',
    color: BrandColors.navy,
  },
  statValuePayout: {
    fontSize: 14,
    fontWeight: 'bold',
    color: BrandColors.green,
  },
  hashRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E2E8F0',
    paddingTop: Spacing.two,
  },
  hashText: {
    fontSize: 10,
    color: BrandColors.grey,
    fontFamily: 'monospace',
    flex: 1,
    marginRight: Spacing.two,
  },
  copyBtn: {
    padding: 2,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 80,
  },
  emptyIcon: {
    marginBottom: Spacing.three,
  },
  emptyText: {
    fontSize: 14,
    color: BrandColors.grey,
    fontWeight: '600',
  },
});
