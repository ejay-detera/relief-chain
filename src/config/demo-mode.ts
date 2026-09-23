import Constants from 'expo-constants';

/**
 * Whether the app is running in demo mode, where payments and balances are
 * simulated locally instead of touching Stellar. This is gated on BOTH the
 * `EXPO_PUBLIC_DEMO_MODE` build-time flag AND `__DEV__` (a non-configurable
 * runtime constant baked in by the JS engine, `false` in any release/production
 * build produced via EAS Build/`expo run --variant release`). A leaked or
 * mis-set `EXPO_PUBLIC_DEMO_MODE=true` in a shipped `.env` can therefore never
 * cause a production or preview build to fabricate confirmed payments or
 * balances — it can only take effect in a local development client.
 *
 * If a real demo/showcase build is ever needed, gate it through a dedicated
 * EAS build profile with its own explicit review, not this flag.
 */
export const DEMO_MODE = __DEV__ && Constants.expoConfig?.extra?.EXPO_PUBLIC_DEMO_MODE === 'true';
