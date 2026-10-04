import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import type {
  AccreditedMerchant,
  MerchantAccreditationStatus,
} from '@/types/merchant-management';
import { MerchantDetailsTab } from './MerchantDetailsTab';
import { MerchantRedemptionHistoryTab } from './MerchantRedemptionHistoryTab';

type Props = {
  merchant: AccreditedMerchant | null;
  onClose: () => void;
  onUpdateStatus: (
    accreditationId: string,
    status: MerchantAccreditationStatus,
    remarks?: string,
    category?: string,
  ) => Promise<void>;
  onRemove: (accreditationId: string) => Promise<void>;
};

export const MerchantDetailModal = ({
  merchant,
  onClose,
  onUpdateStatus,
  onRemove,
}: Props) => {
  const [activeTab, setActiveTab] = useState<'details' | 'history'>('details');
  const [historyCount, setHistoryCount] = useState<number | null>(null);

  // Reset tab state when merchant changes
  React.useEffect(() => {
    let isMounted = true;
    if (merchant) {
      Promise.resolve().then(() => {
        if (isMounted) {
          setActiveTab('details');
          setHistoryCount(null);
        }
      });
    }
    return () => {
      isMounted = false;
    };
  }, [merchant]);

  if (!merchant) return null;

  return (
    <Modal
      visible={true}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          {/* Header */}
          <View style={styles.header}>
            <ThemedText style={styles.headerTitle}>Review Merchant Profile</ThemedText>
            <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={10}>
              <FontAwesome name="times" size={18} color={BrandColors.grey} />
            </Pressable>
          </View>

          {/* Top Profile Summary */}
          <View style={styles.summaryCard}>
            <View style={styles.summaryInfo}>
              <ThemedText style={styles.summaryName} numberOfLines={1}>
                {merchant.display_name}
              </ThemedText>
              <View style={styles.summaryBadges}>
                <View style={styles.categoryBadge}>
                  <ThemedText style={styles.categoryBadgeText}>
                    {merchant.category}
                  </ThemedText>
                </View>
                <View
                  style={[
                    styles.statusBadge,
                    merchant.status === 'active'
                      ? styles.badgeActive
                      : merchant.status === 'suspended'
                      ? styles.badgeSuspended
                      : styles.badgeRejected,
                  ]}
                >
                  <ThemedText
                    style={[
                      styles.statusBadgeText,
                      merchant.status === 'active'
                        ? styles.textActive
                        : merchant.status === 'suspended'
                        ? styles.textSuspended
                        : styles.textRejected,
                    ]}
                  >
                    {merchant.status.toUpperCase()}
                  </ThemedText>
                </View>
              </View>
            </View>
          </View>

          {/* Segmented Sub-Tab Switcher */}
          <View style={styles.segmentContainer}>
            <Pressable
              onPress={() => setActiveTab('details')}
              style={[
                styles.segmentBtn,
                activeTab === 'details' && styles.segmentBtnActive,
              ]}
            >
              <ThemedText
                style={[
                  styles.segmentText,
                  activeTab === 'details' && styles.segmentTextActive,
                ]}
              >
                Profile Details
              </ThemedText>
            </Pressable>
            <Pressable
              onPress={() => setActiveTab('history')}
              style={[
                styles.segmentBtn,
                activeTab === 'history' && styles.segmentBtnActive,
              ]}
            >
              <ThemedText
                style={[
                  styles.segmentText,
                  activeTab === 'history' && styles.segmentTextActive,
                ]}
              >
                Redemption History
                {historyCount !== null ? ` (${historyCount})` : ''}
              </ThemedText>
            </Pressable>
          </View>

          {/* Active Tab View */}
          <View style={styles.tabContent}>
            {activeTab === 'details' ? (
              <MerchantDetailsTab
                merchant={merchant}
                onUpdateStatus={onUpdateStatus}
                onRemove={onRemove}
                onClose={onClose}
              />
            ) : (
              <MerchantRedemptionHistoryTab
                merchantId={merchant.merchant_id}
                orgId={merchant.organization_id}
                onTotalCountChange={setHistoryCount}
              />
            )}
          </View>
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
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.four,
    height: '90%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: Spacing.two,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: BrandColors.navy,
  },
  closeBtn: {
    padding: 6,
  },
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F7F9FC',
    borderRadius: BorderRadius.lg,
    padding: Spacing.three,
    marginVertical: Spacing.two,
  },
  summaryInfo: {
    flex: 1,
  },
  summaryName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: BrandColors.navy,
    marginBottom: 4,
  },
  summaryBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  categoryBadge: {
    backgroundColor: '#E3E8F0',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
  },
  categoryBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: BrandColors.navy,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
  },
  badgeActive: {
    backgroundColor: '#E8F5E9',
  },
  badgeSuspended: {
    backgroundColor: '#FFF3E0',
  },
  badgeRejected: {
    backgroundColor: '#FFEBEE',
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  textActive: {
    color: '#2E7D32',
  },
  textSuspended: {
    color: '#E65100',
  },
  textRejected: {
    color: '#D32F2F',
  },
  segmentContainer: {
    flexDirection: 'row',
    backgroundColor: '#EEEDED',
    borderRadius: BorderRadius.md,
    padding: 3,
    marginBottom: Spacing.three,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentBtnActive: {
    backgroundColor: BrandColors.navy,
  },
  segmentText: {
    fontSize: 12,
    fontWeight: '600',
    color: BrandColors.grey,
  },
  segmentTextActive: {
    color: 'white',
    fontWeight: '700',
  },
  tabContent: {
    flex: 1,
  },
});
