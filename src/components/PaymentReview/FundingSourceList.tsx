import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PILOT_ASSET_CODE } from '@/constants/pilot-disclosure';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import type { FundingSource } from '@/types/invoice';
import { formatStroops } from '@/utils/format-stroops';
import { hasEligibleSource } from '@/utils/funding-sources';

type Props = {
  /** Ordered funding sources (eligible first). `null` while balances load. */
  sources: readonly FundingSource[] | null;
  isLoading: boolean;
  /** Set when reconciled balances could not be read. */
  unavailableReason: string | null;
  selectedId: string | null;
  onSelect: (source: FundingSource) => void;
  onRetry: () => void;
};

/**
 * Lists each eligible voucher entitlement and the unrestricted cash balance
 * separately (Requirement 11.1) and lets the beneficiary pick exactly ONE source
 * (Requirement 11.3). Ineligible or insufficient sources are shown disabled with
 * an explanation rather than hidden (Requirement 11.2). Split payment across
 * sources is deferred and is stated explicitly (Requirement 11.4).
 */
export const FundingSourceList = ({
  sources,
  isLoading,
  unavailableReason,
  selectedId,
  onSelect,
  onRetry,
}: Props) => {
  return (
    <View style={styles.container}>
      <ThemedText style={styles.heading}>Choose one funding source</ThemedText>
      <ThemedText style={styles.subheading}>
        Payments use a single source. Splitting a payment across cash and vouchers is not available.
      </ThemedText>

      {isLoading ? (
        <View style={styles.stateRow}>
          <ActivityIndicator color={BrandColors.navy} size="small" />
          <ThemedText style={styles.stateText}>Loading your reconciled balances…</ThemedText>
        </View>
      ) : unavailableReason ? (
        <View style={[styles.stateCard, styles.blocked]}>
          <ThemedText style={styles.blockedTitle}>Balances unavailable</ThemedText>
          <ThemedText style={styles.blockedBody}>{unavailableReason}</ThemedText>
          <Pressable accessibilityRole="button" onPress={onRetry} style={styles.retry}>
            <ThemedText style={styles.retryText}>Try again</ThemedText>
          </Pressable>
        </View>
      ) : !sources || sources.length === 0 ? (
        <View style={[styles.stateCard, styles.blocked]}>
          <ThemedText style={styles.blockedTitle}>No funding sources</ThemedText>
          <ThemedText style={styles.blockedBody}>
            You have no reconciled cash or voucher balance that can pay this invoice.
          </ThemedText>
        </View>
      ) : (
        <>
          {sources.map((source) => (
            <SourceRow
              key={source.id}
              onSelect={onSelect}
              selected={selectedId === source.id}
              source={source}
            />
          ))}
          {!hasEligibleSource(sources) ? (
            <ThemedText style={styles.noEligible}>
              None of your funding sources can pay this invoice. Review the reasons above.
            </ThemedText>
          ) : null}
        </>
      )}
    </View>
  );
};

const SourceRow = ({
  source,
  selected,
  onSelect,
}: {
  source: FundingSource;
  selected: boolean;
  onSelect: (source: FundingSource) => void;
}) => {
  const disabled = !source.eligible;
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={() => onSelect(source)}
      style={[styles.row, selected && styles.rowSelected, disabled && styles.rowDisabled]}
    >
      <View style={styles.rowMain}>
        <View style={styles.rowHeader}>
          <ThemedText style={styles.rowLabel}>{source.label}</ThemedText>
          <ThemedText style={styles.rowBalance}>
            {formatStroops(source.availableStroops)} {PILOT_ASSET_CODE}
          </ThemedText>
        </View>
        {source.detail ? <ThemedText style={styles.rowDetail}>{source.detail}</ThemedText> : null}
        {source.category ? <ThemedText style={styles.rowCategory}>Category: {source.category}</ThemedText> : null}
        {source.eligible ? (
          <ThemedText style={styles.rowResulting}>
            Balance after payment: {formatStroops(source.resultingBalanceStroops)} {PILOT_ASSET_CODE}
          </ThemedText>
        ) : (
          <ThemedText style={styles.rowReason}>{source.disabledReason}</ThemedText>
        )}
      </View>
      <View style={[styles.radio, selected && styles.radioSelected, disabled && styles.radioDisabled]}>
        {selected ? <View style={styles.radioDot} /> : null}
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: { gap: Spacing.two },
  heading: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 15, marginTop: Spacing.two },
  subheading: { color: BrandColors.grey, fontFamily: 'PlusJakartaSans_500Medium', fontSize: 12, lineHeight: 17 },
  stateRow: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two, paddingVertical: Spacing.three },
  stateText: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_500Medium', fontSize: 13 },
  stateCard: { borderRadius: BorderRadius.lg, gap: Spacing.one, padding: Spacing.three },
  blocked: { backgroundColor: 'rgba(192,57,43,0.10)' },
  blockedTitle: { color: '#C0392B', fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13 },
  blockedBody: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_500Medium', fontSize: 12, lineHeight: 17 },
  retry: { alignSelf: 'flex-start', backgroundColor: '#C0392B', borderRadius: BorderRadius.md, marginTop: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: Spacing.one },
  retryText: { color: '#FFFFFF', fontFamily: 'PlusJakartaSans_700Bold', fontSize: 12 },
  row: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: BrandColors.lightGray,
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
    flexDirection: 'row',
    gap: Spacing.two,
    padding: Spacing.three,
  },
  rowSelected: { borderColor: BrandColors.green },
  rowDisabled: { backgroundColor: BrandColors.lightGray, opacity: 0.7 },
  rowMain: { flex: 1, gap: 2 },
  rowHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.two },
  rowLabel: { color: BrandColors.navy, flexShrink: 1, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 14 },
  rowBalance: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 13 },
  rowDetail: { color: BrandColors.grey, fontFamily: 'PlusJakartaSans_500Medium', fontSize: 12 },
  rowCategory: { color: BrandColors.grey, fontFamily: 'PlusJakartaSans_500Medium', fontSize: 12 },
  rowResulting: { color: BrandColors.green, fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 12, marginTop: 2 },
  rowReason: { color: '#C0392B', fontFamily: 'PlusJakartaSans_500Medium', fontSize: 12, lineHeight: 16, marginTop: 2 },
  noEligible: { color: '#C0392B', fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 12, lineHeight: 17, marginTop: Spacing.one },
  radio: { alignItems: 'center', borderColor: BrandColors.grey, borderRadius: 999, borderWidth: 2, height: 22, justifyContent: 'center', width: 22 },
  radioSelected: { borderColor: BrandColors.green },
  radioDisabled: { borderColor: BrandColors.lightGray },
  radioDot: { backgroundColor: BrandColors.green, borderRadius: 999, height: 10, width: 10 },
});
