import { FontAwesome } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import type { DestinationWalletValidation, RegisteredOrganizationRecipient } from '@/types/organization-transfer';

interface RecipientWalletInputProps {
  value: string;
  onChangeText: (text: string) => void;
  validation: DestinationWalletValidation | null;
  isValidating: boolean;
  registeredOrgs: RegisteredOrganizationRecipient[];
  onSelectOrg: (org: RegisteredOrganizationRecipient) => void;
}

export function RecipientWalletInput({
  value,
  onChangeText,
  validation,
  isValidating,
  registeredOrgs,
  onSelectOrg,
}: RecipientWalletInputProps) {
  const handlePaste = async () => {
    try {
      const text = await Clipboard.getStringAsync();
      if (text) onChangeText(text.trim());
    } catch {}
  };

  return (
    <View style={styles.container}>
      <ThemedText style={styles.label}>Recipient Stellar Wallet Address</ThemedText>
      <ThemedText style={styles.hint}>
        Enter the destination Stellar wallet address (starts with G)
      </ThemedText>

      <View style={[styles.inputWrapper, validation?.errorMessage ? styles.inputError : null]}>
        <TextInput
          autoCapitalize="characters"
          autoCorrect={false}
          onChangeText={onChangeText}
          placeholder="e.g. G..."
          placeholderTextColor={BrandColors.grey}
          style={styles.input}
          value={value}
        />
        {value.length > 0 ? (
          <Pressable onPress={() => onChangeText('')} style={styles.iconBtn}>
            <FontAwesome color={BrandColors.grey} name="times-circle" size={16} />
          </Pressable>
        ) : (
          <Pressable onPress={handlePaste} style={styles.pasteBtn}>
            <FontAwesome color={BrandColors.navy} name="clipboard" size={12} />
            <ThemedText style={styles.pasteText}>Paste</ThemedText>
          </Pressable>
        )}
      </View>

      {/* Validation status badge */}
      {isValidating ? (
        <View style={styles.statusRow}>
          <ActivityIndicator color={BrandColors.navy} size="small" />
          <ThemedText style={styles.statusVerifying}>Checking address & trustline on Horizon…</ThemedText>
        </View>
      ) : validation?.errorMessage ? (
        <View style={styles.statusRow}>
          <FontAwesome color="#D32F2F" name="exclamation-circle" size={14} />
          <ThemedText style={styles.statusError}>{validation.errorMessage}</ThemedText>
        </View>
      ) : validation?.isRcphpAuthorized ? (
        <View style={styles.statusRow}>
          <FontAwesome color={BrandColors.green} name="check-circle" size={14} />
          <ThemedText style={styles.statusSuccess}>
            {validation.matchedOrganizationName
              ? `Verified: ${validation.matchedOrganizationName} (Ready to receive RCPHP)`
              : 'Stellar wallet verified with authorized RCPHP trustline'}
          </ThemedText>
        </View>
      ) : null}

      {/* Quick select pills */}
      {registeredOrgs.length > 0 && (
        <View style={styles.orgsSection}>
          <ThemedText style={styles.quickLabel}>Registered Partner Organizations:</ThemedText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.orgsScroll}>
            {registeredOrgs.map((org) => {
              const isSelected = value === org.walletAddress;
              return (
                <Pressable
                  key={org.organizationId}
                  onPress={() => onSelectOrg(org)}
                  style={[styles.orgPill, isSelected && styles.orgPillSelected]}
                >
                  <FontAwesome
                    color={isSelected ? '#FFFFFF' : BrandColors.navy}
                    name="building-o"
                    size={12}
                  />
                  <ThemedText style={[styles.orgPillText, isSelected && styles.orgPillTextSelected]}>
                    {org.name}
                  </ThemedText>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.four,
    marginBottom: Spacing.four,
  },
  label: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 14,
    color: BrandColors.navy,
    marginBottom: Spacing.one,
  },
  hint: {
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 12,
    color: BrandColors.grey,
    marginBottom: Spacing.two,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BrandColors.lightGray,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    paddingHorizontal: Spacing.three,
    minHeight: 50,
  },
  inputError: {
    borderColor: '#D32F2F',
    backgroundColor: '#FFEBEE',
  },
  input: {
    flex: 1,
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 13,
    color: BrandColors.navy,
    paddingVertical: Spacing.two,
  },
  iconBtn: {
    padding: Spacing.two,
  },
  pasteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E0E8F5',
    paddingVertical: 6,
    paddingHorizontal: Spacing.two,
    borderRadius: BorderRadius.sm,
    gap: 4,
  },
  pasteText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 11,
    color: BrandColors.navy,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.two,
    gap: Spacing.two,
  },
  statusVerifying: {
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 12,
    color: BrandColors.navy,
  },
  statusError: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 12,
    color: '#D32F2F',
    flex: 1,
  },
  statusSuccess: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 12,
    color: '#2E7D32',
    flex: 1,
  },
  orgsSection: {
    marginTop: Spacing.three,
  },
  quickLabel: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 11,
    color: BrandColors.grey,
    marginBottom: Spacing.two,
  },
  orgsScroll: {
    gap: Spacing.two,
  },
  orgPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D0D7DE',
    paddingVertical: 6,
    paddingHorizontal: Spacing.three,
    borderRadius: BorderRadius.full,
    gap: 6,
  },
  orgPillSelected: {
    backgroundColor: BrandColors.navy,
    borderColor: BrandColors.navy,
  },
  orgPillText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 12,
    color: BrandColors.navy,
  },
  orgPillTextSelected: {
    color: '#FFFFFF',
  },
});
