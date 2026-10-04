import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import type { AccreditedMerchant } from '@/types/merchant-management';

type Props = {
  merchant: AccreditedMerchant;
  onPress: () => void;
};

export const MerchantCard = ({ merchant, onPress }: Props) => {
  const getStatusBadge = () => {
    switch (merchant.status) {
      case 'active':
        return {
          bg: '#E8F5E9',
          text: BrandColors.green,
          label: 'Active',
        };
      case 'suspended':
        return {
          bg: '#FFF3E0',
          text: '#E65100',
          label: 'Suspended',
        };
      case 'rejected':
      case 'revoked':
        return {
          bg: '#FFEBEE',
          text: '#D32F2F',
          label: 'Rejected',
        };
      default:
        return {
          bg: '#FFF8E1',
          text: '#F57F17',
          label: 'Pending',
        };
    }
  };

  const badge = getStatusBadge();

  const truncatePubkey = (key: string | null) => {
    if (!key) return 'No Stellar key';
    if (key.length <= 12) return key;
    return `${key.slice(0, 6)}...${key.slice(-4)}`;
  };

  const formatValidDate = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <View style={styles.header}>
        <View style={styles.titleContainer}>
          <ThemedText numberOfLines={1} style={styles.displayName}>
            {merchant.display_name}
          </ThemedText>
          <View style={styles.categoryPill}>
            <ThemedText style={styles.categoryText}>
              {merchant.category}
            </ThemedText>
          </View>
        </View>

        <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
          <ThemedText style={[styles.statusText, { color: badge.text }]}>
            {badge.label}
          </ThemedText>
        </View>
      </View>

      <View style={styles.details}>
        {merchant.owner_name && (
          <View style={styles.detailRow}>
            <ThemedText numberOfLines={1} style={styles.detailText}>
              <ThemedText style={styles.detailLabel}>Owner: </ThemedText>
              {merchant.owner_name}
              {merchant.mobile_number ? ` • ${merchant.mobile_number}` : ''}
            </ThemedText>
          </View>
        )}

        <View style={styles.detailRow}>
          <ThemedText style={styles.detailText}>
            <ThemedText style={styles.detailLabel}>Wallet: </ThemedText>
            {truncatePubkey(merchant.stellar_pubkey)}
          </ThemedText>
        </View>

        <View style={styles.detailRow}>
          <ThemedText style={styles.detailText}>
            <ThemedText style={styles.detailLabel}>Valid until: </ThemedText>
            {formatValidDate(merchant.valid_until)}
          </ThemedText>
        </View>

        {merchant.remarks && (
          <View style={styles.remarksBox}>
            <ThemedText style={styles.remarksLabel}>Note: </ThemedText>
            <ThemedText numberOfLines={2} style={styles.remarksText}>
              {merchant.remarks}
            </ThemedText>
          </View>
        )}
      </View>

      <View style={styles.footer}>
        <ThemedText style={styles.reviewPrompt}>Review Account</ThemedText>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'white',
    borderRadius: BorderRadius.lg,
    padding: Spacing.four,
    marginBottom: Spacing.three,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#EFEFEF',
  },
  cardPressed: {
    opacity: 0.9,
    backgroundColor: '#FAFBFD',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.three,
  },
  titleContainer: {
    flex: 1,
    marginRight: Spacing.two,
  },
  displayName: {
    fontSize: 16,
    fontWeight: '700',
    color: BrandColors.navy,
    marginBottom: 4,
  },
  categoryPill: {
    alignSelf: 'flex-start',
    backgroundColor: '#F0F4F8',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  categoryText: {
    fontSize: 11,
    color: BrandColors.navy,
    fontWeight: '600',
  },
  statusBadge: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  details: {
    gap: 6,
    paddingBottom: Spacing.two,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: BrandColors.grey,
  },
  detailText: {
    fontSize: 12,
    color: BrandColors.navy,
  },
  remarksBox: {
    flexDirection: 'row',
    backgroundColor: '#FFF8E7',
    padding: 6,
    borderRadius: 6,
    marginTop: 4,
  },
  remarksLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#8A5800',
  },
  remarksText: {
    fontSize: 11,
    color: '#8A5800',
    flex: 1,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Spacing.two,
  },
  reviewPrompt: {
    fontSize: 12,
    fontWeight: '600',
    color: BrandColors.navy,
  },
});
