// app.config.js
// Expo configuration with environment variable support
// Note: Expo automatically loads .env files, so we don't need dotenv

module.exports = {
  expo: {
    name: 'relief-chain',
    slug: 'relief-chain',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/images/icon.png',
    scheme: 'reliefchain',
    userInterfaceStyle: 'automatic',
    ios: {
      icon: './assets/expo.icon',
    },
    android: {
      adaptiveIcon: {
        backgroundColor: '#E6F4FE',
        foregroundImage: './assets/images/android-icon-foreground.png',
        backgroundImage: './assets/images/android-icon-background.png',
        monochromeImage: './assets/images/android-icon-monochrome.png',
      },
      predictiveBackGestureEnabled: false,
      permissions: [
        'android.permission.CAMERA',
        'android.permission.RECORD_AUDIO',
      ],
      package: 'com.reliefchain.app',
    },
    web: {
      output: 'static',
      favicon: './assets/images/favicon.png',
    },
    plugins: [
      'expo-router',
      [
        'expo-splash-screen',
        {
          backgroundColor: '#208AEF',
          image: './assets/images/splash-icon.png',
          imageWidth: 76,
        },
      ],
      'expo-secure-store',
      '@react-native-community/datetimepicker',
      [
        'expo-camera',
        {
          cameraPermission:
            'Relief Chain uses your camera to scan beneficiary QR codes for voucher redemption.',
        },
      ],
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
    extra: {
      // EAS project configuration
      eas: {
        projectId: 'e556fe79-19e7-4cda-9261-3397d4db374d',
      },
      // Expose EXPO_PUBLIC_* environment variables to Constants.expoConfig.extra
      EXPO_PUBLIC_DEMO_MODE: process.env.EXPO_PUBLIC_DEMO_MODE || 'false',
      EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
      EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
      EXPO_PUBLIC_STELLAR_NETWORK: process.env.EXPO_PUBLIC_STELLAR_NETWORK,
      EXPO_PUBLIC_STELLAR_NETWORK_PASSPHRASE: process.env.EXPO_PUBLIC_STELLAR_NETWORK_PASSPHRASE,
      EXPO_PUBLIC_STELLAR_HORIZON_URL: process.env.EXPO_PUBLIC_STELLAR_HORIZON_URL,
      EXPO_PUBLIC_STELLAR_RPC_URL: process.env.EXPO_PUBLIC_STELLAR_RPC_URL,
      EXPO_PUBLIC_STELLAR_MAINNET_ENABLED: process.env.EXPO_PUBLIC_STELLAR_MAINNET_ENABLED,
      EXPO_PUBLIC_STELLAR_RCPHP_ISSUER: process.env.EXPO_PUBLIC_STELLAR_RCPHP_ISSUER,
      EXPO_PUBLIC_STELLAR_RCPHP_SAC_ID: process.env.EXPO_PUBLIC_STELLAR_RCPHP_SAC_ID,
    },
  },
};
