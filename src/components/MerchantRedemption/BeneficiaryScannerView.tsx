import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import { extractBeneficiaryAddress } from '@/services/merchant-redemption-service';

type Props = {
  onScan: (scannedData: string) => void;
  onClose: () => void;
  isProcessing?: boolean;
};

export function BeneficiaryScannerView({ onScan, onClose, isProcessing = false }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [torch, setTorch] = useState(false);
  const [manualModalVisible, setManualModalVisible] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const [manualError, setManualError] = useState<string | null>(null);

  const scannedLock = useRef(false);

  useEffect(() => {
    if (!isProcessing) {
      const timer = setTimeout(() => {
        scannedLock.current = false;
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [isProcessing]);

  const handleBarcodeScanned = useCallback(
    (result: BarcodeScanningResult) => {
      if (scannedLock.current || isProcessing) return;
      const data = result.data?.trim();
      if (!data) return;

      scannedLock.current = true;
      try {
        onScan(data);
      } catch (err) {
        console.warn('[BeneficiaryScannerView] onScan error:', err);
      }
    },
    [isProcessing, onScan]
  );

  const handleManualSubmit = () => {
    const clean = manualInput.trim();
    if (!clean) {
      setManualError('Enter a beneficiary wallet address or code.');
      return;
    }
    const extracted = extractBeneficiaryAddress(clean);
    if (!extracted) {
      setManualError('Invalid format. Expected a Stellar wallet address (starts with G...).');
      return;
    }
    setManualError(null);
    setManualModalVisible(false);
    onScan(extracted);
  };

  if (!permission) {
    return <View style={styles.blackBackground} />;
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.permissionContainer}>
        <View style={styles.headerRow}>
          <Pressable onPress={onClose} style={styles.iconButton}>
            <MaterialCommunityIcons name="close" size={24} color="#FFFFFF" />
          </Pressable>
        </View>
        <View style={styles.permissionContent}>
          <MaterialCommunityIcons name="camera-off" size={64} color={BrandColors.grey} />
          <ThemedText style={styles.permissionTitle}>Camera Access Required</ThemedText>
          <ThemedText style={styles.permissionSubtitle}>
            ReliefChain requires camera access to scan beneficiary relief passes and payment QR codes.
          </ThemedText>
          <Pressable onPress={requestPermission} style={styles.permissionButton}>
            <ThemedText style={styles.permissionButtonText}>Grant Permission</ThemedText>
          </Pressable>
          <Pressable onPress={() => setManualModalVisible(true)} style={styles.manualEntryLink}>
            <ThemedText style={styles.manualEntryLinkText}>Or enter wallet address manually</ThemedText>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        enableTorch={torch}
        facing={facing}
        onBarcodeScanned={handleBarcodeScanned}
        style={StyleSheet.absoluteFill}
      />

      <SafeAreaView edges={['top']} style={styles.overlay}>
        {/* Top Controls */}
        <View style={styles.headerRow}>
          <Pressable accessibilityLabel="Close scanner" onPress={onClose} style={styles.iconButton}>
            <MaterialCommunityIcons name="close" size={24} color="#FFFFFF" />
          </Pressable>
          <ThemedText style={styles.headerTitle}>Scan Beneficiary QR</ThemedText>
          <View style={styles.topRightControls}>
            <Pressable
              accessibilityLabel="Toggle torch"
              onPress={() => setTorch((prev) => !prev)}
              style={styles.iconButton}
            >
              <MaterialCommunityIcons
                name={torch ? 'flashlight' : 'flashlight-off'}
                size={22}
                color={torch ? BrandColors.yellow : '#FFFFFF'}
              />
            </Pressable>
            <Pressable
              accessibilityLabel="Flip camera"
              onPress={() => setFacing((prev) => (prev === 'back' ? 'front' : 'back'))}
              style={styles.iconButton}
            >
              <MaterialCommunityIcons name="camera-flip-outline" size={22} color="#FFFFFF" />
            </Pressable>
          </View>
        </View>

        {/* Viewfinder Target */}
        <View style={styles.viewfinderCenter}>
          <View style={styles.viewfinderFrame}>
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
          </View>
          <ThemedText style={styles.instructionText}>
            Align the beneficiary's QR code within the frame
          </ThemedText>
        </View>

        {/* Bottom Bar: Manual Entry */}
        <SafeAreaView edges={['bottom']} style={styles.bottomBar}>
          <Pressable onPress={() => setManualModalVisible(true)} style={styles.manualButton}>
            <MaterialCommunityIcons name="keyboard-outline" size={18} color="#FFFFFF" />
            <ThemedText style={styles.manualButtonText}>Enter Address Manually</ThemedText>
          </Pressable>
        </SafeAreaView>
      </SafeAreaView>

      {/* Manual Input Modal */}
      <Modal
        animationType="fade"
        onRequestClose={() => setManualModalVisible(false)}
        transparent
        visible={manualModalVisible}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>Enter Beneficiary Address</ThemedText>
              <Pressable onPress={() => setManualModalVisible(false)}>
                <MaterialCommunityIcons name="close" size={20} color={BrandColors.navy} />
              </Pressable>
            </View>
            <ThemedText style={styles.modalSubtitle}>
              Paste or type the beneficiary's Stellar wallet public key or identity reference.
            </ThemedText>
            <TextInput
              autoCapitalize="characters"
              autoFocus
              onChangeText={(t) => {
                setManualInput(t);
                setManualError(null);
              }}
              placeholder="e.g. GAIKYUNHR73..."
              placeholderTextColor={BrandColors.grey}
              style={styles.modalInput}
              value={manualInput}
            />
            {manualError && <ThemedText style={styles.modalError}>{manualError}</ThemedText>}
            <View style={styles.modalActionRow}>
              <Pressable
                onPress={() => setManualModalVisible(false)}
                style={styles.modalCancelButton}
              >
                <ThemedText style={styles.modalCancelText}>Cancel</ThemedText>
              </Pressable>
              <Pressable onPress={handleManualSubmit} style={styles.modalSubmitButton}>
                <ThemedText style={styles.modalSubmitText}>Verify & Inspect</ThemedText>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  blackBackground: {
    flex: 1,
    backgroundColor: '#000000',
  },
  overlay: {
    flex: 1,
    justifyContent: 'space-between',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 16,
  },
  topRightControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewfinderCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewfinderFrame: {
    width: 260,
    height: 260,
    position: 'relative',
    backgroundColor: 'transparent',
  },
  corner: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderColor: BrandColors.green,
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: BorderRadius.md,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: BorderRadius.md,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: BorderRadius.md,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: BorderRadius.md,
  },
  instructionText: {
    color: '#FFFFFF',
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 13,
    marginTop: Spacing.four,
    textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: BorderRadius.full,
  },
  bottomBar: {
    alignItems: 'center',
    paddingBottom: Spacing.four,
  },
  manualButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  manualButtonText: {
    color: '#FFFFFF',
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 13,
  },
  permissionContainer: {
    flex: 1,
    backgroundColor: BrandColors.navy,
    justifyContent: 'space-between',
  },
  permissionContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.five,
    gap: Spacing.three,
  },
  permissionTitle: {
    color: '#FFFFFF',
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 18,
  },
  permissionSubtitle: {
    color: BrandColors.lightGray,
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  permissionButton: {
    backgroundColor: BrandColors.green,
    paddingHorizontal: Spacing.five,
    paddingVertical: Spacing.three,
    borderRadius: BorderRadius.lg,
    marginTop: Spacing.two,
  },
  permissionButtonText: {
    color: '#FFFFFF',
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 14,
  },
  manualEntryLink: {
    marginTop: Spacing.two,
  },
  manualEntryLinkText: {
    color: BrandColors.green,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 13,
    textDecorationLine: 'underline',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.xl,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitle: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 16,
  },
  modalSubtitle: {
    color: BrandColors.grey,
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 12,
    lineHeight: 16,
  },
  modalInput: {
    backgroundColor: '#F8FAFC',
    borderColor: BrandColors.lightGray,
    borderWidth: 1.5,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 13,
    color: BrandColors.navy,
  },
  modalError: {
    color: '#DC2626',
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 11,
  },
  modalActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  modalCancelButton: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  modalCancelText: {
    color: BrandColors.grey,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 13,
  },
  modalSubmitButton: {
    backgroundColor: BrandColors.navy,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderRadius: BorderRadius.md,
  },
  modalSubmitText: {
    color: '#FFFFFF',
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13,
  },
});
