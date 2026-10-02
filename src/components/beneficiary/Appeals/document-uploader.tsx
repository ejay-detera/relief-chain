import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import { FontAwesome } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { Pressable, StyleSheet, View } from 'react-native';

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

// Default allow-list covers png/jpg/pdf/docx. `.docx` is OOXML
// (`application/vnd.openxmlformats-officedocument.wordprocessingml.document`),
// not the legacy `.doc` MIME type (`application/msword`) — both are included
// since some pickers/OSes still report the legacy type for `.doc` files.
const DEFAULT_ALLOWED_TYPES = [
  'image/*',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

// `program_requirements.allowed_file_types` (and `allowedTypes` passed down
// from `RequirementItem`) stores bare extension strings like 'png'/'docx',
// not MIME types — but `expo-document-picker`'s `type` option filters by
// MIME type. Passing the raw extension strings through unconverted silently
// disabled filtering on at least some platforms. This maps the stored
// extensions to real MIME types before handing them to the picker.
const EXTENSION_TO_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

const resolvePickerTypes = (allowed: string[]): string[] => {
  const resolved = allowed.map((entry) => {
    // Already a MIME type (contains a slash, e.g. 'image/*', 'application/pdf').
    if (entry.includes('/')) return entry;
    const normalized = entry.trim().toLowerCase().replace(/^\./, '');
    return EXTENSION_TO_MIME[normalized] ?? entry;
  });
  // De-duplicate in case e.g. 'jpg' and 'jpeg' both map to 'image/jpeg'.
  return Array.from(new Set(resolved));
};

export function DocumentUploader({
  files,
  onFilesChange,
  allowedTypes = DEFAULT_ALLOWED_TYPES,
  maxFiles = 3,
}: Props) {
  const handlePickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: resolvePickerTypes(allowedTypes),
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
