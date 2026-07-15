import { BrandColors } from '@/constants/theme';
import { FontAwesome } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { StyleSheet, View } from 'react-native';

const MerchantLayout = () => (
  <Tabs
    screenOptions={{
      headerShown: false,
      tabBarStyle: styles.tabBar,
      tabBarItemStyle: styles.tabBarItem,
      tabBarIconStyle: styles.tabBarIconWrapper,
      tabBarShowLabel: false,
      tabBarActiveTintColor: 'white',
      tabBarInactiveTintColor: 'white',
    }}>
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
  </Tabs>
);

export default MerchantLayout;

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: BrandColors.green,
    borderRadius: 30,
    left: 16,
    right: 16,
    bottom: 20,
    height: 60,
    paddingHorizontal: 6,
    paddingTop: 0,
    paddingBottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
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
