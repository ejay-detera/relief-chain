import { FontAwesome } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';

import { authSignInStyles as styles } from './styles';

export type SignInMethod = 'merchantId' | 'phoneNumber';

type AuthSignInFormProps = {
  accessKey: string;
  identifier: string;
  isLoading: boolean;
  isSendingRecovery: boolean;
  method: SignInMethod;
  onAccessKeyChange: (value: string) => void;
  onIdentifierChange: (value: string) => void;
  onForgotPassword: () => void;
  onRegister: () => void;
  onScanId: () => void;
  onSelectMethod: (method: SignInMethod) => void;
  onVerifyIdentity: () => void;
  registrationLabel?: string;
  registrationPrompt?: string;
};

export function AuthSignInForm({
  accessKey,
  identifier,
  isLoading,
  isSendingRecovery,
  method,
  onAccessKeyChange,
  onIdentifierChange,
  onForgotPassword,
  onRegister,
  onScanId,
  onSelectMethod,
  onVerifyIdentity,
  registrationLabel = 'Register your account',
  registrationPrompt = 'New Account?',
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
            editable={!isSendingRecovery}
            keyboardType={method === 'phoneNumber' ? 'phone-pad' : 'default'}
            onChangeText={onIdentifierChange}
            placeholder="Beneficiary ID"
            placeholderTextColor="rgba(151, 151, 151, 0.5)"
            style={styles.input}
            value={identifier}
          />
        </View>

        <View style={[styles.inputContainer, styles.accessKeyInput]}>
          <FontAwesome name="key" size={18} color="rgba(151, 151, 151, 0.5)" />
          <TextInput
            autoCapitalize="none"
            autoComplete="current-password"
            editable={!isSendingRecovery}
            onChangeText={onAccessKeyChange}
            placeholder="Beneficiary Access Key"
            placeholderTextColor="rgba(151, 151, 151, 0.5)"
            secureTextEntry
            style={styles.input}
            value={accessKey}
          />
        </View>

        <Pressable
          accessibilityRole="button"
          disabled={isLoading || isSendingRecovery}
          onPress={onForgotPassword}
          style={[styles.forgotPasswordButton, (isLoading || isSendingRecovery) && styles.verifyButtonDisabled]}
        >
          {isSendingRecovery ? <ActivityIndicator color="#112E58" size="small" /> : <ThemedText style={styles.forgotPasswordText}>Forgot password?</ThemedText>}
        </Pressable>

        <Pressable
          disabled={isLoading || isSendingRecovery}
          onPress={onVerifyIdentity}
          style={[styles.verifyButton, (isLoading || isSendingRecovery) && styles.verifyButtonDisabled]}
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
        <ThemedText style={styles.footerText}>{registrationPrompt} </ThemedText>
        <Pressable onPress={onRegister}>
          <ThemedText style={styles.footerLink}>{registrationLabel}</ThemedText>
        </Pressable>
      </View>
    </View>
  );
}
