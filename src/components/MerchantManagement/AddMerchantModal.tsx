import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';

import { ThemedText } from '@/components/themed-text';
import { UserAvatar } from '@/components/shared/UserAvatar';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import { searchAvailableMerchants } from '@/services/organizationMerchantService';
import {
  ACCREDITATION_CATEGORIES,
  type AddMerchantPayload,
  type AvailableMerchant,
} from '@/types/merchant-management';

type Props = {
  visible: boolean;
  onClose: () => void;
  onAccredit: (payload: AddMerchantPayload) => Promise<void>;
};

export const AddMerchantModal = ({ visible, onClose, onAccredit }: Props) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [merchants, setMerchants] = useState<AvailableMerchant[]>([]);
  const [selectedMerchant, setSelectedMerchant] =
    useState<AvailableMerchant | null>(null);
  const [category, setCategory] = useState<string>('Grocery');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleClose = () => {
    setSearchTerm('');
    setSelectedMerchant(null);
    setMerchants([]);
    onClose();
  };

  useEffect(() => {
    if (!visible) return;

    let isMounted = true;
    const fetchList = async () => {
      setLoading(true);
      try {
        const results = await searchAvailableMerchants(searchTerm);
        if (isMounted) setMerchants(results);
      } catch (err) {
        console.error('Error fetching available merchants:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    void fetchList();
    return () => {
      isMounted = false;
    };
  }, [visible, searchTerm]);

  const handleAccredit = async () => {
    if (!selectedMerchant) {
      Alert.alert('Selection Required', 'Please select a merchant to accredit.');
      return;
    }

    try {
      setIsSubmitting(true);
      await onAccredit({
        merchantId: selectedMerchant.merchant_id,
        category,
      });
      handleClose();
    } catch {
      // Handled in parent
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={handleClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <View style={styles.header}>
            <ThemedText style={styles.headerTitle}>Accredit New Merchant</ThemedText>
            <Pressable onPress={handleClose} style={styles.closeBtn}>
              <FontAwesome name="times" size={18} color={BrandColors.grey} />
            </Pressable>
          </View>

          {/* Search Box */}
          <View style={styles.searchContainer}>
            <FontAwesome
              name="search"
              size={15}
              color={BrandColors.grey}
              style={styles.searchIcon}
            />
            <TextInput
              value={searchTerm}
              onChangeText={setSearchTerm}
              placeholder="Search by store or owner name..."
              placeholderTextColor={BrandColors.grey}
              style={styles.searchInput}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          {/* Selected Merchant Confirmation & Category Selection */}
          {selectedMerchant && (
            <View style={styles.selectedBox}>
              <View style={styles.selectedHeader}>
                <UserAvatar
                  role="merchant"
                  name={selectedMerchant.display_name}
                  id={selectedMerchant.merchant_id}
                  size={42}
                  style={styles.selectedAvatar}
                />
                <View style={styles.selectedInfo}>
                  <ThemedText style={styles.selectedLabel}>Selected Merchant:</ThemedText>
                  <ThemedText style={styles.selectedName}>
                    {selectedMerchant.display_name}
                  </ThemedText>
                  {selectedMerchant.owner_name && (
                    <ThemedText style={styles.selectedSubtext}>
                      Owner: {selectedMerchant.owner_name}
                    </ThemedText>
                  )}
                </View>
                <Pressable
                  onPress={() => setSelectedMerchant(null)}
                  style={styles.clearSelectedBtn}
                >
                  <ThemedText style={styles.clearSelectedText}>Change</ThemedText>
                </Pressable>
              </View>

              <ThemedText style={styles.categoryTitle}>
                Accreditation Category:
              </ThemedText>
              <View style={styles.categoryRow}>
                {ACCREDITATION_CATEGORIES.map((cat) => (
                  <Pressable
                    key={cat}
                    onPress={() => setCategory(cat)}
                    style={[
                      styles.categoryChip,
                      category === cat && styles.categoryChipActive,
                    ]}
                  >
                    <ThemedText
                      style={[
                        styles.categoryChipText,
                        category === cat && styles.categoryChipTextActive,
                      ]}
                    >
                      {cat}
                    </ThemedText>
                  </Pressable>
                ))}
              </View>

              <Pressable
                onPress={handleAccredit}
                disabled={isSubmitting}
                style={styles.accreditBtn}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <ThemedText style={styles.accreditBtnText}>
                    Confirm Accreditation
                  </ThemedText>
                )}
              </Pressable>
            </View>
          )}

          {/* List of Available Registered Merchants */}
          {!selectedMerchant && (
            <View style={styles.listWrapper}>
              {loading ? (
                <View style={styles.centerContainer}>
                  <ActivityIndicator size="large" color={BrandColors.navy} />
                </View>
              ) : (
                <FlatList
                  data={merchants}
                  keyExtractor={(item) => item.merchant_id}
                  contentContainerStyle={styles.listContent}
                  ListEmptyComponent={
                    <View style={styles.centerContainer}>
                      <ThemedText style={styles.emptyText}>
                        No unregistered merchants found.
                      </ThemedText>
                    </View>
                  }
                  renderItem={({ item }) => (
                    <Pressable
                      onPress={() => setSelectedMerchant(item)}
                      style={styles.merchantRow}
                    >
                      <UserAvatar
                        role="merchant"
                        name={item.display_name}
                        id={item.merchant_id}
                        size={36}
                        style={styles.rowAvatar}
                      />
                      <View style={styles.rowDetails}>
                        <ThemedText style={styles.rowName}>
                          {item.display_name}
                        </ThemedText>
                        <ThemedText style={styles.rowSub}>
                          {item.owner_name ? `Owner: ${item.owner_name}` : 'Registered Store'}
                        </ThemedText>
                      </View>
                      <View style={styles.selectPill}>
                        <ThemedText style={styles.selectText}>Select</ThemedText>
                      </View>
                    </Pressable>
                  )}
                />
              )}
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: 'white',
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    maxHeight: '85%',
    paddingBottom: Spacing.six,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EAEAEA',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: BrandColors.navy,
  },
  closeBtn: {
    padding: Spacing.two,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    margin: Spacing.four,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.three,
    height: 42,
  },
  searchIcon: {
    marginRight: Spacing.two,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: BrandColors.navy,
  },
  listWrapper: {
    maxHeight: 350,
  },
  listContent: {
    paddingHorizontal: Spacing.four,
  },
  centerContainer: {
    paddingVertical: Spacing.six,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 13,
    color: BrandColors.grey,
  },
  merchantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F0F0F0',
  },
  rowAvatar: {
    marginRight: Spacing.three,
  },
  selectedAvatar: {
    marginRight: Spacing.three,
  },
  rowDetails: {
    flex: 1,
  },
  rowName: {
    fontSize: 14,
    fontWeight: '700',
    color: BrandColors.navy,
  },
  rowSub: {
    fontSize: 12,
    color: BrandColors.grey,
    marginTop: 2,
  },
  selectPill: {
    backgroundColor: '#EEF2F6',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  selectText: {
    fontSize: 12,
    fontWeight: '700',
    color: BrandColors.navy,
  },
  selectedBox: {
    marginHorizontal: Spacing.four,
    backgroundColor: '#F8FAFC',
    borderRadius: BorderRadius.lg,
    padding: Spacing.four,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  selectedHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.three,
  },
  selectedInfo: {
    flex: 1,
  },
  selectedLabel: {
    fontSize: 11,
    color: BrandColors.grey,
    fontWeight: '600',
  },
  selectedName: {
    fontSize: 16,
    fontWeight: '700',
    color: BrandColors.navy,
    marginTop: 2,
  },
  selectedSubtext: {
    fontSize: 12,
    color: BrandColors.grey,
    marginTop: 2,
  },
  clearSelectedBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#E2E8F0',
    borderRadius: 6,
  },
  clearSelectedText: {
    fontSize: 11,
    fontWeight: '600',
    color: BrandColors.navy,
  },
  categoryTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: BrandColors.navy,
    marginBottom: 8,
  },
  categoryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: Spacing.four,
  },
  categoryChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#E2E8F0',
  },
  categoryChipActive: {
    backgroundColor: BrandColors.navy,
  },
  categoryChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  categoryChipTextActive: {
    color: 'white',
  },
  accreditBtn: {
    backgroundColor: BrandColors.green,
    paddingVertical: 12,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accreditBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: 'white',
  },
});
