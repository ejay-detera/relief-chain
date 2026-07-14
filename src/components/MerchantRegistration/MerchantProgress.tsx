import { FontAwesome } from '@expo/vector-icons';
import { Fragment } from 'react';
import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import type { MerchantRegistrationStep } from '@/types/merchant-registration';

import { merchantRegistrationStyles as styles } from './styles';

type MerchantProgressProps = {
  step: MerchantRegistrationStep;
};

const steps: MerchantRegistrationStep[] = [1, 2, 3, 4];

export function MerchantProgress({ step }: MerchantProgressProps) {
  return (
    <View style={styles.progress}>
      {steps.map((progressStep, index) => {
        const isComplete = progressStep < step;
        const isCurrent = progressStep === step;

        return (
          <Fragment key={progressStep}>
            <View
              style={[
                styles.progressCircle,
                (isComplete || isCurrent) && styles.progressCircleComplete,
              ]}
            >
              {isComplete ? (
                <FontAwesome color="#FFFFFF" name="check" size={14} />
              ) : (
                <ThemedText style={[styles.progressText, isCurrent && styles.progressTextCurrent]}>
                  {progressStep}
                </ThemedText>
              )}
            </View>
            {index < steps.length - 1 && <View style={styles.progressLine} />}
          </Fragment>
        );
      })}
    </View>
  );
}
