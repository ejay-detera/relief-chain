import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { ThemedText } from '@/components/themed-text';
import { BrandColors, BorderRadius, Spacing } from '@/constants/theme';

type AccreditationStatus = 'pending' | 'active' | 'suspended' | 'expired' | 'revoked';
type Props = { status: AccreditationStatus };

const CONFIG: Record<AccreditationStatus, { bg: string; border: string; icon: string; label: string }> = {
  pending:   { bg: '#FEF9E7', border: BrandColors.yellow,  icon: 'clock-o',      label: 'Application Pending Review' },
  active:    { bg: '#EAFAF1', border: BrandColors.green,   icon: 'check-circle',  label: 'Account Approved & Active' },
  suspended: { bg: '#FDF2F8', border: '#8E44AD',           icon: 'ban',           label: 'Account Suspended' },
  expired:   { bg: '#F2F3F4', border: BrandColors.grey,    icon: 'calendar-times-o', label: 'Accreditation Expired' },
  revoked:   { bg: '#FDEDEC', border: '#E74C3C',           icon: 'times-circle',  label: 'Accreditation Revoked' },
};

export const AccreditationStatusBanner = ({ status }: Props) => {
  const cfg = CONFIG[status];
  if (status === 'active') return null; // Don't show banner for active merchants
  return (
    <View style={[styles.banner, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
      <View style={styles.row}>
        <FontAwesome name={cfg.icon as any} size={18} color={cfg.border} />
        <ThemedText style={[styles.label, { color: cfg.border }]}>{cfg.label}</ThemedText>
      </View>
      {(status === 'suspended' || status === 'revoked') && (
        <ThemedText style={styles.subtext}>Contact your LGU for more information.</ThemedText>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  banner: { borderWidth: 1, borderRadius: BorderRadius.md, padding: Spacing.three, marginHorizontal: Spacing.three, marginBottom: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  label: { flex: 1, fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 13 },
  subtext: { marginTop: Spacing.two, fontFamily: 'PlusJakartaSans_400Regular', fontSize: 12, color: BrandColors.grey, lineHeight: 16 },
});
