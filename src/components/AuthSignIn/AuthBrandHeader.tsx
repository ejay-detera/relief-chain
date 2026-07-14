import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BrandColors } from '@/constants/theme';

export function AuthBrandHeader() {
  return (
    <View style={styles.container}>
      <View style={styles.logoLockup}>
        <Image
          source={require('@/assets/public/Logo-Icon.svg')}
          style={styles.logo}
          contentFit="contain"
        />
        <View style={styles.wordmark}>
          <ThemedText style={styles.relief}>Relief</ThemedText>
          <ThemedText style={styles.chain}>Chain</ThemedText>
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
    marginRight: 12,
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
  chain: {
    color: BrandColors.green,
    fontFamily: 'Sarina_400Regular',
    fontSize: 34,
    lineHeight: 37,
    marginTop: -4,
    marginLeft: 18,
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
