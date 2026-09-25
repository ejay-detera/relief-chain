import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { NotificationBell } from '@/components/shared/NotificationBell';
import { NotificationsModal } from '@/components/shared/NotificationsModal';
import { ThemedText } from '@/components/themed-text';
import { BrandColors, Spacing } from '@/constants/theme';
import { useNotifications } from '@/hooks/use-notifications';

export const LogoHeader = () => {
  const { notifications, unreadCount, isLoading, error, markRead, markAllRead } = useNotifications();
  const [isModalVisible, setIsModalVisible] = useState(false);

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

      <NotificationBell onPress={() => setIsModalVisible(true)} unreadCount={unreadCount} />

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
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    marginHorizontal: Spacing.four,
    marginTop: Spacing.two,
    marginBottom: Spacing.three,
    backgroundColor: '#FAFAFC',
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
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
});
