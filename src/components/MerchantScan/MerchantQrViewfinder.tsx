import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BrandColors, Spacing } from '@/constants/theme';

export const MerchantQrViewfinder = () => <View style={styles.container}>
  <View style={styles.frame}>
    <View style={[styles.corner, styles.topLeft]} /><View style={[styles.corner, styles.topRight]} />
    <View style={[styles.corner, styles.bottomLeft]} /><View style={[styles.corner, styles.bottomRight]} />
  </View>
  <ThemedText style={styles.caption}>Align the beneficiary&apos;s QR code to redeem their Food Relief Voucher.</ThemedText>
</View>;

const styles = StyleSheet.create({
  container: { alignItems: 'center', width: '100%' },
  frame: { height: 250, width: 250 },
  corner: { borderColor: BrandColors.green, height: 48, position: 'absolute', width: 48 },
  topLeft: { borderLeftWidth: 6, borderTopLeftRadius: 14, borderTopWidth: 6, left: 0, top: 0 },
  topRight: { borderRightWidth: 6, borderTopRightRadius: 14, borderTopWidth: 6, right: 0, top: 0 },
  bottomLeft: { borderBottomLeftRadius: 14, borderBottomWidth: 6, borderLeftWidth: 6, bottom: 0, left: 0 },
  bottomRight: { borderBottomRightRadius: 14, borderBottomWidth: 6, borderRightWidth: 6, bottom: 0, right: 0 },
  caption: { color: '#FFFFFF', fontFamily: 'PlusJakartaSans_500Medium', fontSize: 14, lineHeight: 21, marginTop: Spacing.four, maxWidth: 300, textAlign: 'center' },
});
