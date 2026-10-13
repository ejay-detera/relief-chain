import { Pressable, StyleSheet, View } from 'react-native';

import { InvoiceAmountForm } from '@/components/MerchantInvoice/InvoiceAmountForm';
import { FadeInView } from '@/components/shared/FadeInView';
import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import type { MerchantInvoiceDraft } from '@/types/invoice';

type Props = Readonly<{
  formError: string | null;
  canCreate: boolean;
  needsRecovery: boolean;
  isSubmitting: boolean;
  onSubmit: (draft: MerchantInvoiceDraft) => void;
  onStartRecovery: () => void;
}>;

const SIGNER_REQUIRED_TEXT = 'A verified merchant signer is required before you can create invoices.';

/** Amount entry when a verified signer is ready; otherwise an honest recovery prompt. */
export const InvoiceEntryView = ({ formError, canCreate, needsRecovery, isSubmitting, onSubmit, onStartRecovery }: Props) => (
  <FadeInView delay={40}>
    {formError && <ThemedText style={styles.error}>{formError}</ThemedText>}
    {canCreate ? (
      <InvoiceAmountForm autoFocus={false} isSubmitting={isSubmitting} onSubmit={onSubmit} />
    ) : needsRecovery ? (
      <View style={styles.recoveryBlock}>
        <ThemedText style={styles.helper}>{SIGNER_REQUIRED_TEXT}</ThemedText>
        <Pressable accessibilityRole="button" onPress={onStartRecovery} style={styles.recoveryButton}>
          <ThemedText style={styles.recoveryButtonText}>Start wallet recovery</ThemedText>
        </Pressable>
      </View>
    ) : (
      <ThemedText style={styles.helper}>{SIGNER_REQUIRED_TEXT}</ThemedText>
    )}
  </FadeInView>
);

const styles = StyleSheet.create({
  helper: { color: BrandColors.grey, fontFamily: 'PlusJakartaSans_500Medium', fontSize: 13, lineHeight: 18 },
  error: { color: '#C0392B', fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 13, marginBottom: Spacing.three },
  recoveryBlock: { gap: Spacing.two },
  recoveryButton: { alignItems: 'center', backgroundColor: BrandColors.navy, borderRadius: BorderRadius.xl, padding: Spacing.three },
  recoveryButtonText: { color: '#FFFFFF', fontFamily: 'PlusJakartaSans_700Bold', fontSize: 15 },
});
