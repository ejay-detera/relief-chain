import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, SafeAreaView, ScrollView } from 'react-native';

import { ApplicationReviewContent } from '@/components/ApplicationReview/ApplicationReviewContent';
import type { ResubmitFormData } from '@/components/ApplicationReview/resubmitValidation';
import { applicationReviewStyles as styles } from '@/components/ApplicationReview/styles';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/context/AuthContext';
import { resubmitRegistration } from '@/services/registrationService';
import { getRoleHome } from '@/utils/auth-routing';
import { submitResubmission } from '@/utils/resubmission';

/**
 * The Application_Review_Screen (Requirements 11.1, 11.2, 12.1, 13.1, 13.2):
 * replaces `registration-success` as the destination for an `lgu` user whose
 * Registration_Status is `Pending` or `Rejected`. This route only owns
 * state/navigation; all rendering logic lives in `ApplicationReviewContent`,
 * driven purely by `profile.registration`.
 *
 * Resubmission wiring (Task 16, Requirements 15.3, 15.6): `handleResubmit`
 * calls `registrationService.resubmitRegistration` via the dependency-
 * injected, pure `submitResubmission` orchestrator (`utils/resubmission.ts`),
 * then either navigates back to this route (so the freshly-`Pending`
 * registration renders the same under-review messaging as a new sign-up) or
 * surfaces the failure through the existing `Alert.alert` pattern. Either
 * way, `refreshProfile()` runs first so `profile.registration.status`
 * reflects the actual current status — never a stale `Rejected` value, even
 * when the update was refused because a Super_Admin decision landed
 * concurrently (Requirement 15.2). `ResubmitForm` already gates calling this
 * callback on successful client-side validation (Task 13.2).
 */
const ApplicationReviewScreen = () => {
  const router = useRouter();
  const { session, profile, isLoading, profileError, refreshProfile } = useAuth();
  const [isResubmitting, setIsResubmitting] = useState(false);

  useEffect(() => {
    if (isLoading || profileError) return;
    if (!session) {
      router.replace('/(auth)/choose-account');
      return;
    }
    if (!profile) return;

    // Only lgu users with a non-Approved registration belong on this screen.
    // Approved lgu users (and any other role) are routed to their normal
    // home; RootLayoutNav (Task 15) is the authoritative guard for this,
    // this is a defensive fallback for direct navigation to this route.
    if (profile.role !== 'lgu' || profile.registration?.status === 'Approved') {
      router.replace(getRoleHome(profile.role));
    }
  }, [isLoading, profile, profileError, router, session]);

  const handleResubmit = async (data: ResubmitFormData) => {
    const registrationId = profile?.registration?.id;
    if (!registrationId) return;

    setIsResubmitting(true);
    try {
      const outcome = await submitResubmission(registrationId, data, { resubmitRegistration, refreshProfile });
      if (outcome.kind === 'success') {
        // Re-navigate to this same route so it re-renders from the
        // now-Pending registration, mirroring how a fresh lgu sign-up
        // lands here with the identical under-review messaging (Req 15.6).
        router.replace('/(auth)/application-review');
        return;
      }
      Alert.alert('Resubmission failed', outcome.message);
    } finally {
      setIsResubmitting(false);
    }
  };

  return (
    <ThemedView style={styles.page}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <ApplicationReviewContent
            isResubmitting={isResubmitting}
            onResubmit={(data) => void handleResubmit(data)}
            onRetry={() => void refreshProfile()}
            registration={profile?.registration}
          />
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
};

export default ApplicationReviewScreen;
