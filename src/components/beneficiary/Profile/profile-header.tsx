import { StyleSheet, View } from 'react-native';

import { UserAvatar } from '@/components/shared/UserAvatar';
import { ThemedText } from '@/components/themed-text';
import { BrandColors, Spacing } from '@/constants/theme';

type Props = {
  fullName: string | null;
  userId?: string | null;
  avatarPreset?: string | null;
};

const toHandle = (fullName: string | null): string => {
  if (!fullName) return '@beneficiary';
  const slug = fullName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
  return `@${slug || 'beneficiary'}`;
};

export function ProfileHeader({ fullName, userId, avatarPreset }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.avatarWrap}>
        <UserAvatar
          avatarPreset={avatarPreset}
          borderColor={BrandColors.green}
          borderWidth={3}
          id={userId}
          name={fullName}
          role="beneficiary"
          showBorder
          size={88}
        />
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
  avatarWrap: {
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
