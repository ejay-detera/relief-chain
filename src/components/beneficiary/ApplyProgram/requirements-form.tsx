import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import { ProgramRequirement, RequirementResponseInput } from '@/types/program-requirement';
import { RequirementItem } from './requirement-item';
import { PickedFile } from '../Appeals/document-uploader';

interface Props {
  requirements: ProgramRequirement[];
  isSubmitting: boolean;
  onSubmit: (responses: RequirementResponseInput[]) => Promise<void>;
}

export function RequirementsForm({ requirements, isSubmitting, onSubmit }: Props) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [filesMap, setFilesMap] = useState<Record<string, PickedFile[]>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleValueChange = (reqId: string, val: string) => {
    setValues((prev) => ({ ...prev, [reqId]: val }));
    if (errors[reqId]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[reqId];
        return next;
      });
    }
  };

  const handleFilesChange = (reqId: string, files: PickedFile[]) => {
    setFilesMap((prev) => ({ ...prev, [reqId]: files }));
    if (errors[reqId]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[reqId];
        return next;
      });
    }
  };

  const validateAndSubmit = async () => {
    const newErrors: Record<string, string> = {};

    for (const req of requirements) {
      if (req.isMandatory) {
        if (req.type === 'document') {
          const files = filesMap[req.id] ?? [];
          if (files.length === 0) {
            newErrors[req.id] = 'Document upload is required.';
          }
        } else if (req.type === 'boolean') {
          if (values[req.id] !== 'true') {
            newErrors[req.id] = 'You must confirm this requirement.';
          }
        } else {
          const val = values[req.id]?.trim() ?? '';
          if (!val) {
            newErrors[req.id] = 'This field is required.';
          }
        }
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    // Build response array
    const responses: RequirementResponseInput[] = requirements.map((req) => {
      const files = filesMap[req.id] ?? [];
      const fileUrl = files.length > 0 ? files[0].uri : undefined;
      const value = values[req.id];
      return {
        requirementId: req.id,
        value,
        fileUrl,
      };
    });

    await onSubmit(responses);
  };

  return (
    <View style={styles.container}>
      {requirements.map((req) => (
        <RequirementItem
          key={req.id}
          requirement={req}
          value={values[req.id]}
          files={filesMap[req.id]}
          error={errors[req.id]}
          onValueChange={(val) => handleValueChange(req.id, val)}
          onFilesChange={(files) => handleFilesChange(req.id, files)}
        />
      ))}

      <Pressable
        style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
        onPress={validateAndSubmit}
        disabled={isSubmitting}
      >
        {isSubmitting ? (
          <ActivityIndicator color="white" />
        ) : (
          <ThemedText style={styles.submitButtonText}>Submit Application</ThemedText>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: Spacing.two,
  },
  submitButton: {
    backgroundColor: BrandColors.green,
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
