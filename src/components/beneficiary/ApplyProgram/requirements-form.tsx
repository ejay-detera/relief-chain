import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import { uploadBeneficiaryDocument } from '@/services/document-upload-service';
import { ProgramRequirement, RequirementResponseInput } from '@/types/program-requirement';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';
import { PickedFile } from '../Appeals/document-uploader';
import { RequirementItem } from './requirement-item';

interface Props {
  requirements: ProgramRequirement[];
  isSubmitting: boolean;
  onSubmit: (responses: RequirementResponseInput[]) => Promise<void>;
}

export function RequirementsForm({ requirements, isSubmitting, onSubmit }: Props) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [filesMap, setFilesMap] = useState<Record<string, PickedFile[]>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isUploading, setIsUploading] = useState(false);

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

    try {
      setIsUploading(true);
      // Upload any document-type responses to Storage first — the raw
      // picker `uri` is a local path on this device only, so without this
      // step an org reviewer on another device could never open what the
      // beneficiary attached.
      const responses: RequirementResponseInput[] = await Promise.all(
        requirements.map(async (req) => {
          const files = filesMap[req.id] ?? [];
          const value = values[req.id];
          const fileUrl =
            files.length > 0 ? await uploadBeneficiaryDocument(files[0], 'requirements') : undefined;
          return {
            requirementId: req.id,
            value,
            fileUrl,
          };
        })
      );

      await onSubmit(responses);
    } catch (err) {
      Alert.alert(
        'Upload Failed',
        err instanceof Error ? err.message : 'Could not upload one or more documents. Please try again.'
      );
    } finally {
      setIsUploading(false);
    }
  };

  const busy = isSubmitting || isUploading;

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
        style={[styles.submitButton, busy && styles.submitButtonDisabled]}
        onPress={validateAndSubmit}
        disabled={busy}
      >
        {busy ? (
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
