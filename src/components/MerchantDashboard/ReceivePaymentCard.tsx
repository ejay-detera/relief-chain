import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';

type ReceivePaymentCardProps = { onPress: () => void };

export const ReceivePaymentCard = ({ onPress }: ReceivePaymentCardProps) => (
  <Pressable accessibilityHint="Opens the customer payment QR scanner" accessibilityLabel="Receive payment" accessibilityRole="button" onPress={onPress} style={styles.card}>
    <View style={styles.content}>
      <MaterialCommunityIcons color="#FFFFFF" name="qrcode-scan" size={38} />
      <ThemedText style={styles.title}>Receive Payment</ThemedText>
      <ThemedText style={styles.subtitle}>Scan customer QR</ThemedText>
    </View>
  </Pressable>
);

const styles = StyleSheet.create({
  card: { backgroundColor: BrandColors.navy, borderRadius: BorderRadius.xl, height: 124, justifyContent: 'center' },
  content: { alignItems: 'center', gap: 1 },
  title: { color: '#FFFFFF', fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13, marginTop: Spacing.one },
  subtitle: { color: '#FFFFFF', fontFamily: 'PlusJakartaSans_400Regular', fontSize: 10 },
});
