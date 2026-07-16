import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { QrViewfinder } from '@/components/beneficiary/PayScan/qr-viewfinder';
import { ScanHeader } from '@/components/beneficiary/PayScan/scan-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BrandColors, Spacing } from '@/constants/theme';

type Props = {
  /** When false, scanned frames are ignored (e.g. while a scan is being processed). */
  enabled: boolean;
  onScan: (data: string) => void;
  onBack: () => void;
  /** A decode/verification error to surface with a "Scan again" action. */
  errorMessage: string | null;
  onDismissError: () => void;
};

/**
 * The camera + permission surface for the beneficiary pay-scan flow. It owns only
 * the camera lifecycle and forwards each scanned QR string to `onScan`; decoding,
 * verification, and review live in the screen so this component stays presentational.
 */
export const ScannerView = ({ enabled, onScan, onBack, errorMessage, onDismissError }: Props) => {
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<'back' | 'front'>('back');

  const handleBarcodeScanned = (result: BarcodeScanningResult) => {
    if (!enabled) return;
    onScan(result.data);
  };

  if (!permission) {
    return <ThemedView style={styles.blackContainer} />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.blackContainer}>
        <Image
          contentFit="cover"
          source={require('@/assets/public/background-payscan.png')}
          style={styles.backgroundImage}
        />
        <View style={styles.dimOverlay} />

        <SafeAreaView style={styles.overlay}>
          <ScanHeader onBack={onBack} onFlipCamera={() => {}} showFlipButton={false} />
          <View style={styles.viewfinderContainer}>
            <QrViewfinder />
          </View>
        </SafeAreaView>

        <SafeAreaView style={styles.permissionFooter}>
          <ThemedText style={styles.cameraText}>Camera access is required to scan QR codes.</ThemedText>
          <Pressable onPress={requestPermission} style={styles.button}>
            <ThemedText style={styles.buttonText}>Enable Camera</ThemedText>
          </Pressable>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.blackContainer}>
      <CameraView
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        facing={facing}
        onBarcodeScanned={enabled ? handleBarcodeScanned : undefined}
        style={styles.camera}
      >
        <SafeAreaView style={styles.overlay}>
          <ScanHeader
            onBack={onBack}
            onFlipCamera={() => setFacing((current) => (current === 'back' ? 'front' : 'back'))}
          />
          <View style={styles.viewfinderContainer}>
            <QrViewfinder />
          </View>

          {errorMessage ? (
            <View style={styles.errorFooter}>
              <ThemedText style={styles.errorTitle}>Can&apos;t use this code</ThemedText>
              <ThemedText style={styles.errorBody}>{errorMessage}</ThemedText>
              <Pressable accessibilityRole="button" onPress={onDismissError} style={styles.button}>
                <ThemedText style={styles.buttonText}>Scan again</ThemedText>
              </Pressable>
            </View>
          ) : null}
        </SafeAreaView>
      </CameraView>
    </View>
  );
};

const styles = StyleSheet.create({
  blackContainer: { backgroundColor: 'black', flex: 1 },
  camera: { flex: 1 },
  backgroundImage: { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
  dimOverlay: { backgroundColor: 'rgba(0, 0, 0, 0.6)', bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
  overlay: { flex: 1, justifyContent: 'space-between' },
  viewfinderContainer: { alignItems: 'center', flex: 1, justifyContent: 'center', paddingBottom: Spacing.eight },
  permissionFooter: { bottom: 0, left: 0, paddingHorizontal: Spacing.four, position: 'absolute', right: 0 },
  cameraText: { color: 'white', fontSize: 14, marginBottom: Spacing.three, textAlign: 'center' },
  errorFooter: { backgroundColor: 'rgba(17,46,88,0.92)', borderRadius: 16, gap: Spacing.two, margin: Spacing.three, padding: Spacing.four },
  errorTitle: { color: 'white', fontFamily: 'PlusJakartaSans_700Bold', fontSize: 15 },
  errorBody: { color: 'rgba(255,255,255,0.85)', fontFamily: 'PlusJakartaSans_500Medium', fontSize: 13, lineHeight: 18 },
  button: { alignItems: 'center', backgroundColor: BrandColors.green, borderRadius: 12, marginBottom: Spacing.two, marginTop: Spacing.one, padding: Spacing.four },
  buttonText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
});
