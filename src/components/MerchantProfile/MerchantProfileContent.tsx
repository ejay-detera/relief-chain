import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, View } from 'react-native';

import { LogoutButton } from '@/components/shared/LogoutButton';
import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';

type Props = {
  fullName: string;
  handle: string;
  businessName?: string | null;
  onEditPress?: () => void;
  children?: React.ReactNode;
};

export const MerchantProfileContent = ({
  fullName,
  handle,
  businessName,
  onEditPress,
  children,
}: Props) => {
  const primaryTitle = businessName || fullName;
  const showOwnerSubtitle = Boolean(businessName && businessName !== fullName);

  return (
    <>
      <View style={styles.hero}>
        <View style={styles.logoRow}>
          <Image contentFit="contain" source={require('@/assets/public/Logo.svg')} style={styles.logo} />
        </View>
        <View style={styles.avatar}>
          <MaterialCommunityIcons color={BrandColors.navy} name="storefront-outline" size={64} />
        </View>
        <ThemedText style={styles.name}>{primaryTitle}</ThemedText>
        {showOwnerSubtitle && (
          <ThemedText style={styles.ownerSubtitle}>Owner: {fullName}</ThemedText>
        )}
        <ThemedText style={styles.handle}>{handle}</ThemedText>

        {onEditPress && (
          <Pressable
            accessibilityLabel="Edit business profile"
            accessibilityRole="button"
            onPress={onEditPress}
            style={styles.editButton}
          >
            <MaterialCommunityIcons color={BrandColors.navy} name="pencil-outline" size={15} />
            <ThemedText style={styles.editButtonText}>Edit Business Profile</ThemedText>
          </Pressable>
        )}
      </View>

      <View style={styles.panel}>
        {children}
        <View style={styles.logout}>
          <LogoutButton />
        </View>
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  hero: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    minHeight: 310,
    paddingBottom: Spacing.four,
    paddingHorizontal: Spacing.four,
  },
  logoRow: {
    alignItems: 'flex-end',
    alignSelf: 'stretch',
  },
  logo: {
    height: 58,
    width: 104,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: BrandColors.lightGray,
    borderColor: BrandColors.green,
    borderRadius: 62,
    borderWidth: 4,
    height: 124,
    justifyContent: 'center',
    marginTop: Spacing.two,
    width: 124,
  },
  name: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 22,
    marginTop: Spacing.two,
    textAlign: 'center',
  },
  ownerSubtitle: {
    color: BrandColors.grey,
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 13,
    marginTop: 2,
    textAlign: 'center',
  },
  handle: {
    color: BrandColors.green,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 13,
    marginTop: 4,
  },
  editButton: {
    alignItems: 'center',
    backgroundColor: BrandColors.lightGray,
    borderColor: '#D3D9E2',
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    columnGap: 6,
    flexDirection: 'row',
    marginTop: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingVertical: 8,
  },
  editButtonText: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 13,
  },
  panel: {
    backgroundColor: '#FFFFFF',
    borderColor: BrandColors.lightGray,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    borderWidth: 1,
    elevation: 5,
    gap: Spacing.three,
    padding: Spacing.four,
    shadowColor: '#112E58',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
  },
  logout: {
    marginTop: Spacing.two,
  },
});
