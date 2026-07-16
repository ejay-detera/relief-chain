import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ErrorState } from '@/components/shared/error-state';
import { ThemedText } from '@/components/themed-text';
import { BrandColors, Spacing } from '@/constants/theme';
import { useMfa } from '@/hooks/use-mfa';
import { useStepUp } from '@/hooks/use-step-up';
import type { MfaEnrollmentTicket, MfaFactorSummary } from '@/types/mfa';
import { evaluateStepUp } from '@/utils/step-up';
import { MfaEnrollmentModal } from './MfaEnrollmentModal';
import { MfaFactorList } from './MfaFactorList';
import { MfaStatusCard } from './MfaStatusCard';
import { StepUpCard } from './StepUpCard';
import { StepUpModal } from './StepUpModal';

type Props = {
  /** "organization" or "merchant" — tunes copy only. */
  accountLabel: string;
  /** The sensitive action the demonstration step-up guards, for prompt copy. */
  stepUpActionDescription: string;
};

/**
 * Composes the full MFA experience for organization and merchant financial
 * accounts (Requirements 20.1, 20.2): enrollment, factor management, and a
 * recent-step-up flow. It owns the enrollment and step-up prompt state and defers
 * all provider work to `useMfa`/`useStepUp`, so the host screen stays a thin shell.
 */
export const MfaSecurityPanel = ({ accountLabel, stepUpActionDescription }: Props) => {
  const mfa = useMfa();
  const evaluation = mfa.assurance
    ? evaluateStepUp(mfa.assurance)
    : { isFresh: false, secondsRemaining: 0, requiresEnrollment: !mfa.isEnabled };
  const stepUp = useStepUp(mfa.factors, evaluation);

  const [ticket, setTicket] = useState<MfaEnrollmentTicket | null>(null);
  const [enrollVisible, setEnrollVisible] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [enrollError, setEnrollError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const openEnrollment = useCallback(async () => {
    setEnrollError(null);
    setTicket(null);
    setEnrollVisible(true);
    setEnrolling(true);
    const result = await mfa.enroll(`${accountLabel} authenticator`);
    setEnrolling(false);
    if (!result.ok) {
      setEnrollError(result.message);
      return;
    }
    setTicket(result.value);
  }, [accountLabel, mfa]);

  const submitEnrollment = useCallback(
    async (code: string) => {
      if (!ticket) return;
      setVerifying(true);
      setEnrollError(null);
      const result = await mfa.confirmEnrollment(ticket.factorId, code);
      setVerifying(false);
      if (!result.ok) {
        setEnrollError(result.message);
        return;
      }
      setEnrollVisible(false);
      setTicket(null);
    },
    [mfa, ticket],
  );

  const removeFactor = useCallback(
    async (factor: MfaFactorSummary) => {
      setRemovingId(factor.id);
      await mfa.removeFactor(factor.id);
      setRemovingId(null);
    },
    [mfa],
  );

  const submitStepUp = useCallback(
    async (code: string) => {
      const ok = await stepUp.submitCode(code);
      if (ok) await mfa.refresh();
    },
    [mfa, stepUp],
  );

  if (mfa.error && !mfa.isLoading) {
    return <ErrorState message={mfa.error} onRetry={() => void mfa.refresh()} />;
  }

  return (
    <View style={styles.container}>
      <MfaStatusCard
        accountLabel={accountLabel}
        assurance={mfa.assurance}
        isEnabled={mfa.isEnabled}
        onEnroll={() => void openEnrollment()}
      />

      {mfa.isEnabled ? (
        <StepUpCard
          evaluation={evaluation}
          onReVerify={stepUp.begin}
        />
      ) : null}

      {mfa.factors.length > 0 ? (
        <View style={styles.factorsCard}>
          <ThemedText style={styles.sectionTitle}>Your factors</ThemedText>
          <MfaFactorList factors={mfa.factors} onRemove={removeFactor} removingId={removingId} />
        </View>
      ) : null}

      <MfaEnrollmentModal
        errorMessage={enrollError}
        isVerifying={verifying}
        onClose={() => setEnrollVisible(false)}
        onSubmitCode={submitEnrollment}
        ticket={enrolling ? null : ticket}
        visible={enrollVisible}
      />

      <StepUpModal
        actionDescription={stepUpActionDescription}
        errorMessage={stepUp.error}
        isVerifying={stepUp.phase === 'verifying'}
        onCancel={stepUp.cancel}
        onEnrollInstead={() => {
          stepUp.cancel();
          void openEnrollment();
        }}
        onSubmitCode={submitStepUp}
        requiresEnrollment={evaluation.requiresEnrollment}
        visible={stepUp.phase === 'prompting' || stepUp.phase === 'verifying'}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { gap: Spacing.three },
  factorsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    gap: Spacing.two,
    padding: Spacing.four,
    boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
  },
  sectionTitle: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 14 },
});
