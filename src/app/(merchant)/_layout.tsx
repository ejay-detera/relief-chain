import { Stack } from 'expo-router';

const MerchantLayout = () => (
  <Stack screenOptions={{ headerShown: false }}>
    <Stack.Screen name="profile" />
  </Stack>
);

export default MerchantLayout;
