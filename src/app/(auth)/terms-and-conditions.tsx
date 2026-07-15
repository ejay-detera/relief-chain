import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TermsAndConditionsContent } from '@/components/TermsAndConditions/TermsAndConditionsContent';
import { termsStyles as styles } from '@/components/TermsAndConditions/styles';

const TermsAndConditionsScreen = () => {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safeArea}>
      <TermsAndConditionsContent onClose={() => router.back()} />
    </SafeAreaView>
  );
};

export default TermsAndConditionsScreen;
