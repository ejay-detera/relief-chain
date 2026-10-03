import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useMemo } from 'react';
import {
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import {
  AVATAR_PRESETS,
  type AvatarPreset,
  type AvatarRole,
  getDefaultAvatarForUser,
} from '@/utils/avatar-presets';

export type { AvatarPreset, AvatarRole };
export { AVATAR_PRESETS, getDefaultAvatarForUser };

export type UserAvatarProps = {
  role?: AvatarRole;
  name?: string | null;
  id?: string | null;
  avatarPreset?: string | null;
  size?: number;
  showBorder?: boolean;
  borderColor?: string;
  borderWidth?: number;
  style?: StyleProp<ViewStyle>;
};

export const UserAvatar = ({
  role = 'beneficiary',
  name,
  id,
  avatarPreset,
  size = 64,
  showBorder = false,
  borderColor = BrandColors.green,
  borderWidth = 3,
  style,
}: UserAvatarProps) => {
  const identifier = id || name || role;
  const preset = useMemo(
    () => getDefaultAvatarForUser(role, identifier, avatarPreset),
    [role, identifier, avatarPreset],
  );

  const iconSize = Math.round(size * 0.52);
  const borderRadius = Math.round(size / 2);

  return (
    <View
      accessibilityLabel={`${preset.name} avatar`}
      accessibilityRole="image"
      style={[
        styles.avatarBase,
        {
          width: size,
          height: size,
          borderRadius,
          backgroundColor: preset.backgroundColor,
        },
        showBorder && {
          borderColor,
          borderWidth,
        },
        style,
      ]}
    >
      <MaterialCommunityIcons
        color={preset.iconColor}
        name={preset.iconName as React.ComponentProps<typeof MaterialCommunityIcons>['name']}
        size={iconSize}
      />
    </View>
  );
};

export type AvatarPresetSelectorProps = {
  role: AvatarRole;
  selectedPresetId?: string | null;
  onSelectPreset: (presetId: string) => void;
  userIdentifier?: string | null;
};

export const AvatarPresetSelector = ({
  role,
  selectedPresetId,
  onSelectPreset,
  userIdentifier,
}: AvatarPresetSelectorProps) => {
  const rolePresets = useMemo(() => AVATAR_PRESETS.filter((p) => p.role === role), [role]);
  const defaultFallback = useMemo(
    () => getDefaultAvatarForUser(role, userIdentifier),
    [role, userIdentifier],
  );
  const activeId = selectedPresetId || defaultFallback.id;

  return (
    <ScrollView
      contentContainerStyle={styles.selectorContent}
      horizontal
      showsHorizontalScrollIndicator={false}
    >
      {rolePresets.map((preset) => {
        const isSelected = activeId === preset.id;
        return (
          <Pressable
            accessibilityLabel={`Select ${preset.name} avatar`}
            accessibilityRole="button"
            key={preset.id}
            onPress={() => onSelectPreset(preset.id)}
            style={[styles.presetOption, isSelected && styles.presetOptionSelected]}
          >
            <View
              style={[
                styles.presetCircle,
                { backgroundColor: preset.backgroundColor },
                isSelected && { borderColor: preset.accentColor, borderWidth: 2 },
              ]}
            >
              <MaterialCommunityIcons
                color={preset.iconColor}
                name={preset.iconName as React.ComponentProps<typeof MaterialCommunityIcons>['name']}
                size={28}
              />
              {isSelected && (
                <View style={[styles.checkBadge, { backgroundColor: preset.accentColor }]}>
                  <MaterialCommunityIcons color="#FFFFFF" name="check" size={10} />
                </View>
              )}
            </View>
            <ThemedText numberOfLines={1} style={[styles.presetName, isSelected && styles.presetNameSelected]}>
              {preset.name}
            </ThemedText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  avatarBase: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  selectorContent: {
    columnGap: Spacing.three,
    paddingVertical: Spacing.two,
  },
  presetOption: {
    alignItems: 'center',
    borderRadius: BorderRadius.md,
    padding: 4,
    width: 76,
  },
  presetOptionSelected: {
    backgroundColor: '#F0F4F8',
  },
  presetCircle: {
    alignItems: 'center',
    borderRadius: 26,
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  checkBadge: {
    alignItems: 'center',
    borderRadius: BorderRadius.full,
    bottom: -2,
    height: 16,
    justifyContent: 'center',
    position: 'absolute',
    right: -2,
    width: 16,
  },
  presetName: {
    color: BrandColors.grey,
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 10,
    marginTop: 4,
    textAlign: 'center',
  },
  presetNameSelected: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_700Bold',
  },
});
