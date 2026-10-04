import { BrandColors, FloatingTabBarHeight } from '@/constants/theme';
import { Image } from 'expo-image';
import { Tabs } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type TabIconProps = {
  focused: boolean;
  source: string;
};

const TabIcon = ({ focused, source }: TabIconProps) => (
  <View style={focused ? styles.activeIconContainer : styles.iconContainer}>
    <Image contentFit="contain" source={source} style={styles.icon} tintColor="white" />
  </View>
);

export default function BeneficiaryLayout() {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.rootContainer}>
      <Tabs
      backBehavior="history"
      screenOptions={{
        headerShown: false,
        tabBarStyle: [styles.tabBar, { bottom: insets.bottom }],
        tabBarItemStyle: styles.tabBarItem,
        tabBarIconStyle: styles.tabBarIconWrapper,
        tabBarShowLabel: false,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} source={require('@/assets/public/dashboard-icon.png')} />
          ),
        }}
      />
      <Tabs.Screen
        name="my-assistance"
        options={{
          title: 'My Assistance',
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} source={require('@/assets/public/myassistance-icon.png')} />
          ),
        }}
      />
      <Tabs.Screen
        name="pay-scan"
        options={{
          title: 'Pay / Scan',
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} source={require('@/assets/public/qr-scan-icon.png')} />
          ),
        }}
      />
      <Tabs.Screen
        name="find-organization"
        options={{
          title: 'Find Organization Programs',
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} source={require('@/assets/public/findorganization-icon.png')} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} source={require('@/assets/public/profile-icon.png')} />
          ),
        }}
      />
      <Tabs.Screen
        name="transactions"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="wallet-recovery"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="application-status"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="submit-appeal"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="my-appeals"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="apply-program"
        options={{
          href: null,
        }}
      />
    </Tabs>
    {insets.bottom > 0 && (
      <View
        pointerEvents="none"
        style={[styles.bottomSystemFill, { height: insets.bottom }]}
      />
    )}
    </View>
  );
}

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  bottomSystemFill: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
  },
  tabBar: {
    backgroundColor: BrandColors.green,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    left: 0,
    right: 0,
    height: FloatingTabBarHeight,
    paddingHorizontal: 6,
    paddingTop: 0,
    paddingBottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    position: 'absolute',
    borderTopWidth: 0,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    overflow: 'hidden',
  },
  tabBarItem: {
    height: 60,
    minHeight: 60,
    paddingVertical: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabBarIconWrapper: {
    marginTop: 0,
    marginBottom: 0,
    height: 40,
    width: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  icon: {
    width: 22,
    height: 22,
  },
  iconContainer: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  activeIconContainer: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: BrandColors.navy,
    borderRadius: 14,
  },
});
