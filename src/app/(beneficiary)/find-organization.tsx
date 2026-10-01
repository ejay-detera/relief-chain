import { FontAwesome } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LogoHeader } from '@/components/LogoHeader/LogoHeader';
import { FadeInView } from '@/components/shared/FadeInView';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BorderRadius, BottomTabInset, BrandColors, MaxContentWidth, Spacing } from '@/constants/theme';

import { OrganizationProgramList } from '@/components/beneficiary/FindOrganization/organization-program-list';
import { VerificationRequiredBanner } from '@/components/beneficiary/FindOrganization/verification-required-banner';

import { useAuth } from '@/context/AuthContext';
import { useOrganizationPrograms } from '@/hooks/use-organization-programs';
import { OrganizationProgram } from '@/types/organization';
import { filterPrograms, ProgramFilterScope } from '@/utils/program-applicability';

const CATEGORIES = ['All', 'Cash', 'Food', 'Medicine', 'School Supplies'] as const;

export default function FindOrganizationScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const { organizations, isLoading, error, retry } = useOrganizationPrograms();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [filterScope, setFilterScope] = useState<ProgramFilterScope>('canApply');

  const isVerified = profile?.verification_status === 'Verified';
  const hasBarangay = Boolean(profile?.barangay_id);

  const handleApply = (program: OrganizationProgram) => {
    router.push({
      pathname: '/(beneficiary)/apply-program',
      params: {
        programId: program.id,
        programName: program.programName,
        voucherType: program.voucherType ?? '',
      },
    });
  };

  const canApplyCount = useMemo(
    () => organizations.filter((p) => p.canApply).length,
    [organizations]
  );

  const inMyAreaCount = useMemo(
    () => organizations.filter((p) => p.isApplicable).length,
    [organizations]
  );

  const totalCount = organizations.length;

  const filteredPrograms = useMemo(() => {
    return filterPrograms(organizations, {
      scope: filterScope,
      selectedCategory,
      searchQuery,
    });
  }, [organizations, filterScope, selectedCategory, searchQuery]);

  const isSearchOrCategoryActive = searchQuery.trim().length > 0 || selectedCategory !== 'All';

  const emptyTitle = isSearchOrCategoryActive
    ? 'No Matching Programs'
    : filterScope === 'canApply'
      ? 'No Programs Open to Apply'
      : filterScope === 'inMyArea'
        ? 'No Programs in Your Area'
        : 'No Programs Available';

  const emptyDescription = isSearchOrCategoryActive
    ? 'No relief programs match your current search or category filter. Try clearing filters to see all available aid.'
    : filterScope === 'canApply'
      ? inMyAreaCount > 0
        ? 'There are relief programs in your area, but none are currently accepting new applications (some may be upcoming or already applied for). Check the "In My Area" tab.'
        : 'There are currently no relief programs accepting applications for your barangay or area. Check back later.'
      : filterScope === 'inMyArea'
        ? 'There are currently no relief programs designated for your barangay or area. Check back later or review your profile location.'
        : 'No relief organizations are currently offering assistance programs. Check back later.';

  const emptyActionLabel = isSearchOrCategoryActive
    ? 'Clear Filters'
    : filterScope === 'canApply' && inMyAreaCount > 0
      ? 'View In My Area'
      : filterScope !== 'all' && totalCount > 0
        ? 'Show All Programs'
        : 'Refresh';

  const handleEmptyAction = () => {
    if (isSearchOrCategoryActive) {
      setSearchQuery('');
      setSelectedCategory('All');
    } else if (filterScope === 'canApply' && inMyAreaCount > 0) {
      setFilterScope('inMyArea');
    } else if (filterScope !== 'all' && totalCount > 0) {
      setFilterScope('all');
    } else {
      void retry();
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <LogoHeader />

          <FadeInView delay={0}>
            <View style={styles.header}>
              <ThemedText style={styles.title}>Find Organization Programs</ThemedText>
              <ThemedText style={styles.subtitle}>
                Discover and apply for relief programs available for your area.
              </ThemedText>
            </View>
          </FadeInView>

          {!isVerified && (
            <FadeInView delay={40}>
              <VerificationRequiredBanner />
            </FadeInView>
          )}

          {!hasBarangay && (
            <FadeInView delay={50}>
              <View style={styles.locationBanner}>
                <FontAwesome color="#2980B9" name="map-marker" size={16} style={styles.locationBannerIcon} />
                <View style={styles.locationBannerContent}>
                  <ThemedText style={styles.locationBannerTitle}>Barangay not set</ThemedText>
                  <ThemedText style={styles.locationBannerText}>
                    Add your barangay in your profile so we can show relief programs specific to your neighborhood.
                  </ThemedText>
                </View>
                <TouchableOpacity
                  onPress={() => router.push('/(beneficiary)/profile' as any)}
                  style={styles.locationBannerButton}
                >
                  <ThemedText style={styles.locationBannerButtonText}>Set</ThemedText>
                </TouchableOpacity>
              </View>
            </FadeInView>
          )}

          <FadeInView delay={60}>
            <View style={styles.filterSection}>
              {/* Search input */}
              <View style={styles.searchBar}>
                <FontAwesome color={BrandColors.grey} name="search" size={14} style={styles.searchIcon} />
                <TextInput
                  onChangeText={setSearchQuery}
                  placeholder="Search programs or organizations..."
                  placeholderTextColor={BrandColors.grey}
                  style={styles.searchInput}
                  value={searchQuery}
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearButton}>
                    <FontAwesome color={BrandColors.grey} name="times-circle" size={16} />
                  </TouchableOpacity>
                )}
              </View>

              {/* Scope filter selector: Open to Apply | In My Area | All Programs */}
              <ScrollView
                contentContainerStyle={styles.scopeTabsScroll}
                horizontal
                showsHorizontalScrollIndicator={false}
              >
                <TouchableOpacity
                  accessibilityRole="button"
                  onPress={() => setFilterScope('canApply')}
                  style={[styles.scopeTab, filterScope === 'canApply' && styles.scopeTabActive]}
                >
                  <FontAwesome
                    color={filterScope === 'canApply' ? 'white' : BrandColors.green}
                    name="check-circle"
                    size={13}
                    style={styles.scopeTabIcon}
                  />
                  <ThemedText
                    style={[styles.scopeTabText, filterScope === 'canApply' && styles.scopeTabTextActive]}
                  >
                    Open to Apply ({canApplyCount})
                  </ThemedText>
                </TouchableOpacity>

                <TouchableOpacity
                  accessibilityRole="button"
                  onPress={() => setFilterScope('inMyArea')}
                  style={[styles.scopeTab, filterScope === 'inMyArea' && styles.scopeTabActive]}
                >
                  <FontAwesome
                    color={filterScope === 'inMyArea' ? 'white' : BrandColors.navy}
                    name="map-marker"
                    size={13}
                    style={styles.scopeTabIcon}
                  />
                  <ThemedText
                    style={[styles.scopeTabText, filterScope === 'inMyArea' && styles.scopeTabTextActive]}
                  >
                    In My Area ({inMyAreaCount})
                  </ThemedText>
                </TouchableOpacity>

                <TouchableOpacity
                  accessibilityRole="button"
                  onPress={() => setFilterScope('all')}
                  style={[styles.scopeTab, filterScope === 'all' && styles.scopeTabActive]}
                >
                  <ThemedText
                    style={[styles.scopeTabText, filterScope === 'all' && styles.scopeTabTextActive]}
                  >
                    All Programs ({totalCount})
                  </ThemedText>
                </TouchableOpacity>
              </ScrollView>

              {/* Category chips */}
              <ScrollView
                contentContainerStyle={styles.categoryScroll}
                horizontal
                showsHorizontalScrollIndicator={false}
              >
                {CATEGORIES.map((cat) => {
                  const isSelected = selectedCategory === cat;
                  return (
                    <TouchableOpacity
                      key={cat}
                      onPress={() => setSelectedCategory(cat)}
                      style={[styles.categoryChip, isSelected && styles.categoryChipActive]}
                    >
                      <ThemedText
                        style={[styles.categoryChipText, isSelected && styles.categoryChipTextActive]}
                      >
                        {cat}
                      </ThemedText>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          </FadeInView>

          <OrganizationProgramList
            applyDisabled={!isVerified}
            emptyActionLabel={emptyActionLabel}
            emptyDescription={emptyDescription}
            emptyTitle={emptyTitle}
            error={error}
            isLoading={isLoading}
            onApply={handleApply}
            onEmptyAction={handleEmptyAction}
            onRetry={retry}
            organizations={filteredPrograms}
          />
        </ScrollView>
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
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    width: '100%',
  },
  header: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.two,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: BrandColors.navy,
    marginBottom: Spacing.one,
  },
  subtitle: {
    fontSize: 13,
    color: BrandColors.grey,
    lineHeight: 18,
  },
  locationBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EBF4FE',
    borderRadius: BorderRadius.md,
    marginHorizontal: Spacing.four,
    marginBottom: Spacing.three,
    padding: Spacing.three,
    borderWidth: 1,
    borderColor: '#D4E6FB',
  },
  locationBannerIcon: {
    marginRight: Spacing.two,
  },
  locationBannerContent: {
    flex: 1,
    marginRight: Spacing.two,
  },
  locationBannerTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1B4F72',
    marginBottom: 2,
  },
  locationBannerText: {
    fontSize: 11,
    color: '#2C3E50',
    lineHeight: 15,
  },
  locationBannerButton: {
    backgroundColor: '#2980B9',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: BorderRadius.sm,
  },
  locationBannerButtonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '700',
  },
  filterSection: {
    paddingHorizontal: Spacing.four,
    marginBottom: Spacing.three,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.three,
    height: 42,
    borderWidth: 1,
    borderColor: BrandColors.lightGray,
    marginBottom: Spacing.two,
  },
  searchIcon: {
    marginRight: Spacing.two,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: BrandColors.navy,
    paddingVertical: 0,
  },
  clearButton: {
    padding: Spacing.one,
  },
  scopeTabsScroll: {
    flexDirection: 'row',
    gap: Spacing.one,
    paddingVertical: 2,
    marginBottom: Spacing.two,
  },
  scopeTab: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.three,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: BrandColors.lightGray,
    marginRight: Spacing.one,
  },
  scopeTabActive: {
    backgroundColor: BrandColors.navy,
    borderColor: BrandColors.navy,
  },
  scopeTabIcon: {
    marginRight: 5,
  },
  scopeTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: BrandColors.navy,
  },
  scopeTabTextActive: {
    color: 'white',
  },
  categoryScroll: {
    flexDirection: 'row',
    gap: Spacing.one,
    paddingVertical: 2,
  },
  categoryChip: {
    backgroundColor: 'white',
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.three,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: BrandColors.lightGray,
    marginRight: Spacing.one,
  },
  categoryChipActive: {
    backgroundColor: BrandColors.green,
    borderColor: BrandColors.green,
  },
  categoryChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: BrandColors.grey,
  },
  categoryChipTextActive: {
    color: 'white',
  },
  scrollContent: {
    paddingBottom: BottomTabInset + Spacing.six,
  },
});
