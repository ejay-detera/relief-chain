import { FontAwesome } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';

import { authSignInStyles as styles } from './styles';

export type SignInMethod = 'merchantId' | 'phoneNumber';

type AuthSignInFormProps = {
  accessKey: string;
  identifier: string;
  isLoading: boolean;
  method: SignInMethod;
  onAccessKeyChange: (value: string) => void;
  onIdentifierChange: (value: string) => void;
  onRegister: () => void;
  onScanId: () => void;
  onSelectMethod: (method: SignInMethod) => void;
  onVerifyIdentity: () => void;
};

export function AuthSignInForm({
  accessKey,
  identifier,
  isLoading,
  method,
  onAccessKeyChange,
  onIdentifierChange,
  onRegister,
  onScanId,
  onSelectMethod,
  onVerifyIdentity,
}: AuthSignInFormProps) {
  return (
    <View style={styles.card}>
      <ThemedText style={styles.title}>Welcome back!</ThemedText>
      <ThemedText style={styles.subtitle}>
        Secure access for relief officers and verified agencies.
      </ThemedText>

      <View style={styles.methodSelector}>
        <Pressable
          style={[styles.methodOption, method === 'merchantId' && styles.methodOptionActive]}
          onPress={() => onSelectMethod('merchantId')}
        >
          <ThemedText style={[styles.methodText, method === 'merchantId' && styles.methodTextActive]}>
            Merchant ID
          </ThemedText>
        </Pressable>
        <Pressable
          style={[styles.methodOption, method === 'phoneNumber' && styles.methodOptionActive]}
          onPress={() => onSelectMethod('phoneNumber')}
        >
          <ThemedText style={[styles.methodText, method === 'phoneNumber' && styles.methodTextActive]}>
            Phone Number
          </ThemedText>
        </Pressable>
      </View>

      <View style={styles.form}>
        <View style={styles.inputContainer}>
          <FontAwesome name="id-card" size={18} color="rgba(151, 151, 151, 0.5)" />
          <TextInput
            autoCapitalize="none"
            autoComplete="username"
            keyboardType={method === 'phoneNumber' ? 'phone-pad' : 'default'}
            onChangeText={onIdentifierChange}
            placeholder="Beneficiary ID"
            placeholderTextColor="rgba(151, 151, 151, 0.5)"
            style={styles.input}
            value={identifier}
          />
        </View>

        <View style={styles.inputContainer}>
          <FontAwesome name="key" size={18} color="rgba(151, 151, 151, 0.5)" />
          <TextInput
            autoCapitalize="none"
            autoComplete="current-password"
            onChangeText={onAccessKeyChange}
            placeholder="Beneficiary Access Key"
            placeholderTextColor="rgba(151, 151, 151, 0.5)"
            secureTextEntry
            style={styles.input}
            value={accessKey}
          />
        </View>

        <Pressable
          disabled={isLoading}
          onPress={onVerifyIdentity}
          style={[styles.verifyButton, isLoading && styles.verifyButtonDisabled]}
        >
          {isLoading ? <ActivityIndicator color="#FFFFFF" /> : <ThemedText style={styles.verifyButtonText}>Verify Identity</ThemedText>}
        </Pressable>
      </View>

      <View style={styles.divider}>
        <View style={styles.dividerLine} />
        <ThemedText style={styles.dividerText}>OR</ThemedText>
        <View style={styles.dividerLine} />
      </View>

      <Pressable onPress={onScanId} style={styles.scanButton}>
        <FontAwesome name="qrcode" size={17} color="#FFFFFF" />
        <ThemedText style={styles.scanButtonText}>Scan ID</ThemedText>
      </Pressable>

      <View style={styles.footer}>
        <ThemedText style={styles.footerText}>New Organization? </ThemedText>
        <Pressable onPress={onRegister}>
          <ThemedText style={styles.footerLink}>Register your agency</ThemedText>
        </Pressable>
      </View>
    </View>
  );
}
