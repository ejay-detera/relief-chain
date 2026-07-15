import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BrandColors, Spacing } from '@/constants/theme';

type Props = { onBack: () => void };
export const MerchantProgramsHeader = ({ onBack }: Props) => <View style={styles.header}>
  <Pressable accessibilityLabel="Back to dashboard" accessibilityRole="button" hitSlop={8} onPress={onBack} style={styles.back}><MaterialCommunityIcons color={BrandColors.navy} name="arrow-left" size={22} /><ThemedText style={styles.backText}>Back</ThemedText></Pressable>
  <ThemedText style={styles.title}>Programs</ThemedText><View style={styles.spacer} />
</View>;
const styles = StyleSheet.create({ header: { alignItems: 'center', borderBottomColor: BrandColors.lightGray, borderBottomWidth: 1, flexDirection: 'row', minHeight: 58, paddingHorizontal: Spacing.three }, back: { alignItems: 'center', flexDirection: 'row', gap: Spacing.one, minWidth: 82 }, backText: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13 }, title: { color: BrandColors.navy, flex: 1, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 16, textAlign: 'center' }, spacer: { width: 82 } });
