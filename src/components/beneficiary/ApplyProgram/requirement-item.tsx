import React from 'react';
import { StyleSheet, Switch, TextInput, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import { ProgramRequirement } from '@/types/program-requirement';
import { DocumentUploader, PickedFile } from '../Appeals/document-uploader';

interface Props {
  requirement: ProgramRequirement;
  value?: string;
  files?: PickedFile[];
  error?: string;
  onValueChange: (val: string) => void;
  onFilesChange: (files: PickedFile[]) => void;
}

export function RequirementItem({
  requirement,
  value,
  files = [],
  error,
  onValueChange,
  onFilesChange,
}: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <ThemedText style={styles.label}>
          {requirement.label}
          {requirement.isMandatory && <ThemedText style={styles.mandatory}> *</ThemedText>}
        </ThemedText>
        {requirement.isMandatory && (
          <View style={styles.requiredBadge}>
            <ThemedText style={styles.requiredBadgeText}>Required</ThemedText>
          </View>
        )}
      </View>

      {requirement.description && (
        <ThemedText style={styles.description}>{requirement.description}</ThemedText>
      )}

      {/* Dynamic input based on requirement type */}
      {requirement.type === 'document' && (
        <DocumentUploader
          files={files}
          onFilesChange={onFilesChange}
          maxFiles={2}
          allowedTypes={requirement.allowedFileTypes}
        />
      )}

      {requirement.type === 'text' && (
        <TextInput
          style={[styles.input, error ? styles.inputError : null]}
          value={value ?? ''}
          onChangeText={onValueChange}
          placeholder="Enter details..."
          placeholderTextColor="#94A3B8"
        />
      )}

      {requirement.type === 'number' && (
        <TextInput
          style={[styles.input, error ? styles.inputError : null]}
          value={value ?? ''}
          onChangeText={onValueChange}
          keyboardType="numeric"
          placeholder="Enter number (e.g. 4)"
          placeholderTextColor="#94A3B8"
        />
      )}

      {requirement.type === 'boolean' && (
        <View style={styles.switchRow}>
          <ThemedText style={styles.switchLabel}>
            {value === 'true' ? 'Confirmed / Yes' : 'No / Unchecked'}
          </ThemedText>
          <Switch
            value={value === 'true'}
            onValueChange={(checked) => onValueChange(checked ? 'true' : 'false')}
            trackColor={{ false: '#CBD5E1', true: BrandColors.green }}
            thumbColor="white"
          />
        </View>
      )}

      {error && <ThemedText style={styles.errorText}>{error}</ThemedText>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'white',
    borderRadius: BorderRadius.md,
    padding: Spacing.three,
    marginBottom: Spacing.three,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: BrandColors.navy,
    flex: 1,
  },
  mandatory: {
    color: '#DC2626',
  },
  requiredBadge: {
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  requiredBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#DC2626',
  },
  description: {
    fontSize: 12,
    color: BrandColors.grey,
    marginBottom: Spacing.two,
    lineHeight: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.three,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1E293B',
    backgroundColor: '#F8FAFC',
  },
  inputError: {
    borderColor: '#EF4444',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.two,
  },
  switchLabel: {
    fontSize: 13,
    color: '#334155',
    fontWeight: '500',
  },
  errorText: {
    fontSize: 11,
    color: '#EF4444',
    marginTop: 4,
  },
});
