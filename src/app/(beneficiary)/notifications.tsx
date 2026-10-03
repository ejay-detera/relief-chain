import { FontAwesome } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LogoHeader } from '@/components/LogoHeader/LogoHeader';
import { EmptyState } from '@/components/shared/empty-state';
import { FadeInView } from '@/components/shared/FadeInView';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BorderRadius, BottomTabInset, BrandColors, MaxContentWidth, Spacing } from '@/constants/theme';
import { useNotifications } from '@/hooks/use-notifications';
import type { AppNotification, NotificationType } from '@/types/notification';

const ICON_FOR_TYPE: Record<NotificationType, keyof typeof FontAwesome.glyphMap> = {
  application_submitted: 'paper-plane',
  application_approved: 'check-circle',
  application_rejected: 'times-circle',
  new_applicant: 'user-plus',
  merchant_payment_received: 'money',
  aid_released: 'gift',
  appeal_submitted: 'gavel',
  appeal_decision: 'balance-scale',
  redemption_confirmed: 'shopping-cart',
  added_to_program_list: 'list-ul',
};

const COLOR_FOR_TYPE: Record<NotificationType, string> = {
  application_submitted: BrandColors.navy,
  application_approved: BrandColors.green,
  application_rejected: '#D32F2F',
  new_applicant: BrandColors.navy,
  merchant_payment_received: BrandColors.green,
  aid_released: BrandColors.green,
  appeal_submitted: '#D97706',
  appeal_decision: BrandColors.navy,
  redemption_confirmed: BrandColors.green,
  added_to_program_list: BrandColors.navy,
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

export default function NotificationsScreen() {
  const router = useRouter();
  const { notifications, isLoading, refresh, markRead, markAllRead } = useNotifications();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const hasUnread = notifications.some((n) => !n.isRead);

  const renderItem = ({ item }: { item: AppNotification }) => {
    const iconName = ICON_FOR_TYPE[item.type] ?? 'bell';
    const iconColor = COLOR_FOR_TYPE[item.type] ?? BrandColors.navy;

    return (
      <Pressable
        onPress={() => {
          if (!item.isRead) {
            void markRead(item.id);
          }
        }}
        style={[styles.notificationCard, !item.isRead && styles.unreadCard]}
      >
        <View style={[styles.iconWrapper, { backgroundColor: `${iconColor}15` }]}>
          <FontAwesome name={iconName} size={18} color={iconColor} />
        </View>

        <View style={styles.textContainer}>
          <View style={styles.headerLine}>
            <ThemedText style={styles.titleText}>{item.title}</ThemedText>
            <ThemedText style={styles.timeText}>{timeAgo(item.createdAt)}</ThemedText>
          </View>
          <ThemedText style={styles.bodyText}>{item.body}</ThemedText>
        </View>

        {!item.isRead && <View style={styles.unreadDot} />}
      </Pressable>
    );
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
        <LogoHeader />

        <View style={styles.navBar}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <FontAwesome name="arrow-left" size={16} color={BrandColors.navy} />
          </Pressable>
          <ThemedText style={styles.screenTitle}>Notifications</ThemedText>
          {hasUnread ? (
            <Pressable onPress={() => void markAllRead()} style={styles.markAllButton}>
              <ThemedText style={styles.markAllText}>Mark all read</ThemedText>
            </Pressable>
          ) : (
            <View style={styles.placeholder} />
          )}
        </View>

        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[BrandColors.navy]}
              tintColor={BrandColors.navy}
            />
          }
          ListEmptyComponent={
            !isLoading ? (
              <FadeInView delay={50}>
                <EmptyState
                  title="No Notifications"
                  description="You are completely up to date!"
                />
              </FadeInView>
            ) : null
          }
        />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFC',
  },
  safeArea: {
    flex: 1,
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    width: '100%',
  },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    marginBottom: Spacing.three,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  },
  screenTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: BrandColors.navy,
  },
  markAllButton: {
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  markAllText: {
    fontSize: 12,
    fontWeight: '600',
    color: BrandColors.green,
  },
  placeholder: {
    width: 36,
  },
  listContent: {
    paddingHorizontal: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.six,
  },
  notificationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: BorderRadius.lg,
    padding: Spacing.three,
    marginBottom: Spacing.two,
    boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
  },
  unreadCard: {
    backgroundColor: '#F0FDF4',
    borderLeftWidth: 3,
    borderLeftColor: BrandColors.green,
  },
  iconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.three,
  },
  textContainer: {
    flex: 1,
  },
  headerLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  titleText: {
    fontSize: 14,
    fontWeight: '700',
    color: BrandColors.navy,
  },
  timeText: {
    fontSize: 11,
    color: BrandColors.grey,
  },
  bodyText: {
    fontSize: 12,
    color: '#4A5568',
    lineHeight: 16,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: BrandColors.green,
    marginLeft: Spacing.two,
  },
});
