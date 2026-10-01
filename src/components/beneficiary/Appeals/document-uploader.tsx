import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { FontAwesome } from '@expo/vector-icons';
import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';

export interface PickedFile {
  name: string;
  uri: string;
  size?: number;
  mimeType?: string;
}

interface Props {
  files: PickedFile[];
  onFilesChange: (files: PickedFile[]) => void;
  allowedTypes?: string[];
  maxFiles?: number;
}

export function DocumentUploader({
  files,
  onFilesChange,
  allowedTypes = ['image/*', 'application/pdf', 'application/msword'],
  maxFiles = 3,
}: Props) {
  const handlePickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: allowedTypes,
        copyToCacheDirectory: true,
        multiple: true,
      });

      if (!result.canceled && result.assets) {
        const newFiles: PickedFile[] = result.assets.map((asset) => ({
          name: asset.name,
          uri: asset.uri,
          size: asset.size,
          mimeType: asset.mimeType,
        }));

        const combined = [...files, ...newFiles].slice(0, maxFiles);
        onFilesChange(combined);
      }
    } catch (err) {
      console.warn('Error picking document:', err);
    }
  };

  const handleRemoveFile = (index: number) => {
    const updated = files.filter((_, idx) => idx !== index);
    onFilesChange(updated);
  };

  const formatFileSize = (bytes?: number): string => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <View style={styles.container}>
      <ThemedText style={styles.label}>Supporting Documents (Optional)</ThemedText>
      <ThemedText style={styles.helpText}>
        Upload valid IDs, barangay certificates, or income slips (PDF, PNG, JPG, DOCX).
      </ThemedText>

      {files.length < maxFiles && (
        <Pressable onPress={handlePickDocument} style={styles.uploadArea}>
          <FontAwesome name="cloud-upload" size={24} color={BrandColors.navy} />
          <ThemedText style={styles.uploadText}>Tap to attach files</ThemedText>
          <ThemedText style={styles.uploadSubtext}>
            Max {maxFiles} files · Up to 10MB each
          </ThemedText>
        </Pressable>
      )}

      {files.length > 0 && (
        <View style={styles.fileList}>
          {files.map((file, idx) => (
            <View key={idx} style={styles.fileItem}>
              <FontAwesome name="file-text-o" size={16} color={BrandColors.navy} />
              <View style={styles.fileInfo}>
                <ThemedText style={styles.fileName} numberOfLines={1}>
                  {file.name}
                </ThemedText>
                {file.size && (
                  <ThemedText style={styles.fileSize}>{formatFileSize(file.size)}</ThemedText>
                )}
              </View>
              <Pressable
                onPress={() => handleRemoveFile(idx)}
                style={styles.removeButton}
                accessibilityLabel="Remove file"
              >
                <FontAwesome name="trash-o" size={15} color="#DC2626" />
              </Pressable>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.four,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: BrandColors.navy,
    marginBottom: 4,
  },
  helpText: {
    fontSize: 12,
    color: BrandColors.grey,
    marginBottom: Spacing.two,
  },
  uploadArea: {
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderStyle: 'dashed',
    borderRadius: BorderRadius.md,
    backgroundColor: '#F8FAFC',
    padding: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadText: {
    fontSize: 14,
    fontWeight: '600',
    color: BrandColors.navy,
    marginTop: Spacing.one,
  },
  uploadSubtext: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  fileList: {
    marginTop: Spacing.two,
    rowGap: Spacing.two,
  },
  fileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: BorderRadius.sm,
    padding: Spacing.two,
  },
  fileInfo: {
    flex: 1,
    marginLeft: Spacing.two,
    marginRight: Spacing.two,
  },
  fileName: {
    fontSize: 13,
    color: '#334155',
    fontWeight: '500',
  },
  fileSize: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 1,
  },
  removeButton: {
    padding: Spacing.one,
  },
});
