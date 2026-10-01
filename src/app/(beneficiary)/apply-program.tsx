import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome } from '@expo/vector-icons';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { LogoHeader } from '@/components/LogoHeader/LogoHeader';
import { RequirementsForm } from '@/components/beneficiary/ApplyProgram/requirements-form';
import { BottomTabInset, BrandColors, MaxContentWidth, Spacing, BorderRadius } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useOrganizationPrograms } from '@/hooks/use-organization-programs';
import { fetchProgramRequirements } from '@/services/program-requirements-service';
import { ProgramRequirement, RequirementResponseInput } from '@/types/program-requirement';

export default function ApplyProgramScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    programId?: string;
    programName?: string;
    voucherType?: string;
  }>();

  const { profile } = useAuth();
  const { organizations, applyToProgram } = useOrganizationPrograms();

  const [requirements, setRequirements] = useState<ProgramRequirement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedProgram = organizations.find((p) => p.id === params.programId);

  useEffect(() => {
    async function loadReqs() {
      if (!params.programId) return;
      setIsLoading(true);
      try {
        const reqs = await fetchProgramRequirements(params.programId);
        setRequirements(reqs);
      } catch (err) {
        console.warn('Error fetching requirements:', err);
      } finally {
        setIsLoading(false);
      }
    }
    loadReqs();
  }, [params.programId]);

  const handleSubmit = async (responses?: RequirementResponseInput[]) => {
    if (!selectedProgram) {
      Alert.alert('Error', 'Program information could not be resolved.');
      return;
    }

    setIsSubmitting(true);
    try {
      const enrollmentId = await applyToProgram(selectedProgram, responses);

      Alert.alert(
        'Application Submitted',
        `Your application to ${selectedProgram.programName} has been submitted. Status is set to Registered.`,
        [
          {
            text: 'Track Application Status',
            onPress: () =>
              router.replace({
                pathname: '/(beneficiary)/application-status',
                params: enrollmentId ? { enrollmentId } : undefined,
              }),
          },
          {
            text: 'Back to Programs',
            style: 'cancel',
            onPress: () => router.back(),
          },
        ]
      );
    } catch (err) {
      Alert.alert(
        'Application Failed',
        err instanceof Error ? err.message : 'Could not submit your application. Please try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <LogoHeader />

          <View style={styles.navBar}>
            <Pressable onPress={() => router.back()} style={styles.backButton}>
              <FontAwesome name="arrow-left" size={16} color={BrandColors.navy} />
            </Pressable>
            <ThemedText style={styles.screenTitle}>Program Application</ThemedText>
            <View style={styles.placeholder} />
          </View>

          <View style={styles.content}>
            {/* Program Card */}
            <View style={styles.programSummaryCard}>
              <ThemedText style={styles.programLabel}>Assistance Program</ThemedText>
              <ThemedText style={styles.programName}>
                {params.programName || selectedProgram?.programName || 'Relief Program'}
              </ThemedText>
              <ThemedText style={styles.programVoucherType}>
                Category: {params.voucherType || selectedProgram?.voucherType || 'General Aid'}
              </ThemedText>
            </View>

            {/* Applicant Profile Confirmation */}
            <View style={styles.profileCard}>
              <ThemedText style={styles.sectionHeading}>Applicant Information</ThemedText>
              <View style={styles.profileRow}>
                <ThemedText style={styles.profileLabel}>Full Name:</ThemedText>
                <ThemedText style={styles.profileValue}>{profile?.full_name || '—'}</ThemedText>
              </View>
              <View style={styles.profileRow}>
                <ThemedText style={styles.profileLabel}>Government ID:</ThemedText>
                <ThemedText style={styles.profileValue}>{profile?.gov_id || 'Not verified'}</ThemedText>
              </View>
              <View style={styles.profileRow}>
                <ThemedText style={styles.profileLabel}>Address / Location:</ThemedText>
                <ThemedText style={styles.profileValue}>{profile?.complete_address || profile?.location || '—'}</ThemedText>
              </View>
            </View>

            {/* Dynamic Requirements or Standard Confirmation */}
            {isLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator color={BrandColors.navy} />
                <ThemedText style={styles.loadingText}>Checking program requirements…</ThemedText>
              </View>
            ) : requirements.length > 0 ? (
              <View>
                <ThemedText style={styles.sectionHeading}>Additional Requirements</ThemedText>
                <ThemedText style={styles.sectionSubtext}>
                  This program specifies the following custom criteria. Please complete all required items before submitting.
                </ThemedText>
                <RequirementsForm
                  requirements={requirements}
                  isSubmitting={isSubmitting}
                  onSubmit={handleSubmit}
                />
              </View>
            ) : (
              <View style={styles.noReqsCard}>
                <FontAwesome name="check-circle" size={32} color={BrandColors.green} />
                <ThemedText style={styles.noReqsTitle}>No Additional Documents Required</ThemedText>
                <ThemedText style={styles.noReqsSubtext}>
                  Your registered profile and verified credentials satisfy the preliminary eligibility criteria for this program.
                </ThemedText>

                <Pressable
                  style={[styles.directSubmitButton, isSubmitting && styles.directSubmitButtonDisabled]}
                  onPress={() => handleSubmit([])}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <ThemedText style={styles.directSubmitText}>Confirm & Submit Application</ThemedText>
                  )}
                </Pressable>
              </View>
            )}
          </View>
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
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    width: '100%',
  },
  scrollContent: {
    paddingBottom: BottomTabInset + Spacing.six,
  },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    marginBottom: Spacing.three,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  },
  screenTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: BrandColors.navy,
  },
  placeholder: {
    width: 36,
  },
  content: {
    paddingHorizontal: Spacing.four,
  },
  programSummaryCard: {
    backgroundColor: BrandColors.navy,
    borderRadius: BorderRadius.lg,
    padding: Spacing.four,
    marginBottom: Spacing.three,
  },
  programLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
    textTransform: 'uppercase',
  },
  programName: {
    fontSize: 17,
    fontWeight: '700',
    color: 'white',
    marginVertical: 4,
  },
  programVoucherType: {
    fontSize: 12,
    color: BrandColors.green,
    fontWeight: '600',
  },
  profileCard: {
    backgroundColor: 'white',
    borderRadius: BorderRadius.md,
    padding: Spacing.four,
    marginBottom: Spacing.three,
    boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
  },
  sectionHeading: {
    fontSize: 15,
    fontWeight: '700',
    color: BrandColors.navy,
    marginBottom: Spacing.two,
  },
  sectionSubtext: {
    fontSize: 12,
    color: BrandColors.grey,
    marginBottom: Spacing.three,
    lineHeight: 16,
  },
  profileRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  profileLabel: {
    fontSize: 13,
    color: BrandColors.grey,
  },
  profileValue: {
    fontSize: 13,
    fontWeight: '600',
    color: BrandColors.navy,
  },
  loadingContainer: {
    padding: Spacing.six,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 12,
    color: BrandColors.grey,
    marginTop: Spacing.two,
  },
  noReqsCard: {
    backgroundColor: 'white',
    borderRadius: BorderRadius.lg,
    padding: Spacing.five,
    alignItems: 'center',
    boxShadow: '0 2px 6px rgba(0,0,0,0.05)',
    marginTop: Spacing.two,
  },
  noReqsTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: BrandColors.navy,
    marginTop: Spacing.two,
    marginBottom: 4,
  },
  noReqsSubtext: {
    fontSize: 12,
    color: BrandColors.grey,
    textAlign: 'center',
    lineHeight: 16,
    marginBottom: Spacing.four,
  },
  directSubmitButton: {
    backgroundColor: BrandColors.green,
    borderRadius: BorderRadius.md,
    paddingVertical: 14,
    paddingHorizontal: Spacing.six,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  directSubmitButtonDisabled: {
    opacity: 0.6,
  },
  directSubmitText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '700',
  },
});
