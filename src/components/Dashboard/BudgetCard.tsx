import { FontAwesome } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import { useOrganizationTreasury, type TreasuryBalances } from '@/hooks/use-organization-treasury';

export type BudgetCardProps = {
  balances?: TreasuryBalances | null;
  isLoading?: boolean;
  onSyncPress?: () => void;
  isSyncing?: boolean;
};

type TooltipType = 'reserved' | 'available' | null;

export const BudgetCard = ({
  balances: propBalances,
  isLoading: propIsLoading,
  onSyncPress,
  isSyncing = false,
}: BudgetCardProps = {}) => {
  const treasuryHook = useOrganizationTreasury();
  const balances = propBalances !== undefined ? propBalances : treasuryHook.balances;
  const isLoading = propIsLoading !== undefined ? propIsLoading : treasuryHook.isLoading;
  const [activeTooltip, setActiveTooltip] = useState<TooltipType>(null);

  useEffect(() => {
    if (!activeTooltip) return;
    const timer = setTimeout(() => {
      setActiveTooltip(null);
    }, 6000);
    return () => clearTimeout(timer);
  }, [activeTooltip]);

  const toggleTooltip = (type: 'reserved' | 'available') => {
    setActiveTooltip((current) => (current === type ? null : type));
  };

  const formatRCPHP = (stroops: bigint) => {
    const value = Number(stroops) / 10000000;
    return `${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} RCPHP`;
  };

  const total = balances ? formatRCPHP(balances.totalStroops) : '0.00 RCPHP';
  const reserved = balances ? formatRCPHP(balances.reservedStroops) : '0.00 RCPHP';
  const available = balances ? formatRCPHP(balances.availableStroops) : '0.00 RCPHP';

  return (
    <LinearGradient
      colors={[BrandColors.green, BrandColors.budgetGradientEnd]}
      style={styles.container}>
      <View style={styles.topRow}>
        <ThemedText
          ellipsizeMode="tail"
          numberOfLines={1}
          style={styles.title}>
          Total Program Budget
        </ThemedText>
        {onSyncPress && (
          <Pressable
            accessibilityLabel="Reconcile Stellar ledger"
            accessibilityRole="button"
            disabled={isSyncing}
            onPress={onSyncPress}
            style={[styles.syncButton, isSyncing && styles.syncButtonDisabled]}
          >
            {isSyncing ? (
              <ActivityIndicator color="#FFFFFF" size={9} />
            ) : (
              <FontAwesome color="#FFFFFF" name="refresh" size={10} />
            )}
            <ThemedText style={styles.syncText}>{isSyncing ? 'Syncing…' : 'Reconcile'}</ThemedText>
          </Pressable>
        )}
      </View>

      <ThemedText
        ellipsizeMode="tail"
        numberOfLines={1}
        style={styles.amount}>
        {isLoading ? 'Loading...' : total}
      </ThemedText>

      {/* Pop-up Tooltip when a fund badge is pressed */}
      {activeTooltip && (
        <View style={styles.tooltipContainer}>
          <Pressable
            accessibilityLabel="Close tooltip"
            accessibilityRole="button"
            onPress={() => setActiveTooltip(null)}
            style={styles.tooltipBubble}
          >
            <View style={styles.tooltipHeader}>
              <View style={styles.tooltipTitleRow}>
                <FontAwesome
                  color="#FFFFFF"
                  name={activeTooltip === 'reserved' ? 'lock' : 'check-circle'}
                  size={11}
                  style={styles.tooltipIcon}
                />
                <ThemedText style={styles.tooltipTitle}>
                  {activeTooltip === 'reserved' ? 'Reserved Funds' : 'Available Funds'}
                </ThemedText>
              </View>
              <FontAwesome color="rgba(255, 255, 255, 0.6)" name="times" size={12} />
            </View>
            <ThemedText selectable style={styles.tooltipValue}>
              {activeTooltip === 'reserved' ? reserved : available}
            </ThemedText>
            <ThemedText style={styles.tooltipDescription}>
              {activeTooltip === 'reserved'
                ? 'Committed to active programs.'
                : 'Ready to allocate or disburse.'}
            </ThemedText>
          </Pressable>
          <View
            style={[
              styles.tooltipArrow,
              activeTooltip === 'reserved' ? styles.arrowLeft : styles.arrowRight,
            ]}
          />
        </View>
      )}

      <View style={styles.badgesContainer}>
        <Pressable
          accessibilityHint="Tap to view exact amount and details"
          accessibilityLabel={`Reserved: ${reserved}`}
          accessibilityRole="button"
          onPress={() => toggleTooltip('reserved')}
          style={({ pressed }) => [
            styles.badge,
            activeTooltip === 'reserved' && styles.badgeActive,
            pressed && styles.badgePressed,
          ]}
        >
          <View style={styles.badgeTitleRow}>
            <ThemedText
              ellipsizeMode="tail"
              numberOfLines={1}
              style={styles.badgeTitle}>
              Reserved
            </ThemedText>
            <FontAwesome
              color={activeTooltip === 'reserved' ? '#FFFFFF' : 'rgba(255, 255, 255, 0.6)'}
              name="info-circle"
              size={10}
            />
          </View>
          <ThemedText
            ellipsizeMode="tail"
            numberOfLines={1}
            style={styles.badgeValue}>
            {isLoading ? '-' : reserved}
          </ThemedText>
        </Pressable>

        <Pressable
          accessibilityHint="Tap to view exact amount and details"
          accessibilityLabel={`Available: ${available}`}
          accessibilityRole="button"
          onPress={() => toggleTooltip('available')}
          style={({ pressed }) => [
            styles.badge,
            activeTooltip === 'available' && styles.badgeActive,
            pressed && styles.badgePressed,
          ]}
        >
          <View style={styles.badgeTitleRow}>
            <ThemedText
              ellipsizeMode="tail"
              numberOfLines={1}
              style={styles.badgeTitle}>
              Available
            </ThemedText>
            <FontAwesome
              color={activeTooltip === 'available' ? '#FFFFFF' : 'rgba(255, 255, 255, 0.6)'}
              name="info-circle"
              size={10}
            />
          </View>
          <ThemedText
            ellipsizeMode="tail"
            numberOfLines={1}
            style={styles.badgeValue}>
            {isLoading ? '-' : available}
          </ThemedText>
        </Pressable>
      </View>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 20,
    padding: Spacing.four,
    marginHorizontal: Spacing.four,
    marginTop: Spacing.two,
    marginBottom: Spacing.four,
    position: 'relative',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.one,
  },
  title: {
    flex: 1,
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
    marginRight: Spacing.two,
  },
  syncButton: {
    flexShrink: 0,
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    borderRadius: BorderRadius.full,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: Spacing.two,
    paddingVertical: 4,
  },
  syncButtonDisabled: {
    opacity: 0.7,
  },
  syncText: {
    color: '#FFFFFF',
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 9,
  },
  amount: {
    color: 'white',
    fontSize: 28,
    fontWeight: '700',
    marginBottom: Spacing.three,
  },
  tooltipContainer: {
    position: 'absolute',
    bottom: 74,
    left: Spacing.four,
    right: Spacing.four,
    zIndex: 30,
    elevation: 10,
  },
  tooltipBubble: {
    backgroundColor: BrandColors.navy,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    padding: Spacing.three,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 8,
  },
  tooltipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  tooltipTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tooltipIcon: {
    opacity: 0.9,
  },
  tooltipTitle: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 11,
    fontFamily: 'PlusJakartaSans_600SemiBold',
  },
  tooltipValue: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'PlusJakartaSans_700Bold',
    lineHeight: 22,
    marginBottom: 3,
  },
  tooltipDescription: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 11,
    fontFamily: 'PlusJakartaSans_500Medium',
    lineHeight: 15,
  },
  tooltipArrow: {
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderTopWidth: 7,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: BrandColors.navy,
    position: 'absolute',
    bottom: -6,
  },
  arrowLeft: {
    left: '25%',
    marginLeft: -7,
  },
  arrowRight: {
    right: '25%',
    marginRight: -7,
  },
  badgesContainer: {
    flexDirection: 'row',
    gap: Spacing.two,
    width: '100%',
  },
  badge: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderColor: 'rgba(255, 255, 255, 0.25)',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
    justifyContent: 'center',
  },
  badgeActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.32)',
    borderColor: 'rgba(255, 255, 255, 0.7)',
  },
  badgePressed: {
    opacity: 0.8,
  },
  badgeTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  badgeTitle: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 11,
    fontWeight: '600',
  },
  badgeValue: {
    color: 'white',
    fontSize: 13,
    fontWeight: '700',
  },
});
