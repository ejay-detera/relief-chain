import {
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    useFonts,
} from '@expo-google-fonts/plus-jakarta-sans';
import { Sarina_400Regular } from '@expo-google-fonts/sarina';
import { Buffer } from 'buffer';
import { DarkTheme, DefaultTheme, Slot, ThemeProvider, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import 'react-native-get-random-values';

import { ProfileAccessError } from '@/components/AuthSession/ProfileAccessError';
import { StartSplash } from '@/components/StartSplash/StartSplash';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { getRoleHome, isAuthContinuationRoute, isRoleGroupForRole } from '@/utils/auth-routing';

type RuntimeGlobal = typeof globalThis & { Buffer?: typeof Buffer };
const runtimeGlobal = globalThis as RuntimeGlobal;
if (typeof runtimeGlobal.Buffer === 'undefined') runtimeGlobal.Buffer = Buffer;

void SplashScreen.preventAutoHideAsync();

const RootLayoutNav = () => {
  const colorScheme = useColorScheme();
  const { session, profile, isLoading, profileError } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const [group, route] = segments;
    const inAuthGroup = group === '(auth)';

    if (!session) {
      if (!inAuthGroup) router.replace('/(auth)/choose-account');
      return;
    }

    if (profileError) return;
    if (!profile) return;
    if (inAuthGroup && isAuthContinuationRoute(route)) return;

    if (!isRoleGroupForRole(group, profile.role)) {
      router.replace(getRoleHome(profile.role));
    }
  }, [isLoading, profile, profileError, router, segments, session]);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <StartSplash />
      {session && profileError ? <ProfileAccessError /> : <Slot />}
    </ThemeProvider>
  );
};

const RootLayout = () => {
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    Sarina_400Regular,
  });

  if (!fontsLoaded) return null;

  return (
    <AuthProvider>
      <RootLayoutNav />
    </AuthProvider>
  );
};

export default RootLayout;
