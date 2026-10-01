import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import { DocumentUploader, PickedFile } from './document-uploader';

interface Props {
  programName?: string;
  isSubmitting: boolean;
  onSubmit: (reason: string, documentUrls: string[]) => Promise<void>;
}

export function AppealForm({ programName, isSubmitting, onSubmit }: Props) {
  const [reason, setReason] = useState('');
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async () => {
    const trimmed = reason.trim();
    if (trimmed.length < 10) {
      setErrorMessage('Please provide a detailed explanation (at least 10 characters).');
      return;
    }
    setErrorMessage(null);

    try {
      const documentUrls = files.map((f) => f.uri);
      await onSubmit(trimmed, documentUrls);
    } catch (err) {
      Alert.alert('Submission Error', err instanceof Error ? err.message : 'Failed to submit appeal.');
    }
  };

  return (
    <View style={styles.container}>
      {programName && (
        <View style={styles.programBanner}>
          <ThemedText style={styles.programBannerLabel}>Appealing rejection for:</ThemedText>
          <ThemedText style={styles.programBannerName}>{programName}</ThemedText>
        </View>
      )}

      <View style={styles.inputGroup}>
        <ThemedText style={styles.inputLabel}>Remarks & Justification</ThemedText>
        <ThemedText style={styles.inputHelp}>
          Explain why your application meets the eligibility criteria and clarify any missing details.
        </ThemedText>
        <TextInput
          style={[styles.textArea, errorMessage ? styles.textAreaError : null]}
          multiline
          numberOfLines={5}
          textAlignVertical="top"
          placeholder="Describe your household situation, updated documents, or corrections..."
          placeholderTextColor="#94A3B8"
          value={reason}
          onChangeText={(text) => {
            setReason(text);
            if (errorMessage) setErrorMessage(null);
          }}
          maxLength={2000}
        />
        <ThemedText style={styles.characterCount}>{reason.length}/2000</ThemedText>
      </View>

      {errorMessage && (
        <ThemedText style={styles.errorText}>{errorMessage}</ThemedText>
      )}

      <DocumentUploader files={files} onFilesChange={setFiles} />

      <Pressable
        style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
        onPress={handleSubmit}
        disabled={isSubmitting}
      >
        {isSubmitting ? (
          <ActivityIndicator color="white" />
        ) : (
          <ThemedText style={styles.submitButtonText}>Submit Appeal</ThemedText>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'white',
    borderRadius: BorderRadius.lg,
    padding: Spacing.four,
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
  },
  programBanner: {
    backgroundColor: '#F1F5F9',
    borderRadius: BorderRadius.md,
    padding: Spacing.three,
    marginBottom: Spacing.four,
  },
  programBannerLabel: {
    fontSize: 11,
    color: BrandColors.grey,
    textTransform: 'uppercase',
  },
  programBannerName: {
    fontSize: 15,
    fontWeight: '700',
    color: BrandColors.navy,
    marginTop: 2,
  },
  inputGroup: {
    marginBottom: Spacing.three,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: BrandColors.navy,
    marginBottom: 4,
  },
  inputHelp: {
    fontSize: 12,
    color: BrandColors.grey,
    marginBottom: Spacing.two,
    lineHeight: 16,
  },
  textArea: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: BorderRadius.md,
    padding: Spacing.three,
    fontSize: 14,
    color: '#1E293B',
    minHeight: 120,
    backgroundColor: '#F8FAFC',
  },
  textAreaError: {
    borderColor: '#EF4444',
  },
  characterCount: {
    fontSize: 11,
    color: '#94A3B8',
    textAlign: 'right',
    marginTop: 4,
  },
  errorText: {
    fontSize: 12,
    color: '#EF4444',
    marginBottom: Spacing.two,
  },
  submitButton: {
    backgroundColor: BrandColors.navy,
    borderRadius: BorderRadius.md,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.two,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '700',
  },
});
