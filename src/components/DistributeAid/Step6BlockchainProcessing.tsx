import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';

import { ThemedText } from '@/components/themed-text';
import { BrandColors, Spacing, BorderRadius } from '@/constants/theme';

type Props = {
  onComplete: () => void;
};

type StepState = 'pending' | 'loading' | 'success';

interface ProcessStep {
  id: number;
  label: string;
  logMessage: string;
}

const steps: ProcessStep[] = [
  { id: 0, label: 'Connecting LGU disbursement account', logMessage: '[INFO] Initializing cryptographic keystore connection...' },
  { id: 1, label: 'Resolving beneficiary Stellar wallets', logMessage: '[INFO] Mapping citizen government IDs to public ledger keys...' },
  { id: 2, label: 'Constructing Stellar transaction envelopes', logMessage: '[INFO] Packaging XDR payload envelopes for batch distribution...' },
  { id: 3, label: 'Signing batch payload with LGU key', logMessage: '[INFO] Appending Ed25519 signature assertions...' },
  { id: 4, label: 'Broadcasting transactions to Horizon network', logMessage: '[INFO] Submitting to Horizon API testnet ledger nodes...' },
  { id: 5, label: 'Sealing vouchers and verifying anchors', logMessage: '[SUCCESS] Transaction confirmed. Ledger sequence sealed.' },
];

export const Step6BlockchainProcessing = ({ onComplete }: Props) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [stepStates, setStepStates] = useState<Record<number, StepState>>({
    0: 'loading',
    1: 'pending',
    2: 'pending',
    3: 'pending',
    4: 'pending',
    5: 'pending',
  });
  const [consoleLogs, setConsoleLogs] = useState<string[]>(['[SYSTEM] Initializing Stellar disbursement subagent...']);

  useEffect(() => {
    let isMounted = true;
    if (currentStep >= steps.length) {
      // Small buffer before showing success modal
      const timer = setTimeout(() => {
        if (isMounted) onComplete();
      }, 800);
      return () => {
        isMounted = false;
        clearTimeout(timer);
      };
    }

    const currentStepConfig = steps[currentStep];
    
    // Add current log asynchronously
    Promise.resolve().then(() => {
      if (isMounted) {
        setConsoleLogs((prev) => [...prev, currentStepConfig.logMessage]);
      }
    });

    const timer = setTimeout(() => {
      if (isMounted) {
        // Complete current step
        setStepStates((prev) => ({ ...prev, [currentStep]: 'success' }));
        
        // Move to next step if available
        const nextStep = currentStep + 1;
        if (nextStep < steps.length) {
          setStepStates((prev) => ({ ...prev, [nextStep]: 'loading' }));
        }
        
        setCurrentStep(nextStep);
      }
    }, 1200);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [currentStep, onComplete]);

  const getStepIcon = (state: StepState) => {
    switch (state) {
      case 'success':
        return <FontAwesome name="check" size={14} color="white" />;
      case 'loading':
        return <ActivityIndicator size="small" color={BrandColors.navy} />;
      default:
        return <View style={styles.pendingDot} />;
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <FontAwesome name="database" size={44} color={BrandColors.navy} />
          <ThemedText style={styles.title}>Blockchain Distribution</ThemedText>
          <ThemedText style={styles.subtitle}>
            Anchoring voucher disbursement assets to the Stellar network...
          </ThemedText>
        </View>

        {/* Live Pipeline Steps */}
        <View style={styles.stepsCard}>
          {steps.map((s) => {
            const state = stepStates[s.id];
            const isSuccess = state === 'success';
            const isLoading = state === 'loading';

            return (
              <View key={s.id} style={styles.stepRow}>
                <View
                  style={[
                    styles.statusBadge,
                    isSuccess && styles.statusBadgeSuccess,
                    isLoading && styles.statusBadgeLoading,
                  ]}
                >
                  {getStepIcon(state)}
                </View>
                <ThemedText
                  style={[
                    styles.stepLabel,
                    isSuccess && styles.stepLabelSuccess,
                    isLoading && styles.stepLabelLoading,
                  ]}
                >
                  {s.label}
                </ThemedText>
              </View>
            );
          })}
        </View>

        {/* Simulated Console Logs */}
        <ThemedText style={styles.consoleTitle}>Subledger logs</ThemedText>
        <View style={styles.consoleCard}>
          <ScrollView
            ref={(ref) => ref?.scrollToEnd({ animated: true })}
            contentContainerStyle={styles.consoleLogs}
          >
            {consoleLogs.map((log, idx) => (
              <ThemedText key={idx} style={styles.logText}>
                {log}
              </ThemedText>
            ))}
          </ScrollView>
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
    gap: Spacing.two,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: BrandColors.navy,
  },
  subtitle: {
    fontSize: 12,
    color: BrandColors.grey,
    textAlign: 'center',
  },
  stepsCard: {
    backgroundColor: 'white',
    borderRadius: BorderRadius.lg,
    padding: Spacing.five,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
    gap: Spacing.four,
    marginBottom: Spacing.five,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  statusBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },
  statusBadgeSuccess: {
    backgroundColor: BrandColors.green,
    borderColor: BrandColors.green,
  },
  statusBadgeLoading: {
    borderColor: BrandColors.navy,
  },
  pendingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#94A3B8',
  },
  stepLabel: {
    fontSize: 13,
    color: '#94A3B8',
    fontWeight: '500',
  },
  stepLabelSuccess: {
    color: BrandColors.navy,
  },
  stepLabelLoading: {
    color: BrandColors.navy,
    fontWeight: '700',
  },
  consoleTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: BrandColors.grey,
    textTransform: 'uppercase',
    marginBottom: Spacing.two,
    paddingLeft: 4,
  },
  consoleCard: {
    backgroundColor: '#1E293B',
    borderRadius: BorderRadius.md,
    height: 140,
    padding: Spacing.three,
  },
  consoleLogs: {
    gap: 4,
  },
  logText: {
    fontFamily: 'monospace',
    fontSize: 11,
    color: '#38BDF8',
  },
});
