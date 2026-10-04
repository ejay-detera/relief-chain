import { FontAwesome } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';

interface Props {
  isExportingPdf: boolean;
  isExportingExcel: boolean;
  onExportPdf: () => void;
  onExportExcel: () => void;
}

export const ReportExportBar = ({
  isExportingPdf,
  isExportingExcel,
  onExportPdf,
  onExportExcel,
}: Props) => {
  const isBusy = isExportingPdf || isExportingExcel;

  return (
    <View style={styles.container}>
      {isBusy && (
        <View style={styles.progressBanner}>
          <ActivityIndicator color={BrandColors.navy} size="small" />
          <ThemedText style={styles.progressText}>
            {isExportingPdf ? 'Compiling reconciled PDF document...' : 'Preparing Excel spreadsheet export...'}
          </ThemedText>
        </View>
      )}

      <View style={styles.actionsRow}>
        {/* PDF Export Button */}
        <Pressable
          accessibilityLabel="Export report to PDF"
          accessibilityRole="button"
          disabled={isBusy}
          onPress={onExportPdf}
          style={[styles.button, styles.pdfButton, isBusy && styles.buttonDisabled]}
        >
          {isExportingPdf ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <>
              <FontAwesome color="#FFFFFF" name="file-pdf-o" size={14} />
              <ThemedText style={styles.buttonText}>Export PDF</ThemedText>
            </>
          )}
        </Pressable>

        {/* Excel Export Button */}
        <Pressable
          accessibilityLabel="Export report to Excel"
          accessibilityRole="button"
          disabled={isBusy}
          onPress={onExportExcel}
          style={[styles.button, styles.excelButton, isBusy && styles.buttonDisabled]}
        >
          {isExportingExcel ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <>
              <FontAwesome color="#FFFFFF" name="file-excel-o" size={14} />
              <ThemedText style={styles.buttonText}>Export Excel</ThemedText>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.four,
    marginBottom: Spacing.four,
  },
  progressBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.three,
    paddingVertical: 8,
    marginBottom: Spacing.two,
  },
  progressText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 12,
    color: '#1D4ED8',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: BorderRadius.md,
  },
  pdfButton: {
    backgroundColor: BrandColors.navy,
  },
  excelButton: {
    backgroundColor: '#15803D',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13,
    color: '#FFFFFF',
  },
});
