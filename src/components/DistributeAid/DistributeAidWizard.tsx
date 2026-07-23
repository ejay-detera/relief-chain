import { FontAwesome } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BrandColors, Spacing } from '@/constants/theme';
import { useDistributionJob } from '@/hooks/use-distribution-job';
import {
    authorizeDistribution,
    prepareDistribution,
} from '@/services/distribution-service';
import type { UserProfile } from '@/types/auth';
import { parseStroopAmount, type StroopAmount } from '@/types/blockchain';
import type { DistributionRecipientRequest } from '@/types/distribution';
import type { FinancialError } from '@/types/errors';

import { DistributionFailureSummary } from './DistributionFailureSummary';
import { DistributionProgress } from './DistributionProgress';
import { RecipientResults } from './RecipientResults';
import { DatabaseProgram, Step1ProgramSelect } from './Step1ProgramSelect';
import { Step2ProgramSummary } from './Step2ProgramSummary';
import { Step3BeneficiaryList } from './Step3BeneficiaryList';
import { Step4PreValidation } from './Step4PreValidation';
import { Step5DistributionReview } from './Step5DistributionReview';

type Props = {
  onClose: () => void;
  /** Invoked when the observation screen is dismissed after a job has been started. */
  onCompleted?: (jobId: string) => void;
};

type AuthorizationState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'error'; error: FinancialError };

const RCPHP_DECIMALS = 10_000_000; // 7 decimal places

/** Converts a PHP-denominated decimal into canonical integer RCPHP stroops. */
const toStroops = (php: number): StroopAmount => {
  const stroops = Math.round(php * RCPHP_DECIMALS);
  if (!Number.isSafeInteger(stroops) || stroops < 0) {
    return parseStroopAmount(0);
  }
  return parseStroopAmount(stroops);
};

const STEP_TITLES: Record<number, string> = {
  1: 'Select Aid Program',
  2: 'Aid Program Summary',
  3: 'Select Beneficiaries',
  4: 'Pre-distribution Checks',
  5: 'Distribution Review',
  6: 'Authorize Distribution',
  7: 'Distribution Status',
};

/**
 * Thin state-owning shell for organization aid distribution.
 *
 * The shell prepares a distribution, receives an explicit authorization, starts
 * a server-managed job, and then observes reconciled recipient states. It holds
 * no client-supplied transaction hash and runs no progress timer implying
 * blockchain work; every confirmed state originates from reconciled evidence
 * (Requirements 8.1, 18.3, 21.1, 21.2).
 */
