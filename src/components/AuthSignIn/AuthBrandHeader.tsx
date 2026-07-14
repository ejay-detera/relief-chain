import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BrandColors } from '@/constants/theme';

type AuthBrandHeaderProps = {
  logoSize?: 'default' | 'large';
};

export function AuthBrandHeader({ logoSize = 'default' }: AuthBrandHeaderProps) {
  const isLarge = logoSize === 'large';

  return (
    <View style={styles.container}>
      <View style={styles.logoLockup}>
        <Image
          source={require('@/assets/public/Logo-Icon.svg')}
          style={[styles.logo, isLarge && styles.logoLarge]}
          contentFit="contain"
        />
        <View style={styles.wordmark}>
          <ThemedText style={[styles.relief, isLarge && styles.reliefLarge]}>Relief</ThemedText>
          <ThemedText style={[styles.chain, isLarge && styles.chainLarge]}>Chain</ThemedText>
        </View>
      </View>
      <ThemedText style={styles.tagline}>
        Delivering Aid with Speed, Transparency, and Trust.
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingTop: 96,
  },
  logoLockup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logo: {
    width: 92,
    height: 71,
    marginRight: 10,
  },
  logoLarge: {
    width: 120,
    height: 130,
    marginRight: 5,
  },
  wordmark: {
    justifyContent: 'center',
  },
  relief: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 36,
    lineHeight: 39,
  },
  reliefLarge: {
    fontSize: 42,
    lineHeight: 45,
  },
  chain: {
    color: BrandColors.green,
    fontFamily: 'Sarina_400Regular',
    fontSize: 34,
    lineHeight: 37,
    marginTop: -4,
    marginLeft: 18,
  },
  chainLarge: {
    fontSize: 40,
    lineHeight: 43,
    marginTop: -5,
    marginLeft: 20,
  },
  tagline: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 22,
    textAlign: 'center',
  },
});
