import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';

import { ThemedText } from '@/components/themed-text';
import { BrandColors, Spacing, BorderRadius } from '@/constants/theme';
import type { UserProfile } from '@/types/auth';
import type { DatabaseProgram } from './Step1ProgramSelect';

type Props = {
  program: DatabaseProgram;
  selectedBeneficiaries: UserProfile[];
  onFinish: () => void;
};

export const Step7SuccessModal = ({ program, selectedBeneficiaries, onFinish }: Props) => {
  const amountVal = Number(program.amount_per_beneficiary);
  const totalPayout = selectedBeneficiaries.length * amountVal;

  const mockTxHash = '41ab447d95c72ab01c29e248b6b0c2a71f008ad5b225b9e67d264a2777123456';

  const handleCopy = async () => {
    await Clipboard.setStringAsync(mockTxHash);
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.card}>
          <View style={styles.successIcon}>
            <FontAwesome name="check" size={32} color="white" />
          </View>
          <ThemedText style={styles.title}>Aid Distributed Successfully!</ThemedText>
          <ThemedText style={styles.subtitle}>
            Ledger balances have been updated and transfers are anchored on the blockchain.
          </ThemedText>

          <View style={styles.divider} />

          <View style={styles.statsCard}>
            <View style={styles.statRow}>
              <ThemedText style={styles.label}>Program</ThemedText>
              <ThemedText numberOfLines={1} style={styles.value}>{program.name}</ThemedText>
            </View>
            <View style={styles.statRow}>
              <ThemedText style={styles.label}>Disaster Event</ThemedText>
              <ThemedText style={styles.value}>{program.disaster_event || 'General Assistance'}</ThemedText>
            </View>
            <View style={styles.statRow}>
              <ThemedText style={styles.label}>Total Disbursed</ThemedText>
              <ThemedText style={[styles.value, styles.valueHighlight]}>
                ₱{totalPayout.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </ThemedText>
            </View>
            <View style={styles.statRow}>
              <ThemedText style={styles.label}>Recipients</ThemedText>
              <ThemedText style={styles.value}>{selectedBeneficiaries.length} Households</ThemedText>
            </View>
          </View>

          <View style={styles.divider} />

          <ThemedText style={styles.hashLabel}>Stellar Transaction Hash</ThemedText>
          <View style={styles.hashContainer}>
            <ThemedText numberOfLines={1} style={styles.hashText}>{mockTxHash}</ThemedText>
            <Pressable onPress={handleCopy} style={styles.copyBtn}>
              <FontAwesome name="copy" size={16} color={BrandColors.navy} />
            </Pressable>
          </View>
        </View>
      </View>

      <View style={styles.footer}>
        <Pressable onPress={onFinish} style={styles.finishBtn}>
          <ThemedText style={styles.finishBtnText}>Go to Dashboard</ThemedText>
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFC',
  },
  content: {
    flex: 1,
    padding: Spacing.four,
    justifyContent: 'center',
  },
  card: {
    backgroundColor: 'white',
    borderRadius: BorderRadius.lg,
    padding: Spacing.six,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
  },
  successIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: BrandColors.green,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.four,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: BrandColors.navy,
    textAlign: 'center',
    marginBottom: Spacing.two,
  },
  subtitle: {
    fontSize: 13,
    color: BrandColors.grey,
    textAlign: 'center',
    paddingHorizontal: Spacing.two,
    lineHeight: 18,
  },
  divider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    width: '100%',
    marginVertical: Spacing.four,
  },
  statsCard: {
    width: '100%',
    gap: Spacing.three,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontSize: 13,
    color: BrandColors.grey,
  },
  value: {
    fontSize: 13,
    fontWeight: '600',
    color: BrandColors.navy,
    maxWidth: '60%',
  },
  valueHighlight: {
    color: BrandColors.green,
    fontWeight: 'bold',
  },
  hashLabel: {
    fontSize: 11,
    fontWeight: 'bold',
    color: BrandColors.grey,
    textTransform: 'uppercase',
    alignSelf: 'flex-start',
    marginBottom: Spacing.two,
  },
  hashContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: BorderRadius.md,
    padding: Spacing.three,
    width: '100%',
    justifyContent: 'space-between',
  },
  hashText: {
    fontSize: 12,
    color: BrandColors.navy,
    fontFamily: 'monospace',
    flex: 1,
    marginRight: Spacing.two,
  },
  copyBtn: {
    padding: 4,
  },
  footer: {
    padding: Spacing.four,
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderColor: '#E5E7EB',
  },
  finishBtn: {
    height: 50,
    backgroundColor: BrandColors.navy,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
  },
  finishBtnText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
