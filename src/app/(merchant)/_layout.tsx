import { Stack } from 'expo-router';

const MerchantLayout = () => (
  <Stack screenOptions={{ animation: 'none', headerShown: false }}>
    <Stack.Screen name="index" />
    <Stack.Screen name="receive" />
    <Stack.Screen name="profile" />
    <Stack.Screen name="programs" />
  </Stack>
);

export default MerchantLayout;
