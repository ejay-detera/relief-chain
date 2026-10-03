import { MaterialCommunityIcons } from '@expo/vector-icons';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { RefundableSettlementList } from '@/components/Refund/RefundableSettlementList';
import { FadeInView } from '@/components/shared/FadeInView';
import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import type { SettlementsState } from '@/hooks/use-merchant-settlements';
import type { RefundableSettlement } from '@/types/refund';

type Props = {
  bottomInset: number;
  onRefresh: () => void;
  onRequestRefund: (settlement: RefundableSettlement) => void;
  onRetry: () => void;
  refreshing: boolean;
  state: SettlementsState;
};

export const HistorySettlementsTab = ({
  bottomInset,
  onRefresh,
  onRequestRefund,
  onRetry,
  refreshing,
  state,
}: Props) => {
  return (
    <ScrollView
      contentContainerStyle={[styles.content, { paddingBottom: bottomInset }]}
      refreshControl={<RefreshControl onRefresh={onRefresh} refreshing={refreshing} />}
      showsVerticalScrollIndicator={false}
    >
      <FadeInView delay={0}>
        <View style={styles.banner}>
          <MaterialCommunityIcons color={BrandColors.navy} name="information-outline" size={20} />
          <View style={styles.bannerTextContainer}>
            <ThemedText style={styles.bannerTitle}>Refundable Settlements</ThemedText>
            <ThemedText style={styles.bannerSubtitle}>
              Confirmed voucher transactions that remain eligible for full or partial merchant-initiated refund.
            </ThemedText>
          </View>
        </View>
      </FadeInView>

      <FadeInView delay={40}>
        <View style={styles.card}>
          <RefundableSettlementList onRefund={onRequestRefund} onRetry={onRetry} state={state} />
        </View>
      </FadeInView>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  content: {
    gap: Spacing.three,
    padding: Spacing.three,
  },
  banner: {
    alignItems: 'flex-start',
    backgroundColor: 'rgba(17,46,88,0.04)',
    borderColor: 'rgba(17,46,88,0.1)',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: Spacing.two,
    padding: Spacing.three,
  },
  bannerTextContainer: {
    flex: 1,
    gap: 2,
  },
  bannerTitle: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13,
  },
  bannerSubtitle: {
    color: BrandColors.grey,
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 11,
    lineHeight: 16,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(151,151,151,0.2)',
    borderRadius: BorderRadius.lg,
    borderWidth: 0.5,
    padding: Spacing.three,
  },
});
