import { FontAwesome } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BrandColors, Spacing } from '@/constants/theme';
import type { UserRole } from '@/types/auth';

type AccountChooserContentProps = {
  onRegister: (role: UserRole) => void;
  onScanId: () => void;
  onSignIn: (role: UserRole) => void;
};

const roles: { label: string; role: UserRole }[] = [
  { label: 'Organization', role: 'lgu' },
  { label: 'Beneficiary', role: 'beneficiary' },
  { label: 'Merchant', role: 'merchant' },
];

export const AccountChooserContent = ({ onRegister, onScanId, onSignIn }: AccountChooserContentProps) => (
  <View style={styles.content}>
    <ThemedText style={styles.title}>Choose Account Type</ThemedText>
    <Image contentFit="contain" source={require('@/assets/public/Logo-Icon.svg')} style={styles.logo} />
    <View style={styles.roleButtons}>
      {roles.map(({ label, role }) => (
        <Pressable accessibilityRole="button" key={role} onPress={() => onSignIn(role)} style={styles.roleButton}>
          <ThemedText style={styles.roleButtonText}>{label}</ThemedText>
        </Pressable>
      ))}
    </View>
    <View style={styles.divider}><View style={styles.dividerLine} /><ThemedText style={styles.dividerText}>OR</ThemedText><View style={styles.dividerLine} /></View>
    <Pressable accessibilityRole="button" onPress={onScanId} style={styles.scanButton}>
      <FontAwesome color="#FFFFFF" name="id-card" size={18} />
      <ThemedText style={styles.scanButtonText}>Scan ID</ThemedText>
    </Pressable>
    <View style={styles.footer}>
      <View style={styles.footerRow}><ThemedText style={styles.footerText}>New Organization? </ThemedText><Pressable onPress={() => onRegister('lgu')}><ThemedText style={styles.footerLink}>Create an account</ThemedText></Pressable></View>
      <View style={styles.footerRow}><ThemedText style={styles.footerText}>Register as: </ThemedText><Pressable onPress={() => onRegister('beneficiary')}><ThemedText style={styles.footerLink}>Beneficiary</ThemedText></Pressable><ThemedText style={styles.footerText}> · </ThemedText><Pressable onPress={() => onRegister('merchant')}><ThemedText style={styles.footerLink}>Merchant</ThemedText></Pressable></View>
    </View>
  </View>
);

const styles = StyleSheet.create({
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.four },
  title: { marginBottom: Spacing.four, color: BrandColors.navy, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 28, textAlign: 'center' },
  logo: { width: 140, height: 140, marginBottom: Spacing.five },
  roleButtons: { width: '100%', rowGap: Spacing.three },
  roleButton: { height: 45, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(17, 46, 88, 0.08)', borderColor: BrandColors.lightGray, borderWidth: 1, borderRadius: 20 },
  roleButtonText: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 18 },
  divider: { width: '100%', flexDirection: 'row', alignItems: 'center', marginVertical: Spacing.four },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: BrandColors.lightGray },
  dividerText: { marginHorizontal: Spacing.three, color: BrandColors.navy, fontFamily: 'PlusJakartaSans_400Regular', fontSize: 12 },
  scanButton: { width: '100%', height: 45, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', columnGap: Spacing.two, backgroundColor: BrandColors.green, borderRadius: 20 },
  scanButtonText: { color: '#FFFFFF', fontFamily: 'PlusJakartaSans_500Medium', fontSize: 14 },
  footer: { alignItems: 'center', marginTop: Spacing.four, rowGap: Spacing.one },
  footerRow: { flexDirection: 'row', alignItems: 'center' },
  footerText: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_400Regular', fontSize: 10 },
  footerLink: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 10 },
});