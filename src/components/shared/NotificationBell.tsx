import { FontAwesome } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BorderRadius, BrandColors } from '@/constants/theme';

type Props = Readonly<{
  unreadCount: number;
  onPress: () => void;
  /** Icon color; defaults to white for use on the navy dashboard header pill. */
  iconColor?: string;
  size?: number;
}>;

/**
 * Bell icon with an unread-count badge. Purely presentational — the caller
 * owns the notifications list/modal and passes `unreadCount` from
 * `useNotifications()`.
 */
export function NotificationBell({ unreadCount, onPress, iconColor = 'white', size = 20 }: Props) {
  const hasUnread = unreadCount > 0;
  const label = unreadCount > 9 ? '9+' : String(unreadCount);

  return (
    <Pressable
      accessibilityLabel={hasUnread ? `Notifications, ${unreadCount} unread` : 'Notifications'}
      accessibilityRole="button"
      hitSlop={8}
      onPress={onPress}
      style={styles.button}
    >
      <FontAwesome color={iconColor} name="bell" size={size} />
      {hasUnread && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    backgroundColor: BrandColors.navy,
    borderRadius: BorderRadius.md,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  badge: {
    alignItems: 'center',
    backgroundColor: '#D32F2F',
    borderRadius: BorderRadius.full,
    borderWidth: 1.5,
    borderColor: 'white',
    justifyContent: 'center',
    minWidth: 18,
    height: 18,
    paddingHorizontal: 3,
    position: 'absolute',
    right: -4,
    top: -4,
  },
  badgeText: {
    color: 'white',
    fontSize: 10,
    fontFamily: 'PlusJakartaSans_700Bold',
  },
});
