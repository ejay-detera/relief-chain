import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import type { MerchantProgram } from '@/types/merchant-dashboard';

type MerchantProgramCardProps = { onPress: () => void; program: MerchantProgram };

export const MerchantProgramCard = ({ onPress, program }: MerchantProgramCardProps) => (
  <Pressable accessibilityHint="Opens program details" accessibilityLabel={`${program.name} program`} accessibilityRole="button" onPress={onPress} style={styles.card}>
    <View style={styles.header}><ThemedText style={styles.status}>{program.status}</ThemedText></View>
    <ThemedText style={styles.title}>{program.name}</ThemedText>
    <ThemedText style={styles.description}>{program.description}</ThemedText>
    <View style={styles.footer}><View><ThemedText style={styles.merchantLabel}>Merchant ID</ThemedText><ThemedText style={styles.merchantId}>{program.merchantId}</ThemedText></View><MaterialCommunityIcons color={BrandColors.navy} name="arrow-right" size={21} /></View>
  </Pressable>
);

const styles = StyleSheet.create({
  card: { backgroundColor: '#FFFFFF', borderRadius: BorderRadius.md, elevation: 4, minHeight: 162, padding: Spacing.three, shadowColor: '#000000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.12, shadowRadius: 8 },
  header: { alignItems: 'flex-end', height: 24 },
  status: { backgroundColor: 'rgba(111,202,75,0.5)', borderRadius: BorderRadius.full, color: '#009900', fontFamily: 'PlusJakartaSans_700Bold', fontSize: 9, paddingHorizontal: Spacing.three, paddingVertical: 2 },
  title: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_500Medium', fontSize: 14, marginTop: 2 },
  description: { color: '#000000', fontFamily: 'PlusJakartaSans_400Regular', fontSize: 9, lineHeight: 11, marginTop: Spacing.two },
  footer: { alignItems: 'flex-end', flexDirection: 'row', justifyContent: 'space-between', marginTop: 'auto' },
  merchantLabel: { color: BrandColors.grey, fontFamily: 'PlusJakartaSans_400Regular', fontSize: 9 },
  merchantId: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 10, marginTop: 1 },
});
