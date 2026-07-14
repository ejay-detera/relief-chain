import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';

type MerchantDashboardHeaderProps = { onNotificationsPress: () => void };

export const MerchantDashboardHeader = ({ onNotificationsPress }: MerchantDashboardHeaderProps) => (
  <View style={styles.header}>
    <Image contentFit="contain" source={require('@/assets/images/logo-glow.png')} style={styles.logo} />
    <View style={styles.wordmark}>
      <ThemedText style={styles.relief}>Relief</ThemedText>
      <ThemedText style={styles.chain}>Chain</ThemedText>
    </View>
    <Pressable accessibilityLabel="Open notifications" accessibilityRole="button" hitSlop={8} onPress={onNotificationsPress} style={styles.notification}>
      <MaterialCommunityIcons color="#FFFFFF" name="bell-outline" size={22} />
    </Pressable>
  </View>
);

const styles = StyleSheet.create({
  header: { alignItems: 'center', backgroundColor: '#F7F7F7', flexDirection: 'row', height: 58, paddingHorizontal: Spacing.three, shadowColor: '#000000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.18, shadowRadius: 4, elevation: 4 },
  logo: { height: 38, width: 38 },
  wordmark: { marginLeft: Spacing.two },
  relief: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 15, lineHeight: 17 },
  chain: { color: BrandColors.green, fontFamily: 'Sarina_400Regular', fontSize: 15, lineHeight: 18, marginLeft: Spacing.two },
  notification: { alignItems: 'center', backgroundColor: BrandColors.navy, borderRadius: BorderRadius.md, height: 32, justifyContent: 'center', marginLeft: 'auto', width: 34 },
});
