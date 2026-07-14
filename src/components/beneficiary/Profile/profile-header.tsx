import { FontAwesome } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BrandColors, Spacing } from '@/constants/theme';

type Props = {
  fullName: string | null;
};

const toHandle = (fullName: string | null): string => {
  if (!fullName) return '@beneficiary';
  const slug = fullName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
  return `@${slug || 'beneficiary'}`;
};

export function ProfileHeader({ fullName }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.avatarPlaceholder}>
        <FontAwesome color={BrandColors.grey} name="user" size={44} />
      </View>
      <ThemedText style={styles.name}>{fullName || 'Loading...'}</ThemedText>
      <ThemedText style={styles.handle}>{toHandle(fullName)}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    marginBottom: Spacing.five,
  },
  avatarPlaceholder: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: BrandColors.lightGray,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.three,
  },
  name: {
    fontSize: 18,
    fontWeight: '700',
    color: BrandColors.navy,
  },
  handle: {
    fontSize: 13,
    color: BrandColors.green,
    fontWeight: '600',
    marginTop: 2,
  },
});
