import React from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';

import { ThemedText } from '@/components/themed-text';
import { BrandColors, Spacing, BorderRadius } from '@/constants/theme';
import type { UserProfile } from '@/types/auth';

type Props = {
  data: UserProfile[];
  loading: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onSelect: (beneficiary: UserProfile) => void;
};

export const BeneficiaryList = ({ data, loading, refreshing, onRefresh, onSelect }: Props) => {
  if (loading && data.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={BrandColors.navy} />
      </View>
    );
  }

  const getStatusStyle = (status: UserProfile['verification_status']) => {
    switch (status) {
      case 'Verified':
        return { bg: '#E8F5E9', text: BrandColors.green, icon: 'check-circle' };
      case 'Rejected':
        return { bg: '#FFEBEE', text: '#D32F2F', icon: 'times-circle' };
      default:
        return { bg: '#FFF8E1', text: BrandColors.yellow, icon: 'clock-o' };
    }
  };

  const renderItem = ({ item }: { item: UserProfile }) => {
    const status = item.verification_status || 'Pending';
    const statusStyle = getStatusStyle(status);

    return (
      <Pressable onPress={() => onSelect(item)} style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.profileInfo}>
            <View style={styles.avatar}>
              <FontAwesome name="user" size={18} color="white" />
            </View>
            <View>
              <ThemedText style={styles.name}>{item.full_name || 'Anonymous'}</ThemedText>
              <ThemedText style={styles.subtext}>Gov ID: {item.gov_id || 'Not set'}</ThemedText>
            </View>
          </View>
          <View style={[styles.badge, { backgroundColor: statusStyle.bg }]}>
            <FontAwesome name={statusStyle.icon as any} size={12} color={statusStyle.text} />
            <ThemedText style={[styles.badgeText, { color: statusStyle.text }]}>
              {status}
            </ThemedText>
          </View>
        </View>

        <View style={styles.cardBody}>
          <View style={styles.infoRow}>
            <FontAwesome name="map-marker" size={14} color={BrandColors.grey} style={styles.rowIcon} />
            <ThemedText numberOfLines={1} style={styles.infoText}>
              {item.location || 'No location set'}
            </ThemedText>
          </View>
          <View style={styles.infoRow}>
            <FontAwesome name="mobile" size={16} color={BrandColors.grey} style={styles.rowIcon} />
            <ThemedText style={styles.infoText}>
              {item.mobile_number || 'No phone number'}
            </ThemedText>
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <FlatList
      data={data}
      renderItem={renderItem}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.listContainer}
      refreshing={refreshing}
      onRefresh={onRefresh}
      ListEmptyComponent={
        <View style={styles.centerContainer}>
          <FontAwesome name="users" size={48} color={BrandColors.lightGray} style={styles.emptyIcon} />
          <ThemedText style={styles.emptyText}>No beneficiaries found</ThemedText>
        </View>
      }
    />
  );
};

const styles = StyleSheet.create({
  listContainer: {
    padding: Spacing.four,
    paddingBottom: 100, // Safe padding for bottom tabs
    gap: Spacing.three,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 80,
  },
  card: {
    backgroundColor: 'white',
    borderRadius: BorderRadius.lg,
    padding: Spacing.four,
    boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
    paddingBottom: Spacing.three,
    marginBottom: Spacing.three,
  },
  profileInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    flex: 1,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: BrandColors.navy,
    justifyContent: 'center',
    alignItems: 'center',
  },
  name: {
    fontSize: 15,
    fontWeight: 'bold',
    color: BrandColors.navy,
  },
  subtext: {
    fontSize: 12,
    color: BrandColors.grey,
    marginTop: 2,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  cardBody: {
    gap: 6,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowIcon: {
    width: 16,
    textAlign: 'center',
    marginRight: Spacing.two,
  },
  infoText: {
    fontSize: 13,
    color: BrandColors.grey,
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
