import { FontAwesome } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import { BeneficiaryDuplicateFlag, fetchDuplicateFlags, reviewDuplicateFlag } from '@/services/duplicate-flag-service';

const MATCH_TYPE_LABEL: Record<BeneficiaryDuplicateFlag['matchType'], string> = {
  gov_id: 'Matching Government ID',
  name_address: 'Matching Name + Address',
};

/**
 * BEN-01: "The system checks for likely duplicate registrations (matching ID
 * number or name + address) and flags them for staff review rather than
 * silently rejecting." Surfaces every pending flag so staff can confirm or
 * dismiss each one — detection itself never blocks a registration (see the
 * `profiles_detect_beneficiary_duplicates` trigger).
 */
export const DuplicateFlagsPanel = () => {
  const [flags, setFlags] = useState<BeneficiaryDuplicateFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [notesById, setNotesById] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState(false);

  const load = async () => {
    try {
      const data = await fetchDuplicateFlags('pending');
      setFlags(data);
    } catch (err) {
      console.error('Error fetching duplicate flags:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    Promise.resolve().then(() => {
      load();
    });
  }, []);

  const handleReview = async (flag: BeneficiaryDuplicateFlag, status: 'confirmed_duplicate' | 'not_duplicate') => {
    setUpdatingId(flag.id);
    try {
      await reviewDuplicateFlag(flag.id, status, notesById[flag.id]?.trim() || undefined);
      await load();
    } catch (err) {
      console.error('Error reviewing duplicate flag:', err);
      Alert.alert('Error', 'Failed to update this flag. Please try again.');
    } finally {
      setUpdatingId(null);
    }
  };

  if (loading) return null;
  if (flags.length === 0) return null;

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={() => setExpanded((v) => !v)} style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <FontAwesome name="exclamation-triangle" size={14} color="#B45309" />
          <Text style={styles.headerTitle}>Possible Duplicate Registrations</Text>
        </View>
        <View style={styles.countBadgeRow}>
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{flags.length}</Text>
          </View>
          <FontAwesome color={BrandColors.grey} name={expanded ? 'chevron-up' : 'chevron-down'} size={12} />
        </View>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.list}>
          {flags.map((flag) => {
            const isUpdating = updatingId === flag.id;
            return (
              <View key={flag.id} style={styles.flagCard}>
                <Text style={styles.matchTypeLabel}>{MATCH_TYPE_LABEL[flag.matchType]}</Text>
                <View style={styles.pairRow}>
                  <View style={styles.pairItem}>
                    <Text style={styles.pairName}>{flag.profile?.fullName ?? 'Unknown'}</Text>
                    <Text style={styles.pairDetail}>ID: {flag.profile?.govId ?? '—'}</Text>
                    <Text style={styles.pairDetail} numberOfLines={1}>{flag.profile?.completeAddress ?? '—'}</Text>
                  </View>
                  <FontAwesome color={BrandColors.grey} name="exchange" size={12} style={styles.exchangeIcon} />
                  <View style={styles.pairItem}>
                    <Text style={styles.pairName}>{flag.matchedProfile?.fullName ?? 'Unknown'}</Text>
                    <Text style={styles.pairDetail}>ID: {flag.matchedProfile?.govId ?? '—'}</Text>
                    <Text style={styles.pairDetail} numberOfLines={1}>{flag.matchedProfile?.completeAddress ?? '—'}</Text>
                  </View>
                </View>

                <TextInput
                  style={styles.notesInput}
                  placeholder="Remarks (optional)"
                  placeholderTextColor="#94A3B8"
                  value={notesById[flag.id] ?? ''}
                  onChangeText={(text) => setNotesById((prev) => ({ ...prev, [flag.id]: text }))}
                />

                <View style={styles.actionsRow}>
                  <TouchableOpacity
                    disabled={isUpdating}
                    onPress={() => handleReview(flag, 'not_duplicate')}
                    style={[styles.actionButton, styles.notDuplicateButton]}
                  >
                    <Text style={styles.notDuplicateButtonText}>Not a Duplicate</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    disabled={isUpdating}
                    onPress={() => handleReview(flag, 'confirmed_duplicate')}
                    style={[styles.actionButton, styles.confirmButton]}
                  >
                    {isUpdating ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <Text style={styles.confirmButtonText}>Confirm Duplicate</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFF8E1',
    borderRadius: BorderRadius.lg,
    marginHorizontal: Spacing.four,
    marginBottom: Spacing.three,
    borderWidth: 1,
    borderColor: '#FDE68A',
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.three,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 8,
  },
  headerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#92400E',
  },
  countBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 8,
  },
  countBadge: {
    backgroundColor: '#B45309',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  countBadgeText: {
    color: 'white',
    fontSize: 11,
    fontWeight: '700',
  },
  list: {
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.three,
    rowGap: Spacing.two,
  },
  flagCard: {
    backgroundColor: 'white',
    borderRadius: BorderRadius.md,
    padding: Spacing.three,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  matchTypeLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#B45309',
    marginBottom: Spacing.two,
    textTransform: 'uppercase',
  },
  pairRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pairItem: {
    flex: 1,
  },
  exchangeIcon: {
    marginHorizontal: Spacing.two,
  },
  pairName: {
    fontSize: 13,
    fontWeight: '600',
    color: BrandColors.navy,
  },
  pairDetail: {
    fontSize: 11,
    color: BrandColors.grey,
    marginTop: 2,
  },
  notesInput: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.two,
    paddingVertical: 6,
    fontSize: 12,
    color: '#334155',
    marginTop: Spacing.two,
  },
  actionsRow: {
    flexDirection: 'row',
    marginTop: Spacing.two,
    gap: Spacing.two,
  },
  actionButton: {
    flex: 1,
    height: 34,
    borderRadius: BorderRadius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  notDuplicateButton: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  notDuplicateButtonText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },
  confirmButton: {
    backgroundColor: '#D32F2F',
  },
  confirmButtonText: {
    fontSize: 11,
    fontWeight: '700',
    color: 'white',
  },
});
