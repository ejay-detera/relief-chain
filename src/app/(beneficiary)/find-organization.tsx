import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, BrandColors, Spacing } from '@/constants/theme';

import { OrganizationProgramList } from '@/components/beneficiary/FindOrganization/organization-program-list';
import { VerificationRequiredBanner } from '@/components/beneficiary/FindOrganization/verification-required-banner';

import { useAuth } from '@/context/AuthContext';
import { useOrganizationPrograms } from '@/hooks/use-organization-programs';
import { OrganizationProgram } from '@/types/organization';

export default function FindOrganizationScreen() {
  const { profile } = useAuth();
  const { organizations, isLoading, error, retry, applyToProgram } = useOrganizationPrograms();

  const isVerified = profile?.verification_status === 'Verified';

  const handleApply = async (program: OrganizationProgram) => {
    try {
      await applyToProgram(program);
      Alert.alert('Application Submitted', `Your application to ${program.programName} was submitted.`);
    } catch {
      Alert.alert('Application Failed', 'We could not submit your application. Please try again.');
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <ThemedText style={styles.title}>Find Organization</ThemedText>
          <ThemedText style={styles.subtitle}>Locate relief organizations with ongoing programs.</ThemedText>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {!isVerified && <VerificationRequiredBanner />}

          <OrganizationProgramList
            applyDisabled={!isVerified}
            error={error}
            isLoading={isLoading}
            onApply={handleApply}
            onRetry={retry}
            organizations={organizations}
          />
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFC',
  },
  safeArea: {
    flex: 1,
  },
  header: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.six,
    paddingBottom: Spacing.four,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: BrandColors.navy,
    marginBottom: Spacing.one,
  },
  subtitle: {
    fontSize: 13,
    color: BrandColors.grey,
    lineHeight: 18,
  },
  scrollContent: {
    paddingBottom: BottomTabInset + Spacing.six,
  },
});
