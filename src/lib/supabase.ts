import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import 'react-native-url-polyfill/auto';

const ExpoSecureStoreAdapter = {
  getItem: (key: string) => {
    return SecureStore.getItemAsync(key);
  },
  setItem: (key: string, value: string) => {
    SecureStore.setItemAsync(key, value);
  },
  removeItem: (key: string) => {
    SecureStore.deleteItemAsync(key);
  },
};

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
const usesPlaceholderCredentials =
  supabaseUrl.includes('your-project-id.supabase.co') ||
  supabaseAnonKey === 'your-anon-key-here';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey) && !usesPlaceholderCredentials;
export const supabaseSetupMessage =
  'Supabase is not configured. Replace the sample values in .env with your project URL and anon key, then restart Expo.';

if (!isSupabaseConfigured) {
  console.warn(`⚠️ ${supabaseSetupMessage}`);
}

export const supabase = createClient(
  isSupabaseConfigured ? supabaseUrl : 'https://placeholder.supabase.co',
  isSupabaseConfigured ? supabaseAnonKey : 'placeholder-key',
  {
    auth: {
      storage: ExpoSecureStoreAdapter as any,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);
