import { Buffer } from 'buffer';
import 'react-native-get-random-values';
if (typeof (globalThis as any).Buffer === 'undefined') (globalThis as any).Buffer = Buffer;

import { PlusJakartaSans_400Regular, PlusJakartaSans_500Medium, PlusJakartaSans_600SemiBold, PlusJakartaSans_700Bold, useFonts } from '@expo-google-fonts/plus-jakarta-sans';
import { Sarina_400Regular } from '@expo-google-fonts/sarina';
import { DarkTheme, DefaultTheme, Slot, ThemeProvider, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { StartSplash } from '@/components/StartSplash/StartSplash';
import { AuthProvider, useAuth } from '@/context/AuthContext';

SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const { session, profile, isLoading } = useAuth();
  const segments = useSegments() as string[];
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments.length > 0 && segments[0] === ('(auth)' as any);
    
    if (!session) {
      if (!inAuthGroup) {
        router.replace('/(auth)/choose-account' as any);
      }
    } else if (profile) {
      // User is signed in and profile is loaded
      if (inAuthGroup || segments.length === 0) {
        if (profile.role === 'lgu') {
          router.replace('/(lgu)' as any);
        } else if (profile.role === 'merchant') {
          router.replace('/(merchant)' as any);
        } else {
          router.replace('/(beneficiary)' as any);
        }
      }
    }
  }, [session, profile, isLoading, segments]);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <StartSplash />
      <Slot />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    Sarina_400Regular,
  });

  if (!fontsLoaded) {
    return null;
  }

  return (
    <AuthProvider>
      <RootLayoutNav />
    </AuthProvider>
  );
}
