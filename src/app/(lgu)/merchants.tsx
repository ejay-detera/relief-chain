import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome } from '@expo/vector-icons';
import { ThemedText } from '@/components/themed-text';
import { EmptyState } from '@/components/shared/empty-state';
import { MerchantApplicationCard } from '@/components/OrgMerchants/MerchantApplicationCard';
import { MerchantDetailModal } from '@/components/OrgMerchants/MerchantDetailModal';
import { AccreditedMerchantList } from '@/components/OrgMerchants/AccreditedMerchantList';
import {
  fetchPendingMerchants, fetchAccreditedMerchants,
  type PendingMerchant, type AccreditedMerchant
} from '@/services/merchantManagementService';
import { useOrganizationId } from '@/hooks/use-organization-id';
import { BrandColors, BottomTabInset, FloatingTabBarHeight, FloatingTabBarGap, BorderRadius, Spacing } from '@/constants/theme';

type Tab = 'pending' | 'accredited';

export default function MerchantsScreen() {
  const organizationId = useOrganizationId();
  const [activeTab, setActiveTab] = useState<Tab>('pending');
  const [pendingMerchants, setPendingMerchants] = useState<PendingMerchant[]>([]);
  const [accreditedMerchants, setAccreditedMerchants] = useState<AccreditedMerchant[]>([]);
  const [selectedMerchant, setSelectedMerchant] = useState<PendingMerchant | null>(null);
  const [search, setSearch] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    if (!organizationId) return;
    const [pending, accredited] = await Promise.all([
      fetchPendingMerchants(organizationId),
      fetchAccreditedMerchants(organizationId),
    ]);
    setPendingMerchants(pending);
    setAccreditedMerchants(accredited);
  }, [organizationId]);

  useEffect(() => { void loadData(); }, [loadData]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadData();
    setIsRefreshing(false);
  };

  const filteredPending = pendingMerchants.filter((m) =>
    m.displayName.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <View style={styles.header}>
        <ThemedText style={styles.pageTitle}>Merchant Management</ThemedText>
      </View>
      <View style={styles.tabs}>
        {(['pending', 'accredited'] as Tab[]).map((tab) => (
          <Pressable key={tab} style={[styles.tab, activeTab === tab && styles.tabActive]} onPress={() => setActiveTab(tab)} accessibilityRole="tab">
            <ThemedText style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab === 'pending' ? `Pending (${pendingMerchants.length})` : `Accredited (${accreditedMerchants.length})`}
            </ThemedText>
          </Pressable>
        ))}
      </View>
      {activeTab === 'pending' && (
        <>
          <View style={styles.searchRow}>
            <FontAwesome name="search" size={14} color={BrandColors.grey} />
            <TextInput style={styles.searchInput} value={search} onChangeText={setSearch} placeholder="Search by business name..." placeholderTextColor={BrandColors.grey} />
          </View>
          <ScrollView
            refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
            contentContainerStyle={{ paddingBottom: BottomTabInset + FloatingTabBarGap + FloatingTabBarHeight + Spacing.four }}
          >
            {filteredPending.length === 0
              ? <EmptyState title="No Pending Applications" description="New applications will appear here." />
              : filteredPending.map((m) => (
                  <MerchantApplicationCard key={m.accreditationId} merchant={m} onPress={() => setSelectedMerchant(m)} />
                ))
            }
          </ScrollView>
        </>
      )}
      {activeTab === 'accredited' && organizationId && (
        <AccreditedMerchantList
          merchants={accreditedMerchants}
          organizationId={organizationId}
          onRefresh={loadData}
        />
      )}
      {organizationId && (
        <MerchantDetailModal
          merchant={selectedMerchant}
          visible={selectedMerchant !== null}
          organizationId={organizationId}
          onClose={() => setSelectedMerchant(null)}
          onDecisionComplete={loadData}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FAFAFC' },
  header: { paddingHorizontal: Spacing.four, paddingTop: Spacing.three, paddingBottom: Spacing.two },
  pageTitle: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 22, color: BrandColors.navy },
  tabs: { flexDirection: 'row', marginHorizontal: Spacing.three, backgroundColor: BrandColors.lightGray, borderRadius: BorderRadius.xl, padding: 4, marginBottom: Spacing.three },
  tab: { flex: 1, paddingVertical: Spacing.two, alignItems: 'center', borderRadius: BorderRadius.lg },
  tabActive: { backgroundColor: BrandColors.navy },
  tabText: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 12, color: BrandColors.grey },
  tabTextActive: { color: '#FFF' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginHorizontal: Spacing.three, marginBottom: Spacing.two, backgroundColor: '#FFF', borderRadius: BorderRadius.md, borderWidth: 1, borderColor: BrandColors.lightGray, paddingHorizontal: Spacing.two, paddingVertical: Spacing.two },
  searchInput: { flex: 1, fontFamily: 'PlusJakartaSans_400Regular', fontSize: 13, color: BrandColors.navy },
});
