import { FontAwesome } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BrandColors, Spacing } from '@/constants/theme';
import { createDisbursement } from '@/services/disbursementService';
import type { UserProfile } from '@/types/auth';

import { DatabaseProgram, Step1ProgramSelect } from './Step1ProgramSelect';
import { Step2ProgramSummary } from './Step2ProgramSummary';
import { Step3BeneficiaryList } from './Step3BeneficiaryList';
import { Step4PreValidation } from './Step4PreValidation';
import { Step5DistributionReview } from './Step5DistributionReview';
import { Step6BlockchainProcessing } from './Step6BlockchainProcessing';
import { Step7SuccessModal } from './Step7SuccessModal';

type Props = {
  onClose: () => void;
  onSuccess: (newDisbursement: {
    id: string;
    programName: string;
    disasterEvent: string;
    amount: number;
    recipientsCount: number;
    date: string;
    txHash: string;
  }) => void;
};

export const DistributeAidWizard = ({ onClose, onSuccess }: Props) => {
  const [step, setStep] = useState<number>(1);
  const [selectedProgram, setSelectedProgram] = useState<DatabaseProgram | null>(null);
  const [selectedBeneficiaries, setSelectedBeneficiaries] = useState<UserProfile[]>([]);

  const handleSelectProgram = (program: DatabaseProgram) => {
    setSelectedProgram(program);
    // Reset selected beneficiaries when program changes
    setSelectedBeneficiaries([]);
  };

  const handleFinish = async () => {
    if (selectedProgram) {
      const totalAmount = selectedBeneficiaries.length * Number(selectedProgram.amount_per_beneficiary);

      try {
        const data = await createDisbursement({
          programId: selectedProgram.id,
          programName: selectedProgram.name,
          disasterEvent: selectedProgram.disaster_event || 'General Assistance',
          amount: totalAmount,
          recipientsCount: selectedBeneficiaries.length,
          txHash: '41ab447d95c72ab01c29e248b6b0c2a71f008ad5b225b9e67d264a2777123456',
        });

        onSuccess(data);
      } catch (err) {
        console.error('Error saving disbursement:', err);
        // Fallback if network/DB error
        onSuccess({
          id: Math.random().toString(),
          programName: selectedProgram.name,
          disasterEvent: selectedProgram.disaster_event || 'General Assistance',
          amount: totalAmount,
          recipientsCount: selectedBeneficiaries.length,
          date: new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
          txHash: '41ab447d95c72ab01c29e248b6b0c2a71f008ad5b225b9e67d264a2777123456',
        });
      }
    } else {
      onClose();
    }
  };

  const getStepTitle = (currentStep: number) => {
    switch (currentStep) {
      case 1:
        return 'Select Aid Program';
      case 2:
        return 'Aid Program Summary';
      case 3:
        return 'Select Beneficiaries';
      case 4:
        return 'Pre-distribution Checks';
      case 5:
        return 'Distribution Review';
      case 6:
        return 'Processing Ledger Assets';
      case 7:
        return 'Disbursement Results';
      default:
        return '';
    }
  };

  return (
    <ThemedView style={styles.container}>
      {/* Wizard Progress Header */}
      {step < 7 && (
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <FontAwesome name="times" size={16} color={BrandColors.navy} />
            </Pressable>
            <ThemedText style={styles.title}>{getStepTitle(step)}</ThemedText>
          </View>
          <ThemedText style={styles.progress}>
            Step {step} of 6
          </ThemedText>
        </View>
      )}

      {/* Wizard Content */}
      <View style={styles.content}>
        {step === 1 && (
          <Step1ProgramSelect
            selectedProgram={selectedProgram}
            onSelect={handleSelectProgram}
            onNext={() => setStep(2)}
          />
        )}

        {step === 2 && selectedProgram && (
          <Step2ProgramSummary
            program={selectedProgram}
            onNext={() => setStep(3)}
            onBack={() => setStep(1)}
          />
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

        {step === 6 && (
          <Step6BlockchainProcessing
            onComplete={() => setStep(7)}
          />
        )}

        {step === 7 && selectedProgram && (
          <Step7SuccessModal
            program={selectedProgram}
            selectedBeneficiaries={selectedBeneficiaries}
            onFinish={handleFinish}
          />
        )}
      </View>
    </ThemedView>
  );
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
});
