import { FontAwesome } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BrandColors, Spacing } from '@/constants/theme';

type AccountType = 'lgu' | 'beneficiary' | 'merchant';

export default function ChooseAccountScreen() {
  const router = useRouter();

  const handleSelectRole = (role: AccountType) => {
    router.push({
      pathname: '/(auth)/sign-up' as any,
      params: { role },
    });
  };

  const handleMerchantRegistration = () => {
    router.push('/(auth)/sign-up' as any);
  };

  const handleScanId = () => {
    // TODO: Implement ID scanning flow
    router.push('/(auth)/sign-in' as any);
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <ThemedText style={styles.title}>Choose Account Type</ThemedText>

          <View style={styles.logoContainer}>
            <Image
              source={require('@/assets/public/Logo-Icon.svg')}
              style={styles.logo}
              contentFit="contain"
            />
          </View>

          <View style={styles.roleButtons}>
            <Pressable
              style={styles.roleButton}
              onPress={() => handleSelectRole('lgu')}
            >
              <ThemedText style={styles.roleButtonText}>Organization</ThemedText>
            </Pressable>

            <Pressable
              style={styles.roleButton}
              onPress={() => handleSelectRole('beneficiary')}
            >
              <ThemedText style={styles.roleButtonText}>Beneficiary</ThemedText>
            </Pressable>

            <Pressable
              style={styles.roleButton}
              onPress={handleMerchantRegistration}
            >
              <ThemedText style={styles.roleButtonText}>Merchant</ThemedText>
            </Pressable>
          </View>

          <View style={styles.dividerContainer}>
            <View style={styles.dividerLine} />
            <ThemedText style={styles.dividerText}>OR</ThemedText>
            <View style={styles.dividerLine} />
          </View>

          <Pressable style={styles.scanButton} onPress={handleScanId}>
            <FontAwesome name="id-card" size={18} color="white" />
            <ThemedText style={styles.scanButtonText}>Scan ID</ThemedText>
          </Pressable>

          <View style={styles.footer}>
            <ThemedText style={styles.footerText}>New Organization? </ThemedText>
            <Pressable onPress={() => handleSelectRole('lgu')}>
              <ThemedText style={styles.footerLink}>Register your agency</ThemedText>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  safeArea: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.six,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: BrandColors.navy,
    textAlign: 'center',
    marginBottom: Spacing.four,
  },
  logoContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.five,
  },
  logo: {
    width: 140,
    height: 140,
  },
  roleButtons: {
    width: '100%',
    gap: Spacing.three,
  },
  roleButton: {
    backgroundColor: 'rgba(3, 4, 94, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(151, 151, 151, 0.5)',
    borderRadius: 20,
    height: 45,
    justifyContent: 'center',
    alignItems: 'center',
  },
  roleButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: BrandColors.navy,
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginVertical: Spacing.four,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(151, 151, 151, 0.5)',
  },
  dividerText: {
    fontSize: 12,
    color: 'rgba(3, 4, 94, 0.6)',
    marginHorizontal: Spacing.three,
  },
  scanButton: {
    flexDirection: 'row',
    backgroundColor: BrandColors.green,
    borderWidth: 1,
    borderColor: 'rgba(151, 151, 151, 0.5)',
    borderRadius: 20,
    height: 45,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.two,
  },
  scanButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: 'white',
  },
  footer: {
    flexDirection: 'row',
    marginTop: Spacing.four,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 10,
    color: '#0D1282',
  },
  footerLink: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0D1282',
  },
});
