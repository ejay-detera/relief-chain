import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BrandColors, Spacing } from '@/constants/theme';

const FRAME_SIZE = 240;
const CORNER_SIZE = 36;
const CORNER_THICKNESS = 4;

export function QrViewfinder() {
  return (
    <View style={styles.container}>
      <View style={styles.frame}>
        <View style={[styles.corner, styles.cornerTopLeft]} />
        <View style={[styles.corner, styles.cornerTopRight]} />
        <View style={[styles.corner, styles.cornerBottomLeft]} />
        <View style={[styles.corner, styles.cornerBottomRight]} />
      </View>
      <ThemedText style={styles.caption}>Align the beneficiary&apos;s QR code to redeem digital aid vouchers.</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  frame: {
    width: FRAME_SIZE,
    height: FRAME_SIZE,
  },
  corner: {
    position: 'absolute',
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    borderColor: BrandColors.green,
  },
  cornerTopLeft: {
    top: 0,
    left: 0,
    borderTopWidth: CORNER_THICKNESS,
    borderLeftWidth: CORNER_THICKNESS,
    borderTopLeftRadius: 12,
  },
  cornerTopRight: {
    top: 0,
    right: 0,
    borderTopWidth: CORNER_THICKNESS,
    borderRightWidth: CORNER_THICKNESS,
    borderTopRightRadius: 12,
  },
  cornerBottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: CORNER_THICKNESS,
    borderLeftWidth: CORNER_THICKNESS,
    borderBottomLeftRadius: 12,
  },
  cornerBottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: CORNER_THICKNESS,
    borderRightWidth: CORNER_THICKNESS,
    borderBottomRightRadius: 12,
  },
  caption: {
    color: 'white',
    fontSize: 14,
    textAlign: 'center',
    marginTop: Spacing.four,
    paddingHorizontal: Spacing.six,
    lineHeight: 20,
  },
});
