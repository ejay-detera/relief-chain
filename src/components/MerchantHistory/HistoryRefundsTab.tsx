import { MaterialCommunityIcons } from '@expo/vector-icons';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { RefundList } from '@/components/Refund/RefundList';
import { FadeInView } from '@/components/shared/FadeInView';
import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import type { MerchantRefundsHook } from '@/hooks/use-merchant-refunds';

type Props = {
  bottomInset: number;
  onRefresh: () => void;
  onRetry: () => void;
  refreshing: boolean;
  state: MerchantRefundsHook['state'];
};

export const HistoryRefundsTab = ({
  bottomInset,
  onRefresh,
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
          <MaterialCommunityIcons color={BrandColors.navy} name="shield-check-outline" size={20} />
          <View style={styles.bannerTextContainer}>
            <ThemedText style={styles.bannerTitle}>Refund Records</ThemedText>
            <ThemedText style={styles.bannerSubtitle}>
              Audited history of processed and in-flight refunds referencing the immutable original settlement.
            </ThemedText>
          </View>
        </View>
      </FadeInView>

      <FadeInView delay={40}>
        <View style={styles.card}>
          <RefundList onRetry={onRetry} state={state} />
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
