import { FontAwesome } from '@expo/vector-icons';
import { Fragment } from 'react';
import { Pressable, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';

import { registrationStyles as styles } from './styles';

type RegistrationProgressProps = {
  onStepPress: (step: number) => void;
  step: number;
  totalSteps: number;
};

export const RegistrationProgress = ({ onStepPress, step, totalSteps }: RegistrationProgressProps) => (
  <View style={styles.progress}>
    {Array.from({ length: totalSteps }, (_, index) => index + 1).map((progressStep, index) => {
      const isReached = progressStep <= step;
      const isComplete = progressStep < step;
      return (
        <Fragment key={progressStep}>
          <Pressable
            accessibilityLabel={`Go to step ${progressStep}`}
            accessibilityRole="button"
            disabled={!isReached}
            onPress={() => onStepPress(progressStep)}
            style={[styles.progressCircle, isReached && styles.progressCircleActive]}
          >
            {isComplete ? <FontAwesome color="#FFFFFF" name="check" size={13} /> : (
              <ThemedText style={[styles.progressText, isReached && styles.progressTextActive]}>{progressStep}</ThemedText>
            )}
          </Pressable>
          {index < totalSteps - 1 && <View style={styles.progressLine} />}
        </Fragment>
      );
    })}
  </View>
);
