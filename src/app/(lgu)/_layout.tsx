import { BrandColors, FloatingTabBarHeight } from '@/constants/theme';
import { FontAwesome } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CreateProgramProvider } from './create-program/_layout';

export default function LguLayout() {
  const insets = useSafeAreaInsets();

  return (
    <CreateProgramProvider>
      <View style={styles.rootContainer}>
        <Tabs
        backBehavior="history"
        screenOptions={{
          headerShown: false,
          tabBarStyle: [styles.tabBar, { bottom: insets.bottom }],
          tabBarItemStyle: styles.tabBarItem,
          tabBarIconStyle: styles.tabBarIconWrapper,
          tabBarShowLabel: false,
          tabBarActiveTintColor: 'white',
          tabBarInactiveTintColor: 'white',
        }}>
        <Tabs.Screen
          name="index"
          options={{
            title: 'Dashboard',
            tabBarIcon: ({ color, focused }) => (
              <View style={focused ? styles.activeIconContainer : styles.iconContainer}>
                <FontAwesome name="home" size={24} color={color} />
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="programs"
          options={{
            title: 'Programs',
            tabBarIcon: ({ color, focused }) => (
              <View style={focused ? styles.activeIconContainer : styles.iconContainer}>
                <FontAwesome name="handshake-o" size={24} color={color} />
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="pay-scan"
          options={{
            title: 'Disbursements',
            tabBarIcon: ({ color, focused }) => (
              <View style={focused ? styles.activeIconContainer : styles.iconContainer}>
                <FontAwesome name="history" size={24} color={color} />
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="beneficiaries"
          options={{
            title: 'Management',
            tabBarIcon: ({ color, focused }) => (
              <View style={focused ? styles.activeIconContainer : styles.iconContainer}>
                <FontAwesome name="users" size={24} color={color} />
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: 'Settings',
            tabBarIcon: ({ color, focused }) => (
              <View style={focused ? styles.activeIconContainer : styles.iconContainer}>
                <FontAwesome name="cog" size={24} color={color} />
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="explore"
          options={{
            href: null,
          }}
        />
        <Tabs.Screen
          name="create-program"
          options={{
            href: null,
            sceneStyle: { paddingTop: insets.top },
            tabBarStyle: { display: 'none' },
          }}
        />
        <Tabs.Screen
          name="edit-profile"
          options={{
            href: null,
            tabBarStyle: { display: 'none' },
          }}
        />
        <Tabs.Screen
          name="security"
          options={{
            href: null,
            tabBarStyle: { display: 'none' },
          }}
        />
        <Tabs.Screen
          name="program/[id]"
          options={{
            href: null,
            sceneStyle: { paddingTop: insets.top },
            tabBarStyle: { display: 'none' },
          }}
        />
        <Tabs.Screen
          name="reports"
          options={{
            href: null,
            tabBarStyle: { display: 'none' },
          }}
        />
        <Tabs.Screen
          name="audit-report"
          options={{
            href: null,
            tabBarStyle: { display: 'none' },
          }}
        />
        <Tabs.Screen
          name="transfer-funds"
          options={{
            href: null,
            tabBarStyle: { display: 'none' },
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
    </CreateProgramProvider>
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
  iconContainer: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  activeIconContainer: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: BrandColors.navy,
    borderRadius: 15,
  },
});
