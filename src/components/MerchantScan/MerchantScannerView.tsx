import { CameraView } from 'expo-camera';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MerchantQrViewfinder } from '@/components/MerchantScan/MerchantQrViewfinder';
import { MerchantScanHeader } from '@/components/MerchantScan/MerchantScanHeader';
import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';

type Props = { canAskPermission: boolean; hasPermission: boolean | null; isRedeeming: boolean; onBack: () => void; onDemoScan: () => void; onEnableCamera: () => void; onQrScanned: () => void };
export const MerchantScannerView = ({ canAskPermission, hasPermission, isRedeeming, onBack, onDemoScan, onEnableCamera, onQrScanned }: Props) => <View style={styles.screen}>
  {hasPermission && <CameraView barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={isRedeeming ? undefined : onQrScanned} style={StyleSheet.absoluteFill} />}
  <View style={styles.scrim} />
  <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={styles.overlay}>
    <MerchantScanHeader onBack={onBack} />
    <View style={styles.center}><MerchantQrViewfinder /></View>
    <View style={styles.actions}>
      {hasPermission === null && <ThemedText style={styles.permissionText}>Preparing camera…</ThemedText>}
      {hasPermission === false && <>
        <ThemedText style={styles.permissionText}>Camera access is unavailable. You can still run the demo redemption.</ThemedText>
        {canAskPermission && <Pressable accessibilityRole="button" onPress={onEnableCamera} style={styles.permissionButton}><ThemedText style={styles.permissionButtonText}>Enable Camera</ThemedText></Pressable>}
      </>}
      <Pressable accessibilityRole="button" disabled={isRedeeming} onPress={onDemoScan} style={({ pressed }) => [styles.demoButton, (pressed || isRedeeming) && styles.disabled]}>
        {isRedeeming ? <ActivityIndicator color="#FFFFFF" size="small" /> : <ThemedText style={styles.demoText}>Demo Scan</ThemedText>}
      </Pressable>
    </View>
  </SafeAreaView>
</View>;

const styles = StyleSheet.create({
  screen: { backgroundColor: '#000000', flex: 1 }, scrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.42)' }, overlay: { flex: 1 }, center: { alignItems: 'center', flex: 1, justifyContent: 'center', paddingBottom: Spacing.six },
  actions: { alignItems: 'center', minHeight: 145, paddingHorizontal: Spacing.four }, permissionText: { color: '#FFFFFF', fontFamily: 'PlusJakartaSans_500Medium', fontSize: 12, lineHeight: 17, marginBottom: Spacing.two, textAlign: 'center' },
  permissionButton: { backgroundColor: BrandColors.green, borderRadius: BorderRadius.xl, marginBottom: Spacing.two, paddingHorizontal: Spacing.four, paddingVertical: Spacing.two }, permissionButtonText: { color: '#FFFFFF', fontFamily: 'PlusJakartaSans_700Bold', fontSize: 12 },
  demoButton: { alignItems: 'center', backgroundColor: 'rgba(17,46,88,0.82)', borderColor: BrandColors.green, borderRadius: BorderRadius.xl, borderWidth: 1, minHeight: 40, justifyContent: 'center', paddingHorizontal: Spacing.four }, demoText: { color: '#FFFFFF', fontFamily: 'PlusJakartaSans_700Bold', fontSize: 12 }, disabled: { opacity: 0.65 },
});
