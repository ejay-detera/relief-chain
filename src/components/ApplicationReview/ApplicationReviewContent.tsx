import { FontAwesome } from '@expo/vector-icons';
import { View } from 'react-native';

import { ErrorState } from '@/components/shared/error-state';
import { ThemedText } from '@/components/themed-text';
import type { RegistrationSummary } from '@/types/registration';

import { resolveApplicationReviewMessage } from './messaging';
import { ResubmitForm } from './ResubmitForm';
import type { ResubmitFormData } from './resubmitValidation';
import { applicationReviewStyles as styles } from './styles';

type ApplicationReviewContentProps = {
  registration: RegistrationSummary | null | undefined;
  isResubmitting?: boolean;
  onResubmit: (data: ResubmitFormData) => void;
  onRetry: () => void;
};

/**
 * Renders the Application_Review_Screen's content purely from a
 * `RegistrationSummary` (Requirements 11.2, 12.1, 13.1, 13.2):
 * - `Pending` → under-review messaging only.
 * - `Rejected` → the exact recorded Rejection_Reason plus a resubmit option.
 * - Otherwise (no data yet, an unresolved reason, or `Approved` — which
 *   `RootLayoutNav` never routes here in the first place) → this component
 *   guards on the messaging being resolvable and falls back to the existing
 *   generic error state instead of rendering broken content (Requirement 11.3).
 */
export const ApplicationReviewContent = ({ registration, isResubmitting = false, onResubmit, onRetry }: ApplicationReviewContentProps) => {
  const message = resolveApplicationReviewMessage(registration);

  if (!message) {
    return <ErrorState message="We couldn't load your application status. Please try again." onRetry={onRetry} />;
  }

  if (message.kind === 'under-review') {
    return (
      <View style={styles.content}>
        <View style={styles.icon}>
          <FontAwesome color="#FFFFFF" name="hourglass-half" size={28} />
        </View>
        <ThemedText style={styles.title}>Application under review</ThemedText>
        <ThemedText style={styles.message}>
          Thanks for applying. Our team is reviewing your organization&apos;s application. We&apos;ll let you know as soon as a decision is made.
        </ThemedText>
      </View>
    );
  }

  return (
    <View style={styles.content}>
      <View style={[styles.icon, styles.iconRejected]}>
        <FontAwesome color="#FFFFFF" name="times" size={28} />
      </View>
      <ThemedText style={styles.title}>Application not approved</ThemedText>
      <View style={styles.reasonCard}>
        <ThemedText style={styles.reasonLabel}>Reason</ThemedText>
        <ThemedText style={styles.reasonText}>{message.reason}</ThemedText>
      </View>
      <ThemedText style={styles.message}>You can update your details below and resubmit your application for another review.</ThemedText>
      <ResubmitForm isSubmitting={isResubmitting} onResubmit={onResubmit} />
    </View>
  );
};
