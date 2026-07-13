import React from 'react';
import { StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { ThemedText } from '@/components/themed-text';
import { BrandColors, Spacing, BorderRadius } from '@/constants/theme';

type Props = {
  publicKey?: string;
};

export function BeneficiaryQRCard({ publicKey }: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.qrContainer}>
        {publicKey ? (
          <QRCode
            value={publicKey}
            size={160}
            color={BrandColors.navy}
            backgroundColor="white"
          />
        ) : (
          <View style={styles.placeholder} />
        )}
      </View>
      <ThemedText style={styles.title}>Your Payment QR</ThemedText>
      <ThemedText style={styles.subtitle}>Present this to merchants to receive aid or redeem vouchers</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'white',
    borderRadius: BorderRadius.lg,
    padding: Spacing.four,
    marginHorizontal: Spacing.four,
    marginBottom: Spacing.three,
    alignItems: 'center',
    boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
  },
  qrContainer: {
    padding: Spacing.three,
    backgroundColor: 'white',
    borderRadius: BorderRadius.md,
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    marginBottom: Spacing.three,
  },
  placeholder: {
    width: 160,
    height: 160,
    backgroundColor: BrandColors.lightGray,
  },
  title: {
    color: BrandColors.navy,
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: Spacing.one,
  },
  subtitle: {
    color: BrandColors.grey,
    fontSize: 12,
    textAlign: 'center',
    paddingHorizontal: Spacing.four,
  },
});
