import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';

import { ThemedText } from '@/components/themed-text';
import { BrandColors, Spacing, BorderRadius } from '@/constants/theme';
import type { UserProfile } from '@/types/auth';
import type { DatabaseProgram } from './Step1ProgramSelect';
import { fetchEligibleBeneficiaries } from '@/services/beneficiaryService';

type Props = {
  program: DatabaseProgram;
  selectedBeneficiaries: UserProfile[];
  onSelectChange: (selected: UserProfile[]) => void;
  onNext: () => void;
  onBack: () => void;
};

export const Step3BeneficiaryList = ({ program, selectedBeneficiaries, onSelectChange, onNext, onBack }: Props) => {
  const [beneficiaries, setBeneficiaries] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const hasRegistration = Boolean(program.registration_open && program.registration_close);

  const onSelectRef = React.useRef(onSelectChange);
  useEffect(() => {
    onSelectRef.current = onSelectChange;
  }, [onSelectChange]);
  const isInitialSync = React.useRef(true);

  useEffect(() => {
    const loadBeneficiaries = async () => {
      try {
        const eligible = await fetchEligibleBeneficiaries(program, hasRegistration);
        setBeneficiaries(eligible);
        if (isInitialSync.current) {
          onSelectRef.current(eligible);
          isInitialSync.current = false;
        }
      } catch (err) {
        console.error('Error fetching eligible beneficiaries:', err);
      } finally {
        setLoading(false);
      }
    };

    loadBeneficiaries();
  }, [program, hasRegistration]);

  const handleToggle = (beneficiary: UserProfile) => {
    const isSelected = selectedBeneficiaries.some((b) => b.id === beneficiary.id);
    if (isSelected) {
      onSelectChange(selectedBeneficiaries.filter((b) => b.id !== beneficiary.id));
    } else {
      onSelectChange([...selectedBeneficiaries, beneficiary]);
    }
  };

  const handleSelectAll = () => {
    if (selectedBeneficiaries.length === beneficiaries.length) {
      onSelectChange([]);
    } else {
      onSelectChange(beneficiaries);
    }
  };

  const filteredBeneficiaries = beneficiaries.filter((b) =>
    (b.full_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (b.gov_id || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (b.location || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderItem = ({ item }: { item: UserProfile }) => {
    const isChecked = selectedBeneficiaries.some((b) => b.id === item.id);
    return (
      <Pressable onPress={() => handleToggle(item)} style={[styles.card, isChecked && styles.cardSelected]}>
        <View style={styles.cardContent}>
          <View style={styles.profileRow}>
            <View style={styles.avatar}>
              <FontAwesome name="user" size={16} color="white" />
            </View>
            <View style={styles.details}>
              <ThemedText style={styles.name}>{item.full_name || 'Anonymous'}</ThemedText>
              <ThemedText style={styles.subtext}>Gov ID: {item.gov_id || '—'} | Stellar: {item.stellar_pubkey ? `${item.stellar_pubkey.substring(0, 8)}...` : 'No wallet connected'}</ThemedText>
            </View>
          </View>
          <View style={[styles.checkbox, isChecked && styles.checkboxChecked]}>
            {isChecked && <FontAwesome name="check" size={12} color="white" />}
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      {/* Search and Select All row */}
      <View style={styles.header}>
        <View style={styles.searchBar}>
          <FontAwesome name="search" size={14} color={BrandColors.grey} style={styles.searchIcon} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search eligible beneficiaries..."
            placeholderTextColor={BrandColors.grey}
            style={styles.searchInput}
          />
        </View>
        {!loading && beneficiaries.length > 0 && (
          <Pressable onPress={handleSelectAll} style={styles.selectAllBtn}>
            <ThemedText style={styles.selectAllText}>
              {selectedBeneficiaries.length === beneficiaries.length ? 'Clear All' : 'Select All'}
            </ThemedText>
          </Pressable>
        )}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={BrandColors.navy} />
        </View>
      ) : (
        <FlatList
          data={filteredBeneficiaries}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.center}>
              <FontAwesome name="users" size={48} color={BrandColors.lightGray} style={styles.emptyIcon} />
              <ThemedText style={styles.emptyText}>No eligible beneficiaries found</ThemedText>
              <ThemedText style={styles.emptySub}>
                {hasRegistration
                  ? 'Verify that registrations exist for this program'
                  : 'Ensure you have registered/verified beneficiaries'}
              </ThemedText>
            </View>
          }
        />
      )}

      {/* Selected stats & buttons */}
      <View style={styles.footer}>
        <View style={styles.summaryBar}>
          <ThemedText style={styles.summaryText}>
            Selected:{' '}
            <ThemedText style={styles.summaryHighlight}>
              {selectedBeneficiaries.length} of {beneficiaries.length}
            </ThemedText>
          </ThemedText>
          <ThemedText style={styles.summaryBudget}>
            Total Payout:{' '}
            <ThemedText style={styles.summaryHighlightBudget}>
              ₱{(selectedBeneficiaries.length * Number(program.amount_per_beneficiary)).toLocaleString()}
            </ThemedText>
          </ThemedText>
        </View>

        <View style={styles.btnRow}>
          <Pressable onPress={onBack} style={[styles.btn, styles.btnBack]}>
            <ThemedText style={styles.btnTextBack}>Back</ThemedText>
          </Pressable>
          <Pressable
            disabled={selectedBeneficiaries.length === 0}
            onPress={onNext}
            style={[styles.btn, styles.btnNext, selectedBeneficiaries.length === 0 && styles.btnDisabled]}
          >
            <ThemedText style={styles.btnTextNext}>Pre-validation</ThemedText>
          </Pressable>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFC',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.four,
    gap: Spacing.three,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderColor: '#E5E7EB',
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    paddingHorizontal: Spacing.three,
    height: 40,
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
  selectAllBtn: {
    paddingHorizontal: Spacing.two,
  },
  selectAllText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: BrandColors.navy,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 80,
    paddingHorizontal: Spacing.six,
  },
  list: {
    padding: Spacing.four,
    gap: Spacing.three,
    paddingBottom: 100,
  },
  card: {
    backgroundColor: 'white',
    borderRadius: BorderRadius.md,
    padding: Spacing.three,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  cardSelected: {
    borderColor: BrandColors.navy,
    backgroundColor: '#F8FAFC',
  },
  cardContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    flex: 1,
    marginRight: Spacing.two,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: BrandColors.navy,
    justifyContent: 'center',
    alignItems: 'center',
  },
  details: {
    flex: 1,
  },
  name: {
    fontSize: 14,
    fontWeight: 'bold',
    color: BrandColors.navy,
  },
  subtext: {
    fontSize: 11,
    color: BrandColors.grey,
    marginTop: 2,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: BrandColors.navy,
    borderColor: BrandColors.navy,
  },
  emptyIcon: {
    marginBottom: Spacing.three,
  },
  emptyText: {
    fontSize: 14,
    color: BrandColors.grey,
    fontWeight: '600',
    marginBottom: 4,
  },
  emptySub: {
    fontSize: 12,
    color: BrandColors.grey,
    textAlign: 'center',
  },
  footer: {
    padding: Spacing.four,
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderColor: '#E5E7EB',
  },
  summaryBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.four,
  },
  summaryText: {
    fontSize: 13,
    color: BrandColors.grey,
  },
  summaryHighlight: {
    fontWeight: 'bold',
    color: BrandColors.navy,
  },
  summaryBudget: {
    fontSize: 13,
    color: BrandColors.grey,
  },
  summaryHighlightBudget: {
    fontWeight: 'bold',
    color: BrandColors.green,
  },
  btnRow: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  btn: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnBack: {
    borderWidth: 1,
    borderColor: BrandColors.navy,
    backgroundColor: 'white',
  },
  btnNext: {
    backgroundColor: BrandColors.navy,
  },
  btnDisabled: {
    backgroundColor: BrandColors.lightGray,
  },
  btnTextBack: {
    color: BrandColors.navy,
    fontSize: 14,
    fontWeight: 'bold',
  },
  btnTextNext: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
});
