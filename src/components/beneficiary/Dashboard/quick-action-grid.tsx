import { FontAwesome } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BrandColors, Spacing } from '@/constants/theme';

type QuickAction = {
  id: string;
  label: string;
  onPress: () => void;
} & (
  | { iconName: React.ComponentProps<typeof FontAwesome>['name']; iconSource?: never }
  | { iconName?: never; iconSource: string }
);

type Props = {
  onShowQr: () => void;
  onFindMerchant: () => void;
  onMyAssistance: () => void;
  onProfile: () => void;
};

export function QuickActionGrid({ onShowQr, onFindMerchant, onMyAssistance, onProfile }: Props) {
  const actions: QuickAction[] = [
    { id: 'show-qr', label: 'Show my QR', iconName: 'qrcode', onPress: onShowQr },
    { id: 'find-merchant', label: 'Find Merchant', iconSource: require('@/assets/public/findorganization-icon.png'), onPress: onFindMerchant },
    { id: 'my-assistance', label: 'My Assistance', iconSource: require('@/assets/public/myassistance-icon.png'), onPress: onMyAssistance },
    { id: 'profile', label: 'Profile', iconName: 'user', onPress: onProfile },
  ];

  return (
    <View style={styles.grid}>
      {actions.map((action) => (
        <Pressable key={action.id} onPress={action.onPress} style={styles.card}>
          <View style={styles.iconCircle}>
            {action.iconSource ? (
              <Image contentFit="contain" source={action.iconSource} style={styles.icon} tintColor="white" />
            ) : (
              <FontAwesome color="white" name={action.iconName} size={22} />
            )}
          </View>
          <ThemedText style={styles.label}>{action.label}</ThemedText>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: Spacing.four,
    columnGap: Spacing.three,
    rowGap: Spacing.three,
    marginBottom: Spacing.five,
  },
  card: {
    backgroundColor: 'white',
    width: '47%',
    minHeight: 120,
    borderRadius: 10,
    padding: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 15,
    elevation: 3,
    borderWidth: 1,
    borderColor: 'rgba(151, 151, 151, 0.2)',
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: BrandColors.navy,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
  },
  icon: {
    width: 24,
    height: 24,
  },
  label: {
    color: BrandColors.navy,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
});
