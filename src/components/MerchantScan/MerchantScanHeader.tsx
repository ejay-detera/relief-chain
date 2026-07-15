import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

type Props = { onBack: () => void };
export const MerchantScanHeader = ({ onBack }: Props) => <View style={styles.header}>
  <Pressable accessibilityLabel="Go back" accessibilityRole="button" hitSlop={10} onPress={onBack} style={styles.back}>
    <MaterialCommunityIcons color="#FFFFFF" name="arrow-left" size={21} /><ThemedText style={styles.backText}>Back</ThemedText>
  </Pressable>
  <Image contentFit="contain" source={require('@/assets/public/Logo.svg')} style={styles.logo} />
</View>;

const styles = StyleSheet.create({
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: Spacing.four, paddingTop: Spacing.two },
  back: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two, minHeight: 44 },
  backText: { color: '#FFFFFF', fontFamily: 'PlusJakartaSans_700Bold', fontSize: 14 },
  logo: { height: 48, width: 86 },
});