export const DistributeAidWizard = ({ onClose, onCompleted }: Props) => {
  const [step, setStep] = useState<number>(1);
  const [selectedProgram, setSelectedProgram] = useState<DatabaseProgram | null>(null);
  const [selectedBeneficiaries, setSelectedBeneficiaries] = useState<UserProfile[]>([]);
  const [authorization, setAuthorization] = useState<AuthorizationState>({ status: 'idle' });
  const [jobId, setJobId] = useState<string | null>(null);

  const { job, recipients, refreshing, refresh, retryState, retrySafe } = useDistributionJob(jobId);
  const outcomes = recipients.status === 'loaded' ? recipients.outcomes : [];

  const handleSelectProgram = (program: DatabaseProgram) => {
    setSelectedProgram(program);
    setSelectedBeneficiaries([]);
  };

  /**
   * Prepares the job on the server and relays an explicit authorization to start
   * it. On success the shell advances to observe reconciled recipient states.
   */
  const handleAuthorize = async () => {
    if (!selectedProgram) return;

    const amountStroops = toStroops(Number(selectedProgram.amount_per_beneficiary));
    const recipientRequests: DistributionRecipientRequest[] = selectedBeneficiaries.map((b) => ({
      beneficiaryProfileId: b.id,
      amountStroops,
    }));

    setAuthorization({ status: 'submitting' });

    const prepared = await prepareDistribution({
      programId: selectedProgram.id,
      recipients: recipientRequests,
    });
    if (!prepared.ok) {
      setAuthorization({ status: 'error', error: prepared.error });
      return;
    }

    const started = await authorizeDistribution({
      jobId: prepared.data.jobId,
      authorizedAt: new Date().toISOString(),
    });
    if (!started.ok) {
      setAuthorization({ status: 'error', error: started.error });
      return;
    }

    setJobId(started.data.jobId);
    setAuthorization({ status: 'idle' });
    setStep(7);
  };

  const handleDone = () => {
    if (jobId) onCompleted?.(jobId);
    onClose();
  };

  return (
    <ThemedView style={styles.container}>
      {step < 7 && (
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <FontAwesome name="times" size={16} color={BrandColors.navy} />
            </Pressable>
            <ThemedText style={styles.title}>{STEP_TITLES[step]}</ThemedText>
          </View>
          <ThemedText style={styles.progress}>Step {step} of 6</ThemedText>
        </View>
      )}

      <View style={styles.content}>
        {step === 1 && (
          <Step1ProgramSelect
            selectedProgram={selectedProgram}
            onSelect={handleSelectProgram}
            onNext={() => setStep(2)}
          />
        )}

        {step === 2 && selectedProgram && (
          <Step2ProgramSummary program={selectedProgram} onNext={() => setStep(3)} onBack={() => setStep(1)} />
        )}

        {step === 3 && selectedProgram && (
          <Step3BeneficiaryList
            program={selectedProgram}
            selectedBeneficiaries={selectedBeneficiaries}
            onSelectChange={setSelectedBeneficiaries}
            onNext={() => setStep(4)}
            onBack={() => setStep(2)}
          />
        )}

        {step === 4 && selectedProgram && (
          <Step4PreValidation
            program={selectedProgram}
            selectedBeneficiaries={selectedBeneficiaries}
            onNext={() => setStep(5)}
            onBack={() => setStep(3)}
          />
        )}

        {step === 5 && selectedProgram && (
          <Step5DistributionReview
            program={selectedProgram}
            selectedBeneficiaries={selectedBeneficiaries}
            onNext={() => setStep(6)}
            onBack={() => setStep(4)}
          />
        )}

        {step === 6 && selectedProgram && (
          <AuthorizationStep
            recipientCount={selectedBeneficiaries.length}
            totalStroops={toStroops(
              selectedBeneficiaries.length * Number(selectedProgram.amount_per_beneficiary),
            )}
            state={authorization}
            onAuthorize={handleAuthorize}
            onBack={() => setStep(5)}
          />
        )}

        {step === 7 && (
          <View style={styles.observeContainer}>
            <RecipientResults
              state={recipients}
              onRetry={refresh}
              header={
                <View>
                  <DistributionProgress job={job} refreshing={refreshing} onRefresh={refresh} />
                  <DistributionFailureSummary
                    outcomes={outcomes}
                    onRetrySafe={retrySafe}
                    retryState={retryState}
                  />
                </View>
              }
            />
            <View style={styles.footer}>
              <Pressable onPress={handleDone} style={styles.doneBtn}>
                <ThemedText style={styles.doneBtnText}>Done</ThemedText>
              </Pressable>
            </View>
          </View>
        )}
      </View>
    </ThemedView>
  );
};

type AuthorizationStepProps = {
  recipientCount: number;
  totalStroops: StroopAmount;
  state: AuthorizationState;
  onAuthorize: () => void;
  onBack: () => void;
};

/**
 * Explicit organization authorization gate. The mobile app never signs
 * institutional transactions itself; this action authorizes the server to start
 * the job (Requirement 18.4). A failure is shown honestly and never converted
 * into a success (Requirement 21.4).
 */
