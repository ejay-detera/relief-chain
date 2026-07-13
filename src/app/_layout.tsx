import 'react-native-get-random-values';
import { Buffer } from 'buffer';
if (typeof (globalThis as any).Buffer === 'undefined') (globalThis as any).Buffer = Buffer;

import { DarkTheme, DefaultTheme, ThemeProvider, Slot, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';
import { useFonts, PlusJakartaSans_400Regular, PlusJakartaSans_500Medium, PlusJakartaSans_600SemiBold, PlusJakartaSans_700Bold } from '@expo-google-fonts/plus-jakarta-sans';
import { Sarina_400Regular } from '@expo-google-fonts/sarina';
import { useEffect } from 'react';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
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
        router.replace('/(auth)/sign-in' as any);
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
      <AnimatedSplashOverlay />
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
