import React from 'react';
import { View, StyleSheet, FlatList, Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useCreateProgram } from './create-program/_layout';
import { BrandColors, BorderRadius, Spacing } from '@/constants/theme';

export default function LguProgramsScreen() {
  const router = useRouter();
  const { programsList } = useCreateProgram();

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 0 }).format(val);
  };

  const renderProgramCard = ({ item }: { item: any }) => {
    const isPublished = item.status === 'published';
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View>
            <Text style={styles.cardTitle}>{item.name}</Text>
            <View style={styles.badgeContainer}>
              <View style={[styles.disasterBadge, { backgroundColor: '#E1F5FE' }]}>
                <Text style={[styles.disasterText, { color: '#0288D1' }]}>{item.disasterType}</Text>
              </View>
              <View style={[styles.agencyBadge]}>
                <Text style={styles.agencyText}>{item.implementingAgency}</Text>
              </View>
            </View>
          </View>
          <View style={[styles.statusBadge, isPublished ? styles.statusPublished : styles.statusDraft]}>
            <Text style={[styles.statusText, isPublished ? styles.statusTextPublished : styles.statusTextDraft]}>
              {item.status.toUpperCase()}
            </Text>
          </View>
        </View>

        <Text style={styles.cardDesc} numberOfLines={2}>
          {item.description}
        </Text>

        <View style={styles.cardDivider} />

        <View style={styles.cardFooter}>
          <View>
            <Text style={styles.footerLabel}>Total Budget</Text>
            <Text style={styles.footerValue}>{formatCurrency(item.totalBudget)}</Text>
          </View>
          <View style={styles.alignRight}>
            <Text style={styles.footerLabel}>Estimated Beneficiaries</Text>
            <Text style={styles.footerValue}>{item.maxBeneficiaries.toLocaleString()} HHs</Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Relief Programs</Text>
        <Text style={styles.headerSubtitle}>Monitor and distribute aid initiatives</Text>
      </View>

      <FlatList
        data={programsList}
        keyExtractor={(item) => item.id}
        renderItem={renderProgramCard}
        contentContainerStyle={styles.listContainer}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>📦</Text>
            <Text style={styles.emptyTitle}>No Programs Active</Text>
            <Text style={styles.emptySubtitle}>Click the button below to configure your first aid distribution program.</Text>
          </View>
        }
      />

      {/* FAB - Create Program */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push('/(lgu)/create-program' as any)}>
        <Text style={styles.fabIcon}>+</Text>
        <Text style={styles.fabText}>Create Program</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF9F6',
  },
  header: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.five,
    paddingBottom: Spacing.three,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: BrandColors.lightGray,
  },
  headerTitle: {
    fontSize: 24,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: BrandColors.navy,
  },
  headerSubtitle: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: BrandColors.grey,
    marginTop: 2,
  },
  listContainer: {
    padding: Spacing.three,
    paddingBottom: 100, // Extra padding so FAB does not block the last item
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: BrandColors.lightGray,
    padding: Spacing.three,
    marginBottom: Spacing.three,
    elevation: 2,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.two,
  },
  cardTitle: {
    fontSize: 16,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: BrandColors.navy,
  },
  badgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.one,
  },
  disasterBadge: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: BorderRadius.sm,
    marginRight: Spacing.one,
  },
  disasterText: {
    fontSize: 10,
    fontFamily: 'PlusJakartaSans_700Bold',
  },
  agencyBadge: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: BorderRadius.sm,
    backgroundColor: '#F5F5F5',
  },
  agencyText: {
    fontSize: 10,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: BrandColors.grey,
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: BorderRadius.full,
  },
  statusPublished: {
    backgroundColor: '#E8F5E9',
  },
  statusDraft: {
    backgroundColor: '#FFF3E0',
  },
  statusText: {
    fontSize: 9,
    fontFamily: 'PlusJakartaSans_700Bold',
  },
  statusTextPublished: {
    color: BrandColors.green,
  },
  statusTextDraft: {
    color: '#E65100',
  },
  cardDesc: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: BrandColors.grey,
    lineHeight: 18,
    marginBottom: Spacing.two,
  },
  cardDivider: {
    height: 1,
    backgroundColor: BrandColors.lightGray,
    marginVertical: Spacing.two,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footerLabel: {
    fontSize: 11,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: BrandColors.grey,
    marginBottom: 2,
  },
  footerValue: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: BrandColors.navy,
  },
  alignRight: {
    alignItems: 'flex-end',
  },
  emptyContainer: {
    padding: Spacing.six,
    alignItems: 'center',
    marginTop: Spacing.six,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: Spacing.three,
  },
  emptyTitle: {
    fontSize: 16,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: BrandColors.navy,
    marginBottom: Spacing.one,
  },
  emptySubtitle: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: BrandColors.grey,
    textAlign: 'center',
    lineHeight: 18,
  },
  fab: {
    position: 'absolute',
    bottom: 96, // Place above the tab bar styles
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BrandColors.green,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    borderRadius: BorderRadius.full,
    elevation: 4,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
  },
  fabIcon: {
    fontSize: 20,
    color: '#FFFFFF',
    fontWeight: 'bold',
    marginRight: 6,
  },
  fabText: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#FFFFFF',
  },
});
