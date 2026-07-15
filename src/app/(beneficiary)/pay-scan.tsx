import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { QrViewfinder } from '@/components/beneficiary/PayScan/qr-viewfinder';
import { ScanHeader } from '@/components/beneficiary/PayScan/scan-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BrandColors, Spacing } from '@/constants/theme';

export default function PayScanScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const hasScannedRef = useRef(false);

  const handleBarcodeScanned = (result: BarcodeScanningResult) => {
    if (hasScannedRef.current) return;
    hasScannedRef.current = true;

    Alert.alert('QR Code Scanned', `Voucher redemption is not yet available.\n\nScanned data: ${result.data}`, [
      { text: 'OK', onPress: () => { hasScannedRef.current = false; } },
    ]);
  };

  if (!permission) {
    return <ThemedView style={styles.blackContainer} />;
  }

  if (!permission.granted) {
    // Design-only mockup shown before the user grants camera access. The background photo
    // and dim overlay are purely decorative here and are never shown once the real camera is live.
    return (
      <View style={styles.blackContainer}>
        <Image
          contentFit="cover"
          source={require('@/assets/public/background-payscan.png')}
          style={styles.backgroundImage}
        />
        <View style={styles.dimOverlay} />

        <SafeAreaView style={styles.overlay}>
          <ScanHeader onBack={() => router.back()} onFlipCamera={() => {}} showFlipButton={false} />
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
        onBarcodeScanned={handleBarcodeScanned}
        style={styles.camera}
      >
        <SafeAreaView style={styles.overlay}>
          <ScanHeader
            onBack={() => router.back()}
            onFlipCamera={() => setFacing((current) => (current === 'back' ? 'front' : 'back'))}
          />
          <View style={styles.viewfinderContainer}>
            <QrViewfinder />
          </View>
        </SafeAreaView>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  blackContainer: {
    flex: 1,
    backgroundColor: 'black',
  },
  camera: {
    flex: 1,
  },
  backgroundImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  dimOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  overlay: {
    flex: 1,
    justifyContent: 'space-between',
  },
  viewfinderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: Spacing.eight,
  },
  permissionFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.four,
  },
  cameraText: {
    color: 'white',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: Spacing.three,
  },
  button: {
    backgroundColor: BrandColors.green,
    padding: Spacing.four,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: Spacing.eight,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
