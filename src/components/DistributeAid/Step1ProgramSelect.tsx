import { FontAwesome } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import { fetchActiveProgramsWithLocations } from '@/services/programService';

export type DatabaseProgram = {
  id: string;
  name: string;
  total_budget: number;
  amount_per_beneficiary: number;
  purpose: string;
  expires_at: string;
  status: string;
  created_at: string;
  registration_open?: string | null;
  registration_close?: string | null;
  disaster_event?: string | null;
  program_areas?: { area_id: number; areas?: { name: string } | null }[];
  program_barangays?: { barangay_id: number; barangays?: { name: string; area_id: number } | null }[];
};

type Props = {
  selectedProgram: DatabaseProgram | null;
  onSelect: (program: DatabaseProgram) => void;
  onNext: () => void;
};

export const Step1ProgramSelect = ({ selectedProgram, onSelect, onNext }: Props) => {
  const [programs, setPrograms] = useState<DatabaseProgram[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Active' | 'Funding' | 'Draft'>('All');

  useEffect(() => {
    const fetchPrograms = async () => {
      try {
        const data = await fetchActiveProgramsWithLocations();
        setPrograms(data || []);
      } catch (err) {
        console.error('Error fetching programs:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchPrograms();
  }, []);

  const filteredPrograms = programs.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.purpose || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus =
      statusFilter === 'All' || p.status?.toLowerCase() === statusFilter.toLowerCase();
    return matchesSearch && matchesStatus;
  });

  const renderItem = ({ item }: { item: DatabaseProgram }) => {
    const isSelected = selectedProgram?.id === item.id;
    return (
      <Pressable
        onPress={() => onSelect(item)}
        style={[styles.card, isSelected && styles.cardSelected]}
      >
        <View style={styles.cardHeader}>
          <ThemedText style={[styles.cardName, isSelected && styles.textSelected]}>
            {item.name}
          </ThemedText>
          {isSelected && (
            <FontAwesome name="check-circle" size={20} color={BrandColors.green} />
          )}
        </View>

        <ThemedText style={[styles.purpose, isSelected && styles.textSelectedSub]}>
          Purpose: {item.purpose || 'Emergency assistance'}
        </ThemedText>

        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <ThemedText style={styles.statLabel}>Amount/Beneficiary</ThemedText>
            <ThemedText style={styles.statValue}>₱{Number(item.amount_per_beneficiary).toLocaleString()}</ThemedText>
          </View>
          <View style={styles.stat}>
            <ThemedText style={styles.statLabel}>Total Budget</ThemedText>
            <ThemedText style={styles.statValue}>₱{Number(item.total_budget).toLocaleString()}</ThemedText>
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      {/* Filter tabs */}
      <View style={styles.filterContainer}>
        {['All', 'Active', 'Funding', 'Draft'].map((filter) => (
          <Pressable
            key={filter}
            style={[
              styles.filterButton,
              statusFilter === filter && styles.filterButtonActive,
            ]}
            onPress={() => setStatusFilter(filter as any)}
          >
            <ThemedText
              style={[
                styles.filterButtonText,
                statusFilter === filter && styles.filterButtonTextActive,
              ]}
            >
              {filter}
            </ThemedText>
          </Pressable>
        ))}
      </View>
      <View style={styles.searchContainer}>
        <FontAwesome name="search" size={16} color={BrandColors.grey} style={styles.searchIcon} />
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search aid programs..."
          placeholderTextColor={BrandColors.grey}
          style={styles.searchInput}
        />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={BrandColors.navy} />
        </View>
      ) : (
        <FlatList
          data={filteredPrograms}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.center}>
              <FontAwesome name="folder-open-o" size={48} color={BrandColors.lightGray} style={styles.emptyIcon} />
              <ThemedText style={styles.emptyText}>No active programs found</ThemedText>
            </View>
          }
        />
      )}

      <View style={styles.footer}>
        <Pressable
          disabled={!selectedProgram}
          onPress={onNext}
          style={[styles.nextButton, !selectedProgram && styles.nextButtonDisabled]}
        >
          <ThemedText style={styles.nextButtonText}>Continue to Summary</ThemedText>
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFC',
  },
  filterContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderColor: '#E5E7EB',
  },
  filterButton: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
  },
  filterButtonActive: {
    backgroundColor: BrandColors.navy,
  },
  filterButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: BrandColors.grey,
  },
  filterButtonTextActive: {
    color: 'white',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    margin: Spacing.four,
    paddingHorizontal: Spacing.three,
    borderRadius: 12,
    height: 48,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  searchIcon: {
    marginRight: Spacing.two,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_400Regular',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 80,
  },
  list: {
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
    paddingBottom: 100,
  },
  card: {
    backgroundColor: 'white',
    borderRadius: BorderRadius.lg,
    padding: Spacing.four,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  cardSelected: {
    borderColor: BrandColors.navy,
    backgroundColor: '#F3F7FF',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  cardName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: BrandColors.navy,
    flex: 1,
    marginRight: Spacing.two,
  },
  purpose: {
    fontSize: 13,
    color: BrandColors.grey,
    marginBottom: Spacing.three,
  },
  textSelected: {
    color: BrandColors.navy,
  },
  textSelectedSub: {
    color: '#3B82F6',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#FAFAFC',
    borderRadius: BorderRadius.md,
    padding: Spacing.three,
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
    fontSize: 14,
    fontWeight: 'bold',
    color: BrandColors.navy,
  },
  emptyIcon: {
    marginBottom: Spacing.three,
  },
  emptyText: {
    fontSize: 14,
    color: BrandColors.grey,
    fontWeight: '600',
  },
  footer: {
    padding: Spacing.four,
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  nextButton: {
    height: 50,
    backgroundColor: BrandColors.navy,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
  },
  nextButtonDisabled: {
    backgroundColor: BrandColors.lightGray,
  },
  nextButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
