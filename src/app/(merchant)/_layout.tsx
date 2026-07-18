import { Stack, usePathname, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { fetchMyAccreditation } from '@/services/merchantAccreditationService';

// Screens that require an active accreditation to access
const PROTECTED_ROUTES = ['/receive', '/programs', '/redemptions'];

const MerchantLayout = () => {
  const router = useRouter();
  const pathname = usePathname();
  const [accreditationStatus, setAccreditationStatus] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    fetchMyAccreditation()
      .then((acc) => setAccreditationStatus(acc?.status ?? null))
      .catch(() => setAccreditationStatus(null));
  }, []);

  useEffect(() => {
    // undefined = still loading, skip
    if (accreditationStatus === undefined) return;

    const isActive = accreditationStatus === 'active';
    const isProtected = PROTECTED_ROUTES.some((r) => pathname.endsWith(r));

    if (!isActive && isProtected) {
      Alert.alert(
        'Account Not Yet Verified',
        'Your merchant account is still pending review by your LGU administrator. You will be notified once your application is approved.',
        [{ text: 'OK', style: 'default' }]
      );
      router.replace('/(merchant)/' as any);
    }
  }, [accreditationStatus, pathname, router]);


  return (
    <Stack screenOptions={{ animation: 'none', headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="receive" />
      <Stack.Screen name="profile" />
      <Stack.Screen name="programs" />
      <Stack.Screen name="security" />
      <Stack.Screen name="redemptions" />
    </Stack>
  );
};

export default MerchantLayout;
