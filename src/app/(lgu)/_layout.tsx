import { BrandColors } from '@/constants/theme';
import { FontAwesome } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { CreateProgramProvider } from './create-program/_layout';

export default function LguLayout() {
  return (
    <CreateProgramProvider>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: styles.tabBar,
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
            title: 'Pay / Scan',
            tabBarIcon: ({ color, focused }) => (
              <View style={focused ? styles.activeIconContainer : styles.iconContainer}>
                <FontAwesome name="qrcode" size={24} color={color} />
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="beneficiaries"
          options={{
            title: 'Beneficiaries',
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
          name="reports"
          options={{
            href: null,
          }}
        />
        <Tabs.Screen
          name="create-program"
          options={{
            href: null,
            tabBarStyle: { display: 'none' },
          }}
        />
        <Tabs.Screen
          name="program/[id]"
          options={{
            href: null,
            tabBarStyle: { display: 'none' },
          }}
        />
      </Tabs>
    </CreateProgramProvider>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: BrandColors.green,
    borderRadius: 30,
    marginHorizontal: 16,
    marginBottom: 20,
    height: 60,
    position: 'absolute',
    borderTopWidth: 0,
    elevation: 0,
    shadowOpacity: 0,
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
