import { BrandColors, FloatingTabBarGap, FloatingTabBarHeight } from '@/constants/theme';
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
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: [styles.tabBar, { bottom: insets.bottom + FloatingTabBarGap }],
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
          title: 'Find Organization',
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
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: BrandColors.green,
    borderRadius: 30,
    left: 16,
    right: 16,
    height: FloatingTabBarHeight,
    paddingHorizontal: 6,
    paddingTop: 0,
    paddingBottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    position: 'absolute',
    borderTopWidth: 0,
    elevation: 0,
    shadowOpacity: 0,
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
