import { FontAwesome } from '@expo/vector-icons';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import type { AppNotification, NotificationType } from '@/types/notification';

type Props = Readonly<{
  visible: boolean;
  onClose: () => void;
  notifications: readonly AppNotification[];
  isLoading: boolean;
  error: string | null;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
}>;

const ICON_FOR_TYPE: Record<NotificationType, keyof typeof FontAwesome.glyphMap> = {
  application_submitted: 'paper-plane',
  application_approved: 'check-circle',
  application_rejected: 'times-circle',
  new_applicant: 'user-plus',
  merchant_payment_received: 'money',
};

const COLOR_FOR_TYPE: Record<NotificationType, string> = {
  application_submitted: BrandColors.navy,
  application_approved: BrandColors.green,
  application_rejected: '#D32F2F',
  new_applicant: BrandColors.navy,
  merchant_payment_received: BrandColors.green,
};

const timeAgo = (isoDate: string): string => {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

/**
 * Shared notification list, presented as a bottom-sheet-style modal from any
 * role's dashboard bell icon. Tapping a row marks it read; "Mark all read" is
 * only shown when there is at least one unread notification.
 */
export function NotificationsModal({
  visible,
  onClose,
  notifications,
  isLoading,
  error,
  onMarkRead,
  onMarkAllRead,
}: Props) {
  const hasUnread = notifications.some((n) => !n.isRead);

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <ThemedText style={styles.title}>Notifications</ThemedText>
            <View style={styles.headerActions}>
              {hasUnread && (
                <Pressable accessibilityRole="button" onPress={onMarkAllRead} style={styles.markAllButton}>
                  <ThemedText style={styles.markAllText}>Mark all read</ThemedText>
                </Pressable>
              )}
              <Pressable accessibilityLabel="Close notifications" accessibilityRole="button" hitSlop={8} onPress={onClose}>
                <FontAwesome color={BrandColors.navy} name="close" size={20} />
              </Pressable>
            </View>
          </View>

          {isLoading && notifications.length === 0 ? (
            <View style={styles.centered}>
              <ActivityIndicator color={BrandColors.navy} />
            </View>
          ) : error ? (
            <View style={styles.centered}>
              <ThemedText style={styles.errorText}>{error}</ThemedText>
            </View>
          ) : notifications.length === 0 ? (
            <View style={styles.centered}>
              <FontAwesome color={BrandColors.lightGray} name="bell-slash-o" size={32} style={styles.emptyIcon} />
              <ThemedText style={styles.emptyText}>No notifications yet.</ThemedText>
            </View>
          ) : (
            <FlatList
              data={notifications}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => onMarkRead(item.id)}
                  style={[styles.row, !item.isRead && styles.rowUnread]}
                >
                  <View style={[styles.iconCircle, { backgroundColor: `${COLOR_FOR_TYPE[item.type]}1A` }]}>
                    <FontAwesome color={COLOR_FOR_TYPE[item.type]} name={ICON_FOR_TYPE[item.type]} size={16} />
                  </View>
                  <View style={styles.rowBody}>
                    <ThemedText style={styles.rowTitle}>{item.title}</ThemedText>
                    <ThemedText style={styles.rowText}>{item.body}</ThemedText>
                    <ThemedText style={styles.rowTime}>{timeAgo(item.createdAt)}</ThemedText>
                  </View>
                  {!item.isRead && <View style={styles.unreadDot} />}
                </Pressable>
              )}
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: 'white',
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    maxHeight: '75%',
    paddingTop: Spacing.four,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: Spacing.three,
    paddingHorizontal: Spacing.four,
  },
  headerActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.three,
  },
  title: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 18,
  },
  markAllButton: {
    paddingVertical: 2,
  },
  markAllText: {
    color: BrandColors.green,
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 12,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.six,
  },
  emptyIcon: {
    marginBottom: Spacing.two,
  },
  emptyText: {
    color: BrandColors.grey,
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 13,
  },
  errorText: {
    color: '#D32F2F',
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 13,
    paddingHorizontal: Spacing.four,
    textAlign: 'center',
  },
  listContent: {
    paddingBottom: Spacing.six,
    paddingHorizontal: Spacing.four,
  },
  row: {
    alignItems: 'flex-start',
    borderBottomColor: BrandColors.lightGray,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
  },
  rowUnread: {
    backgroundColor: '#F9FBFF',
  },
  iconCircle: {
    alignItems: 'center',
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  rowBody: {
    flex: 1,
  },
  rowTitle: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 14,
  },
  rowText: {
    color: BrandColors.grey,
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 13,
    marginTop: 2,
  },
  rowTime: {
    color: BrandColors.grey,
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 11,
    marginTop: 4,
  },
  unreadDot: {
    backgroundColor: BrandColors.green,
    borderRadius: 4,
    height: 8,
    marginTop: 6,
    width: 8,
  },
});
