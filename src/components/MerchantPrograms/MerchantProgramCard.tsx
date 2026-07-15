import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import type { MerchantProgram } from '@/types/merchant-program';

type Props = { program: MerchantProgram };

const formatDate = (value: string | null): string => {
  if (!value) return 'Not specified';
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return value;
  return new Date(year, month - 1, day).toLocaleDateString('en-PH', { day: 'numeric', month: 'short', year: 'numeric' });
};
const formatValue = (value: number) => `₱${value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const label = (value: string) => value.replace(/(^|[-_\s])\w/g, (match) => match.toUpperCase()).replace(/[-_]/g, ' ');

export const MerchantProgramCard = ({ program }: Props) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const statusStyle = program.status === 'active' ? styles.active : program.status === 'scheduled' ? styles.scheduled : styles.completed;
  const dateRange = `${formatDate(program.startDate)} – ${formatDate(program.endDate)}`;
  const distributionRange = `${formatDate(program.distributionStart)} – ${formatDate(program.distributionEnd)}`;
  const scope = program.scope.length > 0 ? program.scope.join(', ') : 'All supported locations';

  return <Pressable accessibilityHint="Expands program details" accessibilityLabel={`${program.name} program`} accessibilityRole="button" accessibilityState={{ expanded: isExpanded }} onPress={() => setIsExpanded((current) => !current)} style={styles.card}>
    <View style={styles.header}><ThemedText style={[styles.status, statusStyle]}>{label(program.status)}</ThemedText></View>
    <ThemedText style={styles.title}>{program.name}</ThemedText>
    <ThemedText style={styles.purpose}>{program.purpose}</ThemedText>
    <View style={styles.voucherRow}><View style={styles.voucherItem}><ThemedText style={styles.caption}>Voucher Value</ThemedText><ThemedText style={styles.value}>{formatValue(program.voucherValue)}</ThemedText></View><View style={styles.voucherItem}><ThemedText style={styles.caption}>Type</ThemedText><ThemedText style={styles.value}>{program.voucherTypes.join(', ') || 'General'}</ThemedText></View><View style={styles.voucherItem}><ThemedText style={styles.caption}>Expiry</ThemedText><ThemedText style={styles.value}>{formatDate(program.voucherExpiration)}</ThemedText></View></View>
    {isExpanded ? <View style={styles.details}>
      <View style={styles.detailRow}><ThemedText style={styles.detailLabel}>Quantity</ThemedText><ThemedText style={styles.detailValue}>{program.voucherQuantity.toLocaleString('en-PH')}</ThemedText></View>
      <View style={styles.detailRow}><ThemedText style={styles.detailLabel}>Distribution</ThemedText><ThemedText style={styles.detailValue}>{label(program.distributionMethod)}</ThemedText></View>
      <View style={styles.detailRow}><ThemedText style={styles.detailLabel}>Program dates</ThemedText><ThemedText style={styles.detailValue}>{dateRange}</ThemedText></View>
      <View style={styles.detailRow}><ThemedText style={styles.detailLabel}>Distribution dates</ThemedText><ThemedText style={styles.detailValue}>{distributionRange}</ThemedText></View>
      <View style={styles.detailRow}><ThemedText style={styles.detailLabel}>Scope</ThemedText><ThemedText style={styles.detailValue}>{scope}</ThemedText></View>
      <View style={styles.detailRow}><ThemedText style={styles.detailLabel}>Merchant access</ThemedText><ThemedText style={styles.detailValue}>{program.isOpenToAllMerchants ? 'All merchants' : 'Selected merchants'}</ThemedText></View>
    </View> : null}
    <View style={styles.expandRow}><ThemedText style={styles.expandText}>{isExpanded ? 'Hide details' : 'View details'}</ThemedText><MaterialCommunityIcons color={BrandColors.navy} name={isExpanded ? 'chevron-up' : 'chevron-down'} size={20} /></View>
  </Pressable>;
};

const styles = StyleSheet.create({
  card: { backgroundColor: '#FFFFFF', borderRadius: BorderRadius.md, elevation: 4, padding: Spacing.three, shadowColor: '#000000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.12, shadowRadius: 8 },
  header: { alignItems: 'flex-end', height: 24 }, status: { borderRadius: BorderRadius.full, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 9, overflow: 'hidden', paddingHorizontal: Spacing.three, paddingVertical: 3 }, active: { backgroundColor: BrandColors.green, color: '#FFFFFF' }, scheduled: { backgroundColor: BrandColors.yellow, color: BrandColors.navy }, completed: { backgroundColor: BrandColors.lightGray, color: BrandColors.navy },
  title: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 15 }, purpose: { color: BrandColors.grey, fontFamily: 'PlusJakartaSans_400Regular', fontSize: 10, lineHeight: 15, marginTop: Spacing.two },
  voucherRow: { borderTopColor: BrandColors.lightGray, borderTopWidth: 1, flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.three, paddingTop: Spacing.three }, voucherItem: { flex: 1 }, caption: { color: BrandColors.grey, fontFamily: 'PlusJakartaSans_400Regular', fontSize: 8 }, value: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 9, marginTop: 2 },
  details: { backgroundColor: BrandColors.lightGray, borderRadius: BorderRadius.md, gap: Spacing.two, marginTop: Spacing.three, padding: Spacing.three }, detailRow: { flexDirection: 'row', gap: Spacing.three, justifyContent: 'space-between' }, detailLabel: { color: BrandColors.grey, fontFamily: 'PlusJakartaSans_500Medium', fontSize: 9 }, detailValue: { color: BrandColors.navy, flex: 1, fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 9, textAlign: 'right' },
  expandRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'flex-end', marginTop: Spacing.three }, expandText: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 9 },
});
