import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { NotificationsModal } from '@/components/shared/NotificationsModal';
import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import { useNotifications } from '@/hooks/use-notifications';

type MerchantDashboardHeaderProps = {
  onShowQr: () => void;
};

export const MerchantDashboardHeader = ({ onShowQr }: MerchantDashboardHeaderProps) => {
  const { notifications, unreadCount, isLoading, error, markRead, markAllRead } = useNotifications();
  const [isModalVisible, setIsModalVisible] = useState(false);
  const unreadLabel = unreadCount > 9 ? '9+' : String(unreadCount);

  return (
    <View style={styles.header}>
      <Image contentFit="contain" source={require('@/assets/images/logo-glow.png')} style={styles.logo} />
      <View style={styles.wordmark}>
        <ThemedText style={styles.relief}>Relief</ThemedText>
        <ThemedText style={styles.chain}>Chain</ThemedText>
      </View>
      <View style={styles.rightActions}>
        <Pressable accessibilityLabel="Show QR code" accessibilityRole="button" hitSlop={8} onPress={onShowQr} style={styles.qrAction}>
          <MaterialCommunityIcons color={BrandColors.navy} name="qrcode" size={22} />
        </Pressable>
        <Pressable
          accessibilityLabel={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => setIsModalVisible(true)}
          style={styles.notification}
        >
          <MaterialCommunityIcons color="#FFFFFF" name="bell-outline" size={22} />
          {unreadCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unreadLabel}</Text>
            </View>
          )}
        </Pressable>
      </View>

      <NotificationsModal
        error={error}
        isLoading={isLoading}
        notifications={notifications}
        onClose={() => setIsModalVisible(false)}
        onMarkAllRead={() => void markAllRead()}
        onMarkRead={(id) => void markRead(id)}
        visible={isModalVisible}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  header: { alignItems: 'center', backgroundColor: '#F7F7F7', flexDirection: 'row', height: 58, paddingHorizontal: Spacing.three, shadowColor: '#000000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.18, shadowRadius: 4, elevation: 4 },
  logo: { height: 38, width: 38 },
  wordmark: { marginLeft: Spacing.two },
  relief: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 15, lineHeight: 17 },
  chain: { color: BrandColors.green, fontFamily: 'Sarina_400Regular', fontSize: 15, lineHeight: 18, marginLeft: Spacing.two },
  rightActions: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  qrAction: { alignItems: 'center', justifyContent: 'center', height: 32, width: 34 },
  notification: { alignItems: 'center', backgroundColor: BrandColors.navy, borderRadius: BorderRadius.md, height: 32, justifyContent: 'center', width: 34 },
  badge: {
    alignItems: 'center',
    backgroundColor: '#D32F2F',
    borderRadius: BorderRadius.full,
    borderWidth: 1.5,
    borderColor: '#F7F7F7',
    height: 17,
    justifyContent: 'center',
    minWidth: 17,
    paddingHorizontal: 3,
    position: 'absolute',
    right: -4,
    top: -4,
  },
  badgeText: { color: '#FFFFFF', fontFamily: 'PlusJakartaSans_700Bold', fontSize: 9 },
});
