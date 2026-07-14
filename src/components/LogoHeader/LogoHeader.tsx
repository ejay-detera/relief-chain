import { FontAwesome } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BrandColors, Spacing } from '@/constants/theme';

export const LogoHeader = () => {
  return (
    <View style={styles.container}>
      <View style={styles.logoContainer}>
        <Image
          source={require('@/assets/public/Logo-Icon.svg')}
          style={styles.logoImage}
          contentFit="contain"
        />
        <View style={styles.textContainer}>
          <ThemedText type="default" style={styles.reliefText}>
            Relief
          </ThemedText>
          <ThemedText style={styles.chainText}>Chain</ThemedText>
        </View>
      </View>
      
      <Pressable style={styles.notificationButton}>
        <FontAwesome name="bell" size={20} color="white" />
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.two,
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoImage: {
    width: 44,
    height: 44,
    marginRight: Spacing.two,
  },
  textContainer: {
    justifyContent: 'center',
  },
  reliefText: {
    fontSize: 18,
    color: BrandColors.navy,
    fontWeight: '700',
    lineHeight: 22,
  },
  chainText: {
    fontSize: 18,
    color: BrandColors.green,
    fontFamily: 'Sarina_400Regular',
    lineHeight: 22,
  },
  notificationButton: {
    backgroundColor: BrandColors.navy,
    width: 36,
    height: 36,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
