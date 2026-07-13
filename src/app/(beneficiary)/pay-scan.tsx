import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome } from '@expo/vector-icons';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BrandColors, Spacing, BorderRadius } from '@/constants/theme';

export default function PayScanScreen() {
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <ThemedText style={styles.title}>Scan to Pay</ThemedText>
          <ThemedText style={styles.subtitle}>Scan a merchant's QR code to redeem your voucher or send XLM.</ThemedText>
        </View>

        <View style={styles.cameraPlaceholder}>
          <FontAwesome name="camera" size={64} color={BrandColors.lightGray} />
          <ThemedText style={styles.cameraText}>Camera access required</ThemedText>
        </View>

        <Pressable style={styles.button}>
          <ThemedText style={styles.buttonText}>Enable Camera</ThemedText>
        </Pressable>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.four,
  },
  header: {
    marginTop: Spacing.six,
    marginBottom: Spacing.eight,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: Spacing.two,
  },
  subtitle: {
    fontSize: 14,
    color: '#rgba(255,255,255,0.7)',
  },
  cameraPlaceholder: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: BorderRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.eight,
  },
  cameraText: {
    color: BrandColors.lightGray,
    marginTop: Spacing.four,
    fontSize: 14,
  },
  button: {
    backgroundColor: BrandColors.green,
    padding: Spacing.four,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    marginBottom: Spacing.eight,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
