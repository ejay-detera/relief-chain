import { Tabs } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import { View, StyleSheet } from 'react-native';

import { BrandColors } from '@/constants/theme';

export default function AppTabs() {
  return (
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
          title: 'Home',
          tabBarIcon: ({ color, focused }) => (
            <View style={focused ? styles.activeIconContainer : styles.iconContainer}>
              <FontAwesome name="home" size={24} color={color} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="aid"
        options={{
          title: 'Aid',
          tabBarIcon: ({ color, focused }) => (
            <View style={focused ? styles.activeIconContainer : styles.iconContainer}>
              <FontAwesome name="handshake-o" size={24} color={color} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="distribute"
        options={{
          title: 'Distribute',
          tabBarIcon: ({ color, focused }) => (
            <View style={focused ? styles.activeIconContainer : styles.iconContainer}>
              <FontAwesome name="qrcode" size={24} color={color} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: 'Search',
          tabBarIcon: ({ color, focused }) => (
            <View style={focused ? styles.activeIconContainer : styles.iconContainer}>
              <FontAwesome name="search" size={24} color={color} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => (
            <View style={focused ? styles.activeIconContainer : styles.iconContainer}>
              <FontAwesome name="user" size={24} color={color} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          href: null, // Hide explore tab
        }}
      />
    </Tabs>
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
