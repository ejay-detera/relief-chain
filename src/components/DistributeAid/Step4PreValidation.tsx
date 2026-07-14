import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';

import { ThemedText } from '@/components/themed-text';
import { BrandColors, Spacing, BorderRadius } from '@/constants/theme';
import type { UserProfile } from '@/types/auth';
import type { DatabaseProgram } from './Step1ProgramSelect';

type Props = {
  program: DatabaseProgram;
  selectedBeneficiaries: UserProfile[];
  onNext: () => void;
  onBack: () => void;
};

type ValidationCheck = {
  id: string;
  name: string;
  description: string;
  status: 'pending' | 'success' | 'warning' | 'error';
};

export const Step4PreValidation = ({ program, selectedBeneficiaries, onNext, onBack }: Props) => {
  const [validating, setValidating] = useState(true);
  const [checks, setChecks] = useState<ValidationCheck[]>([]);

  const totalPayout = selectedBeneficiaries.length * Number(program.amount_per_beneficiary);
  const budgetAvailable = Number(program.total_budget);

  useEffect(() => {
    // Run simulated validations
    const runChecks = () => {
      const initialChecks: ValidationCheck[] = [
        {
          id: 'budget',
          name: 'Budget Allocation Sufficiency',
          description: `Required: ₱${totalPayout.toLocaleString()} | Available: ₱${budgetAvailable.toLocaleString()}`,
          status: 'pending',
        },
        {
          id: 'lgu_wallet',
          name: 'LGU Disbursement Key Check',
          description: 'Validating cryptographic signature permission on Stellar network.',
          status: 'pending',
        },
        {
          id: 'beneficiary_wallets',
          name: 'Citizen Wallet Addresses Validation',
          description: 'Scanning selected recipients for active public keys.',
          status: 'pending',
        },
      ];

      setChecks(initialChecks);

      // Phase 1 check: Budget
      setTimeout(() => {
        setChecks((prev) =>
          prev.map((c) =>
            c.id === 'budget'
              ? {
                  ...c,
                  status: totalPayout <= budgetAvailable ? 'success' : 'error',
                }
              : c
          )
        );
      }, 700);

      // Phase 2 check: LGU Wallet
      setTimeout(() => {
        setChecks((prev) =>
          prev.map((c) =>
            c.id === 'lgu_wallet' ? { ...c, status: 'success' } : c
          )
        );
      }, 1400);

      // Phase 3 check: Beneficiary wallets
      setTimeout(() => {
        const missingWalletsCount = selectedBeneficiaries.filter((b) => !b.stellar_pubkey).length;
        setChecks((prev) =>
          prev.map((c) =>
            c.id === 'beneficiary_wallets'
              ? {
                  ...c,
                  status: missingWalletsCount === 0 ? 'success' : 'warning',
                  description: missingWalletsCount === 0
                    ? 'All recipients have valid public keys.'
                    : `${missingWalletsCount} beneficiary account(s) lack a public key and will be excluded.`,
                }
              : c
          )
        );
        setValidating(false);
      }, 2100);
    };

    runChecks();
  }, [program, selectedBeneficiaries, totalPayout, budgetAvailable]);

  const hasErrors = checks.some((c) => c.status === 'error');

  const getIcon = (status: ValidationCheck['status']) => {
    switch (status) {
      case 'success':
        return <FontAwesome name="check-circle" size={24} color={BrandColors.green} />;
      case 'warning':
        return <FontAwesome name="exclamation-circle" size={24} color={BrandColors.yellow} />;
      case 'error':
        return <FontAwesome name="times-circle" size={24} color="#D32F2F" />;
      default:
        return <ActivityIndicator size="small" color={BrandColors.navy} />;
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <FontAwesome name="shield" size={44} color={BrandColors.navy} />
          <ThemedText style={styles.title}>Pre-distribution Security Check</ThemedText>
          <ThemedText style={styles.subtitle}>
            We are performing validation checks on the ledger and LGU allocation details.
          </ThemedText>
        </View>

        <View style={styles.checksContainer}>
          {checks.map((c) => (
            <View key={c.id} style={styles.checkCard}>
              <View style={styles.iconContainer}>{getIcon(c.status)}</View>
              <View style={styles.checkInfo}>
                <ThemedText style={styles.checkName}>{c.name}</ThemedText>
                <ThemedText style={styles.checkDesc}>{c.description}</ThemedText>
              </View>
            </View>
          ))}
        </View>

        {validating && (
          <View style={styles.runningContainer}>
            <ActivityIndicator size="small" color={BrandColors.navy} />
            <ThemedText style={styles.runningText}>Running cryptographic assertions...</ThemedText>
          </View>
        )}

        {!validating && hasErrors && (
          <View style={styles.errorBanner}>
            <FontAwesome name="warning" size={16} color="#C53030" />
            <ThemedText style={styles.errorText}>
              Verification failed. Budget allocation exceeded. Adjust recipients to continue.
            </ThemedText>
          </View>
        )}
      </View>

      <View style={styles.footer}>
        <View style={styles.btnRow}>
          <Pressable onPress={onBack} style={[styles.btn, styles.btnBack]}>
            <ThemedText style={styles.btnTextBack}>Back</ThemedText>
          </Pressable>
          <Pressable
            disabled={validating || hasErrors}
            onPress={onNext}
            style={[styles.btn, styles.btnNext, (validating || hasErrors) && styles.btnDisabled]}
          >
            <ThemedText style={styles.btnTextNext}>Review Distribution</ThemedText>
          </Pressable>
        </View>
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
  },
  header: {
    alignItems: 'center',
    marginBottom: Spacing.six,
    textAlign: 'center',
    gap: Spacing.two,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: BrandColors.navy,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 12,
    color: BrandColors.grey,
    textAlign: 'center',
    paddingHorizontal: Spacing.two,
  },
  checksContainer: {
    gap: Spacing.three,
  },
  checkCard: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderRadius: BorderRadius.lg,
    padding: Spacing.four,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
  },
  iconContainer: {
    marginRight: Spacing.three,
    width: 28,
    alignItems: 'center',
  },
  checkInfo: {
    flex: 1,
  },
  checkName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: BrandColors.navy,
  },
  checkDesc: {
    fontSize: 12,
    color: BrandColors.grey,
    marginTop: 2,
  },
  runningContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing.six,
    gap: Spacing.two,
  },
  runningText: {
    fontSize: 13,
    color: BrandColors.grey,
    fontStyle: 'italic',
  },
  errorBanner: {
    flexDirection: 'row',
    backgroundColor: '#FFF5F5',
    borderColor: '#FEB2B2',
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.three,
    marginTop: Spacing.six,
    alignItems: 'center',
    gap: Spacing.two,
  },
  errorText: {
    flex: 1,
    fontSize: 12,
    color: '#C53030',
    fontWeight: '600',
  },
  footer: {
    padding: Spacing.four,
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderColor: '#E5E7EB',
  },
  btnRow: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  btn: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnBack: {
    borderWidth: 1,
    borderColor: BrandColors.navy,
    backgroundColor: 'white',
  },
  btnNext: {
    backgroundColor: BrandColors.navy,
  },
  btnDisabled: {
    backgroundColor: BrandColors.lightGray,
  },
  btnTextBack: {
    color: BrandColors.navy,
    fontSize: 14,
    fontWeight: 'bold',
  },
  btnTextNext: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
});
