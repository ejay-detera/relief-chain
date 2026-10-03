import { useEffect, useRef } from 'react';
import { type LayoutRectangle, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';

export type HistoryTabKey = 'settlements' | 'refunds' | 'payments';

type Props = {
  activeTab: HistoryTabKey;
  onSelectTab: (tab: HistoryTabKey) => void;
  settlementsCount?: number;
  refundsCount?: number;
  paymentsCount?: number;
};

const TABS: { id: HistoryTabKey; label: string; fullLabel: string }[] = [
  { id: 'settlements', label: 'Refund Settlements', fullLabel: 'Refund Settlements' },
  { id: 'refunds', label: 'Refund History', fullLabel: 'Refund History' },
  { id: 'payments', label: 'Recent Payments', fullLabel: 'Recent Payments' },
];

export const HistoryTabBar = ({
  activeTab,
  onSelectTab,
  settlementsCount,
  refundsCount,
  paymentsCount,
}: Props) => {
  const scrollRef = useRef<ScrollView>(null);
  const tabLayouts = useRef<Partial<Record<HistoryTabKey, LayoutRectangle>>>({});

  const getCount = (tab: HistoryTabKey): number | undefined => {
    switch (tab) {
      case 'settlements':
        return settlementsCount;
      case 'refunds':
        return refundsCount;
      case 'payments':
        return paymentsCount;
      default:
        return undefined;
    }
  };

  useEffect(() => {
    const layout = tabLayouts.current[activeTab];
    if (layout && scrollRef.current) {
      scrollRef.current.scrollTo({
        x: Math.max(0, layout.x - Spacing.three),
        animated: true,
      });
    }
  }, [activeTab]);

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        horizontal
        ref={scrollRef}
        showsHorizontalScrollIndicator={false}
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          const count = getCount(tab.id);

          return (
            <Pressable
              accessibilityLabel={tab.fullLabel}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              hitSlop={6}
              key={tab.id}
              onLayout={(event) => {
                tabLayouts.current[tab.id] = event.nativeEvent.layout;
                if (isActive && scrollRef.current) {
                  scrollRef.current.scrollTo({
                    x: Math.max(0, event.nativeEvent.layout.x - Spacing.three),
                    animated: false,
                  });
                }
              }}
              onPress={() => onSelectTab(tab.id)}
              style={[styles.pill, isActive ? styles.pillActive : styles.pillInactive]}
            >
              <ThemedText
                numberOfLines={1}
                style={[styles.tabLabel, isActive ? styles.tabLabelActive : styles.tabLabelInactive]}
              >
                {tab.label}
              </ThemedText>
              {typeof count === 'number' && (
                <View style={[styles.badge, isActive ? styles.badgeActive : styles.badgeInactive]}>
                  <ThemedText style={[styles.badgeText, isActive ? styles.badgeTextActive : styles.badgeTextInactive]}>
                    {count}
                  </ThemedText>
                </View>
              )}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderBottomColor: '#EEEDED',
    borderBottomWidth: 1,
    paddingVertical: Spacing.two,
  },
  scrollContent: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  pill: {
    alignItems: 'center',
    borderRadius: BorderRadius.full,
    flexDirection: 'row',
    gap: 6,
    minHeight: 38,
    paddingHorizontal: Spacing.three,
    paddingVertical: 7,
  },
  pillInactive: {
    backgroundColor: '#F3F4F6',
    borderColor: 'rgba(151,151,151,0.2)',
    borderWidth: 1,
  },
  pillActive: {
    backgroundColor: BrandColors.navy,
    borderColor: BrandColors.navy,
    borderWidth: 1,
    elevation: 2,
    shadowColor: BrandColors.navy,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  tabLabel: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 12,
  },
  tabLabelInactive: {
    color: '#4A5568',
  },
  tabLabelActive: {
    color: '#FFFFFF',
    fontFamily: 'PlusJakartaSans_700Bold',
  },
  badge: {
    alignItems: 'center',
    borderRadius: BorderRadius.full,
    height: 18,
    justifyContent: 'center',
    minWidth: 18,
    paddingHorizontal: 5,
  },
  badgeInactive: {
    backgroundColor: '#E2E8F0',
  },
  badgeActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  badgeText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 10,
    textAlign: 'center',
  },
  badgeTextInactive: {
    color: '#4A5568',
  },
  badgeTextActive: {
    color: '#FFFFFF',
  },
});
