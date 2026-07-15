import { useCameraPermissions } from 'expo-camera';
import { type Href, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert } from 'react-native';

import { MerchantRedemptionSuccess } from '@/components/MerchantScan/MerchantRedemptionSuccess';
import { MerchantScannerView } from '@/components/MerchantScan/MerchantScannerView';
import { recordDemoMerchantRedemption } from '@/services/merchantMetricsService';

const MerchantReceiveScreen = () => {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const scanLocked = useRef(false);

  const redeemDemoVoucher = async () => {
    if (scanLocked.current) return;
    scanLocked.current = true;
    setIsRedeeming(true);
    try {
      await recordDemoMerchantRedemption();
      setIsComplete(true);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Please check your connection and try again.';
      Alert.alert('Redemption failed', message);
      scanLocked.current = false;
    } finally {
      setIsRedeeming(false);
    }
  };

  const scanAnother = () => { scanLocked.current = false; setIsComplete(false); };
  const enableCamera = () => { void requestPermission().catch(() => Alert.alert('Camera unavailable', 'Use Demo Scan to continue.')); };
  if (isComplete) return <MerchantRedemptionSuccess onDashboard={() => router.replace('/(merchant)' as Href)} onScanAnother={scanAnother} />;
  return <MerchantScannerView canAskPermission={permission?.canAskAgain ?? true} hasPermission={permission?.granted ?? null} isRedeeming={isRedeeming} onBack={() => router.back()} onDemoScan={() => void redeemDemoVoucher()} onEnableCamera={enableCamera} onQrScanned={() => void redeemDemoVoucher()} />;
};

export default MerchantReceiveScreen;
