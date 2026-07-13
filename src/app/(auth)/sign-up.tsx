import React, { useState } from 'react';
import { StyleSheet, View, TextInput, Pressable, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { Link } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { BrandColors, Spacing, BorderRadius } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { UserRole } from '@/context/AuthContext';
import * as SecureStore from 'expo-secure-store';
import * as StellarSdk from '@stellar/stellar-sdk';

const SECRET_KEY_NAME = 'stellar_secret';

export default function SignUpScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<UserRole>('beneficiary');
  const [loading, setLoading] = useState(false);

  async function signUpWithEmail() {
    if (!email || !password || !fullName) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    
    setLoading(true);
    
    // 1. Sign up the user in Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (authError) {
      Alert.alert('Sign Up Failed', authError.message);
      setLoading(false);
      return;
    }

    if (authData.user) {
      // 2. Generate Stellar wallet if beneficiary
      let stellarPubkey = undefined;
      
      if (role === 'beneficiary') {
        try {
          const keypair = StellarSdk.Keypair.random();
          const secret = keypair.secret();
          stellarPubkey = keypair.publicKey();
          await SecureStore.setItemAsync(SECRET_KEY_NAME, secret);
        } catch (e) {
          console.error("Failed to generate Stellar wallet", e);
        }
      }

      // 3. Insert profile
      const { error: profileError } = await supabase
        .from('profiles')
        .insert([
          {
            id: authData.user.id,
            role,
            full_name: fullName,
            stellar_pubkey: stellarPubkey,
          }
        ]);
        
      if (profileError) {
        Alert.alert('Profile Setup Failed', profileError.message);
      }
    }
    
    setLoading(false);
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <ThemedText style={styles.title}>Join ReliefChain</ThemedText>
          <ThemedText style={styles.subtitle}>Create your account</ThemedText>

          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <ThemedText style={styles.label}>Full Name</ThemedText>
              <TextInput
                style={styles.input}
                onChangeText={setFullName}
                value={fullName}
                placeholder="Juan Dela Cruz"
              />
            </View>

            <View style={styles.inputGroup}>
              <ThemedText style={styles.label}>Email</ThemedText>
              <TextInput
                style={styles.input}
                onChangeText={setEmail}
                value={email}
                placeholder="email@address.com"
                autoCapitalize="none"
                keyboardType="email-address"
              />
            </View>

            <View style={styles.inputGroup}>
              <ThemedText style={styles.label}>Password</ThemedText>
              <TextInput
                style={styles.input}
                onChangeText={setPassword}
                value={password}
                secureTextEntry
                placeholder="Create a password"
                autoCapitalize="none"
              />
            </View>
            
            <View style={styles.inputGroup}>
              <ThemedText style={styles.label}>I am a...</ThemedText>
              <View style={styles.roleContainer}>
                <Pressable 
                  style={[styles.roleOption, role === 'beneficiary' && styles.roleSelected]}
                  onPress={() => setRole('beneficiary')}
                >
                  <ThemedText style={[styles.roleText, role === 'beneficiary' && styles.roleTextSelected]}>Beneficiary</ThemedText>
                </Pressable>
                <Pressable 
                  style={[styles.roleOption, role === 'merchant' && styles.roleSelected]}
                  onPress={() => setRole('merchant')}
                >
                  <ThemedText style={[styles.roleText, role === 'merchant' && styles.roleTextSelected]}>Merchant</ThemedText>
                </Pressable>
              </View>
            </View>

            <Pressable 
              style={[styles.button, loading && styles.buttonDisabled]} 
              disabled={loading} 
              onPress={signUpWithEmail}
            >
              {loading ? (
                <ActivityIndicator color="white" />
              ) : (
                <ThemedText style={styles.buttonText}>Sign Up</ThemedText>
              )}
            </Pressable>
          </View>

          <View style={styles.footer}>
            <ThemedText style={styles.footerText}>Already have an account? </ThemedText>
            <Link href={"/(auth)/sign-in" as any} asChild>
              <Pressable>
                <ThemedText style={styles.linkText}>Sign In</ThemedText>
              </Pressable>
            </Link>
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFC',
  },
  safeArea: {
    flex: 1,
  },
  content: {
    padding: Spacing.six,
    justifyContent: 'center',
    flexGrow: 1,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: BrandColors.green,
    textAlign: 'center',
    marginBottom: Spacing.two,
  },
  subtitle: {
    fontSize: 18,
    color: BrandColors.navy,
    textAlign: 'center',
    marginBottom: Spacing.six,
  },
  form: {
    gap: Spacing.four,
  },
  inputGroup: {
    gap: Spacing.two,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: BrandColors.navy,
  },
  input: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: BorderRadius.md,
    padding: Spacing.three,
    fontSize: 16,
  },
  roleContainer: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  roleOption: {
    flex: 1,
    padding: Spacing.three,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    backgroundColor: 'white',
  },
  roleSelected: {
    borderColor: BrandColors.green,
    backgroundColor: '#E8F5E9',
  },
  roleText: {
    fontSize: 14,
    color: BrandColors.grey,
    fontWeight: '600',
  },
  roleTextSelected: {
    color: BrandColors.green,
  },
  button: {
    backgroundColor: BrandColors.navy,
    padding: Spacing.four,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    marginTop: Spacing.two,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: Spacing.six,
  },
  footerText: {
    color: BrandColors.grey,
    fontSize: 14,
  },
  linkText: {
    color: BrandColors.green,
    fontSize: 14,
    fontWeight: 'bold',
  },
});
