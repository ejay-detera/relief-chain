import React from 'react';
import { View, StyleSheet, ScrollView, Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { useCreateProgram } from './_layout';
import { StepIndicator } from '@/components/CreateProgram/StepIndicator';
import { WizardNavigation } from '@/components/CreateProgram/WizardNavigation';
import { BrandColors, BorderRadius, Spacing } from '@/constants/theme';

export default function DocumentsScreen() {
  const router = useRouter();
  const { draft, updateDraft } = useCreateProgram();

  const handleNext = () => {
    router.push('/(lgu)/create-program/summary' as any);
  };

  const handleBack = () => {
    router.back();
  };

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        const newDoc = {
          uri: file.uri,
          name: file.name,
          size: file.size,
        };
        updateDraft({
          supportingDocuments: [...draft.supportingDocuments, newDoc],
        });
      }
    } catch (err) {
      console.log('Error picking document:', err);
    }
  };

  const removeDocument = (uri: string) => {
    const updated = draft.supportingDocuments.filter((doc) => doc.uri !== uri);
    updateDraft({ supportingDocuments: updated });
  };

  const formatBytes = (bytes?: number) => {
    if (!bytes) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <View style={styles.container}>
      <StepIndicator currentStep={7} title="Supporting Documents" />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.sectionDescription}>
          Optionally upload any supporting program guidelines, office memorandums, or event details to attach to this program draft.
        </Text>

        <TouchableOpacity style={styles.uploadArea} onPress={pickDocument}>
          <Text style={styles.uploadIcon}>📁</Text>
          <Text style={styles.uploadTitle}>Choose file or document</Text>
          <Text style={styles.uploadSubtitle}>PDF, DOC, images up to 10MB</Text>
        </TouchableOpacity>

        {draft.supportingDocuments.length > 0 ? (
          <View style={styles.listContainer}>
            <Text style={styles.listTitle}>Selected Documents ({draft.supportingDocuments.length})</Text>
            {draft.supportingDocuments.map((item) => (
              <View key={item.uri} style={styles.docRow}>
                <View style={styles.docIconContainer}>
                  <Text style={styles.docIcon}>📄</Text>
                </View>
                <View style={styles.docInfo}>
                  <Text style={styles.docName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.docSize}>{formatBytes(item.size)}</Text>
                </View>
                <TouchableOpacity onPress={() => removeDocument(item.uri)} style={styles.deleteBtn}>
                  <Text style={styles.deleteBtnText}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>

      <WizardNavigation onBack={handleBack} onNext={handleNext} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF9F6',
  },
  scrollContent: {
    padding: Spacing.three,
    paddingBottom: Spacing.six,
  },
  sectionDescription: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: BrandColors.grey,
    lineHeight: 20,
    marginBottom: Spacing.four,
  },
  uploadArea: {
    height: 160,
    borderWidth: 2,
    borderColor: BrandColors.lightGray,
    borderStyle: 'dashed',
    borderRadius: BorderRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginBottom: Spacing.four,
  },
  uploadIcon: {
    fontSize: 32,
    marginBottom: Spacing.two,
  },
  uploadTitle: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: BrandColors.navy,
    marginBottom: 4,
  },
  uploadSubtitle: {
    fontSize: 11,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: BrandColors.grey,
  },
  listContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: BrandColors.lightGray,
    padding: Spacing.three,
  },
  listTitle: {
    fontSize: 12,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: BrandColors.navy,
    marginBottom: Spacing.two,
    textTransform: 'uppercase',
  },
  docRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.two,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  docIconContainer: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.sm,
    backgroundColor: '#FAF9F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.three,
  },
  docIcon: {
    fontSize: 18,
  },
  docInfo: {
    flex: 1,
  },
  docName: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: BrandColors.navy,
  },
  docSize: {
    fontSize: 11,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: BrandColors.grey,
    marginTop: 2,
  },
  deleteBtn: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteBtnText: {
    fontSize: 16,
    color: 'red',
  },
});