const AuthorizationStep = ({
  recipientCount,
  totalStroops,
  state,
  onAuthorize,
  onBack,
}: AuthorizationStepProps) => {
  const submitting = state.status === 'submitting';
  return (
    <View style={styles.authContainer}>
      <View style={styles.authCard}>
        <FontAwesome name="shield" size={40} color={BrandColors.navy} />
        <ThemedText style={styles.authTitle}>Authorize this distribution</ThemedText>
        <ThemedText style={styles.authSubtitle}>
          You are authorizing aid for {recipientCount} recipient{recipientCount === 1 ? '' : 's'}.
          The server will prepare, sign, and submit the transfers. Confirmation appears only after
          on-chain reconciliation.
        </ThemedText>

        <View style={styles.authStat}>
          <ThemedText style={styles.authStatLabel}>Recipients</ThemedText>
          <ThemedText style={styles.authStatValue}>{recipientCount}</ThemedText>
        </View>
        <View style={styles.authStat}>
          <ThemedText style={styles.authStatLabel}>Total (Testnet, no real value)</ThemedText>
          <ThemedText style={styles.authStatValue}>{formatTotal(totalStroops)} RCPHP</ThemedText>
        </View>

        {state.status === 'error' && (
          <ThemedText style={styles.authError}>{state.error.message}</ThemedText>
        )}
      </View>

      <View style={styles.authFooter}>
        <Pressable onPress={onBack} style={styles.backBtn} disabled={submitting}>
          <ThemedText style={styles.backBtnText}>Back</ThemedText>
        </Pressable>
        <Pressable
          onPress={onAuthorize}
          disabled={submitting || recipientCount === 0}
          style={[styles.authBtn, (submitting || recipientCount === 0) && styles.authBtnDisabled]}
        >
          <ThemedText style={styles.authBtnText}>
            {submitting ? 'Authorizing…' : 'Authorize & Start'}
          </ThemedText>
        </Pressable>
      </View>
    </View>
  );
};

const formatTotal = (stroops: StroopAmount): string => {
  const total = BigInt(stroops) / BigInt(RCPHP_DECIMALS);
  return total.toLocaleString();
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFC',
  },
  header: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.two,
    backgroundColor: 'white',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: '#E5E7EB',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  closeBtn: {
    padding: 4,
  },
  title: {
    fontSize: 15,
    fontWeight: 'bold',
    color: BrandColors.navy,
  },
  progress: {
    fontSize: 11,
    fontWeight: 'bold',
    color: BrandColors.grey,
  },
  content: {
    flex: 1,
  },
  observeContainer: {
    flex: 1,
  },
  footer: {
    padding: Spacing.four,
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderColor: '#E5E7EB',
  },
  doneBtn: {
    height: 50,
    backgroundColor: BrandColors.navy,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
  },
  doneBtnText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  authContainer: {
    flex: 1,
    justifyContent: 'space-between',
  },
  authCard: {
    margin: Spacing.four,
    backgroundColor: 'white',
    borderRadius: 16,
    padding: Spacing.five,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    gap: Spacing.three,
  },
  authTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: BrandColors.navy,
    textAlign: 'center',
  },
  authSubtitle: {
    fontSize: 13,
    color: BrandColors.grey,
    textAlign: 'center',
    lineHeight: 19,
  },
  authStat: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    paddingTop: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E2E8F0',
  },
  authStatLabel: {
    fontSize: 13,
    color: BrandColors.grey,
    flex: 1,
    marginRight: Spacing.two,
  },
  authStatValue: {
    fontSize: 15,
    fontWeight: 'bold',
    color: BrandColors.navy,
  },
  authError: {
    fontSize: 13,
    color: '#B91C1C',
    textAlign: 'center',
  },
  authFooter: {
    flexDirection: 'row',
    gap: Spacing.three,
    padding: Spacing.four,
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderColor: '#E5E7EB',
  },
  backBtn: {
    height: 50,
    paddingHorizontal: Spacing.five,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  backBtnText: {
    color: BrandColors.navy,
    fontSize: 15,
    fontWeight: 'bold',
  },
  authBtn: {
    flex: 1,
    height: 50,
    backgroundColor: BrandColors.green,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
  },
  authBtnDisabled: {
    backgroundColor: BrandColors.lightGray,
  },
  authBtnText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
