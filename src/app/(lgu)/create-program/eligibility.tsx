import React, { useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';

import { StepIndicator } from '@/components/CreateProgram/StepIndicator';
import { WizardNavigation } from '@/components/CreateProgram/WizardNavigation';
import { FadeInView } from '@/components/shared/FadeInView';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import { CsvBeneficiaryDraft, ProgramRequirementDraft } from '@/types/program';
import { useCreateProgram } from './_layout';

type EnrollmentMode = 'public' | 'private';
type RequirementType = 'document' | 'text' | 'number' | 'boolean';

export default function EligibilityScreen() {
  const router = useRouter();
  const { draft, updateDraft } = useCreateProgram();

  const [mode, setMode] = useState<EnrollmentMode>(draft.isPrivate ? 'private' : 'public');

  // Public requirements state
  const [requirements, setRequirements] = useState<ProgramRequirementDraft[]>(
    draft.requirements && draft.requirements.length > 0
      ? draft.requirements
      : [
          {
            label: 'Government-Issued Valid ID',
            type: 'document',
            isMandatory: true,
            description: 'Clear photo or PDF copy (PhilSys, Driver License, etc.)',
          },
          {
            label: 'Current Evacuation / Shelter Address',
            type: 'text',
            isMandatory: true,
            description: 'Temporary location of the affected household',
          },
          {
            label: 'Number of Dependent Children',
            type: 'number',
            isMandatory: true,
            description: 'Minor household dependents',
          },
          {
            label: 'Household includes Senior Citizen or PWD',
            type: 'boolean',
            isMandatory: false,
          },
        ]
  );

  // New requirement inputs
  const [newLabel, setNewLabel] = useState('');
  const [newType, setNewType] = useState<RequirementType>('document');
  const [newMandatory, setNewMandatory] = useState(true);

  // Private CSV state
  const [csvText, setCsvText] = useState('');
  const [parsedBeneficiaries, setParsedBeneficiaries] = useState<CsvBeneficiaryDraft[]>(
    draft.csvBeneficiaries || []
  );

  const handleNext = () => {
    if (mode === 'private' && parsedBeneficiaries.length === 0) {
      Alert.alert(
        'Upload Required',
        'Please upload or paste a CSV list with at least one beneficiary for a private program.'
      );
      return;
    }

    if (mode === 'public' && requirements.length === 0) {
      Alert.alert(
        'Requirements Needed',
        'Please define at least one application requirement for beneficiaries.'
      );
      return;
    }

    updateDraft({
      isPrivate: mode === 'private',
      requirements: mode === 'public' ? requirements : [],
      csvBeneficiaries: mode === 'private' ? parsedBeneficiaries : [],
      eligibilityCriteria:
        mode === 'public'
          ? requirements.map((r) => `${r.label} (${r.type}${r.isMandatory ? ', required' : ''})`)
          : [`Private program: ${parsedBeneficiaries.length} pre-vetted CSV beneficiaries`],
    });

    router.push('/(lgu)/create-program/voucher' as any);
  };

  const handleBack = () => {
    router.back();
  };

  const addRequirement = () => {
    if (!newLabel.trim()) {
      Alert.alert('Label Required', 'Please enter a requirement label.');
      return;
    }
    setRequirements((prev) => [
      ...prev,
      {
        label: newLabel.trim(),
        type: newType,
        isMandatory: newMandatory,
      },
    ]);
    setNewLabel('');
    setNewType('document');
    setNewMandatory(true);
  };

  const removeRequirement = (index: number) => {
    setRequirements((prev) => prev.filter((_, i) => i !== index));
  };

  const parseCsvContent = (raw: string) => {
    const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
    const results: CsvBeneficiaryDraft[] = [];
    const startIndex = lines[0]?.toLowerCase().includes('name') ? 1 : 0;

    for (let i = startIndex; i < lines.length; i++) {
      const parts = lines[i].split(',').map((p) => p.trim().replace(/^"|"$/g, ''));
      const fullName = parts[0] || '';
      const phoneNumber = parts[1] || '';
      if (fullName.length > 1 && phoneNumber.length >= 7) {
        results.push({ fullName, phoneNumber });
      }
    }

    setParsedBeneficiaries(results);
    if (results.length === 0) {
      Alert.alert('No Valid Rows', 'Could not detect any valid "Name, Phone Number" rows.');
    }
  };

  const pickCsvFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'text/plain'],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        const file = result.assets[0];
        const content = await FileSystem.readAsStringAsync(file.uri);
        setCsvText(content);
        parseCsvContent(content);
      }
    } catch {
      Alert.alert('File Error', 'Could not read the selected CSV file.');
    }
  };

  const getTypeBadgeColor = (type: RequirementType) => {
    switch (type) {
      case 'document':
        return '#3B82F6';
      case 'text':
        return '#8B5CF6';
      case 'number':
        return '#F59E0B';
      case 'boolean':
        return BrandColors.green;
    }
  };

  return (
    <View style={styles.container}>
      <StepIndicator currentStep={4} title="Enrollment & Requirements" />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <FadeInView delay={0}>
          <Text style={styles.sectionDescription}>
            Choose how beneficiaries are enrolled into this relief program: open public application with
            custom requirements, or a targeted private list imported from CSV.
          </Text>

          {/* Mode Selector Cards */}
          <View style={styles.modeCardsContainer}>
            <TouchableOpacity
              style={[styles.modeCard, mode === 'public' && styles.modeCardActive]}
              onPress={() => setMode('public')}>
              <View style={styles.modeIconCircle}>
                <FontAwesome
                  name="globe"
                  size={20}
                  color={mode === 'public' ? BrandColors.green : BrandColors.grey}
                />
              </View>
              <View style={styles.modeTextContainer}>
                <Text style={[styles.modeTitle, mode === 'public' && styles.modeTitleActive]}>
                  Open Application (Public)
                </Text>
                <Text style={styles.modeSubtitle}>
                  Beneficiaries browse in the app and submit required documents to apply.
                </Text>
              </View>
              <View style={[styles.radioCircle, mode === 'public' && styles.radioCircleActive]}>
                {mode === 'public' && <View style={styles.radioDot} />}
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modeCard, mode === 'private' && styles.modeCardActive]}
              onPress={() => setMode('private')}>
              <View style={styles.modeIconCircle}>
                <FontAwesome
                  name="file-excel-o"
                  size={20}
                  color={mode === 'private' ? BrandColors.green : BrandColors.grey}
                />
              </View>
              <View style={styles.modeTextContainer}>
                <Text style={[styles.modeTitle, mode === 'private' && styles.modeTitleActive]}>
                  Targeted List via CSV (Private)
                </Text>
                <Text style={styles.modeSubtitle}>
                  Upload a pre-vetted list. Only invited beneficiaries receive SMS codes.
                </Text>
              </View>
              <View style={[styles.radioCircle, mode === 'private' && styles.radioCircleActive]}>
                {mode === 'private' && <View style={styles.radioDot} />}
              </View>
            </TouchableOpacity>
          </View>
        </FadeInView>

        {/* ---------------- MODE: PUBLIC (DYNAMIC REQUIREMENTS) ---------------- */}
        {mode === 'public' && (
          <FadeInView delay={50}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Application Requirements</Text>
              <Text style={styles.sectionCountBadge}>{requirements.length} criteria</Text>
            </View>
            <Text style={styles.sectionSubtext}>
              Applicants will be required to submit each of the following in their application form:
            </Text>

            {/* List of Requirements */}
            <View style={styles.requirementsList}>
              {requirements.map((req, idx) => (
                <View key={idx} style={styles.requirementRow}>
                  <View style={styles.requirementMain}>
                    <View style={styles.reqBadgeRow}>
                      <View
                        style={[
                          styles.typeBadge,
                          { backgroundColor: `${getTypeBadgeColor(req.type)}15` },
                        ]}>
                        <Text
                          style={[
                            styles.typeBadgeText,
                            { color: getTypeBadgeColor(req.type) },
                          ]}>
                          {req.type.toUpperCase()}
                        </Text>
                      </View>
                      {req.isMandatory ? (
                        <Text style={styles.requiredPill}>Mandatory</Text>
                      ) : (
                        <Text style={styles.optionalPill}>Optional</Text>
                      )}
                    </View>
                    <Text style={styles.requirementLabel}>{req.label}</Text>
                    {req.description && (
                      <Text style={styles.requirementDesc}>{req.description}</Text>
                    )}
                  </View>
                  <TouchableOpacity
                    onPress={() => removeRequirement(idx)}
                    style={styles.deleteReqButton}>
                    <FontAwesome name="trash-o" size={16} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>

            {/* Add Custom Requirement */}
            <View style={styles.addCustomCard}>
              <Text style={styles.addCustomTitle}>+ Add Requirement to Form</Text>

              <TextInput
                style={styles.textInput}
                placeholder="Requirement Label (e.g. Barangay Clearance)"
                placeholderTextColor={BrandColors.grey}
                value={newLabel}
                onChangeText={setNewLabel}
              />

              <Text style={styles.inputSubLabel}>Response Type:</Text>
              <View style={styles.typeSelectorRow}>
                {(['document', 'text', 'number', 'boolean'] as RequirementType[]).map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.typeChip, newType === t && styles.typeChipActive]}
                    onPress={() => setNewType(t)}>
                    <Text style={[styles.typeChipText, newType === t && styles.typeChipTextActive]}>
                      {t === 'boolean' ? 'Yes / No' : t.charAt(0).toUpperCase() + t.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.mandatoryToggleRow}>
                <Text style={styles.mandatoryToggleLabel}>Mandatory (Required to submit)</Text>
                <Switch
                  value={newMandatory}
                  onValueChange={setNewMandatory}
                  trackColor={{ false: '#CBD5E1', true: BrandColors.green }}
                  thumbColor="white"
                />
              </View>

              <TouchableOpacity style={styles.addReqButton} onPress={addRequirement}>
                <Text style={styles.addReqButtonText}>Add to Application Form</Text>
              </TouchableOpacity>
            </View>
          </FadeInView>
        )}

        {/* ---------------- MODE: PRIVATE (CSV IMPORT) ---------------- */}
        {mode === 'private' && (
          <FadeInView delay={50}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Targeted Beneficiary List (CSV)</Text>
              <Text style={styles.sectionCountBadge}>
                {parsedBeneficiaries.length} recipients
              </Text>
            </View>
            <Text style={styles.sectionSubtext}>
              Upload a CSV file or paste rows with format: <Text style={styles.codeText}>Full Name, Phone Number</Text>
            </Text>

            <View style={styles.csvActionsContainer}>
              <TouchableOpacity style={styles.uploadCsvButton} onPress={pickCsvFile}>
                <FontAwesome name="upload" size={18} color="white" style={{ marginRight: 8 }} />
                <Text style={styles.uploadCsvButtonText}>Choose CSV File</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.orText}>— OR PASTE CSV TEXT BELOW —</Text>

            <TextInput
              style={styles.csvTextArea}
              multiline
              numberOfLines={4}
              placeholder="Juan Dela Cruz, +639171234567&#10;Maria Santos, +639189876543"
              placeholderTextColor={BrandColors.grey}
              value={csvText}
              onChangeText={(text) => {
                setCsvText(text);
                parseCsvContent(text);
              }}
            />

            {parsedBeneficiaries.length > 0 && (
              <View style={styles.parsedPreviewCard}>
                <View style={styles.parsedHeaderRow}>
                  <FontAwesome name="check-circle" size={16} color={BrandColors.green} />
                  <Text style={styles.parsedCountText}>
                    {parsedBeneficiaries.length} Beneficiaries Parsed
                  </Text>
                </View>

                {parsedBeneficiaries.slice(0, 5).map((b, i) => (
                  <View key={i} style={styles.previewRow}>
                    <Text style={styles.previewName}>{b.fullName}</Text>
                    <Text style={styles.previewPhone}>{b.phoneNumber}</Text>
                  </View>
                ))}

                {parsedBeneficiaries.length > 5 && (
                  <Text style={styles.moreRecipientsText}>
                    + {parsedBeneficiaries.length - 5} more beneficiaries
                  </Text>
                )}
              </View>
            )}
          </FadeInView>
        )}
      </ScrollView>

      <WizardNavigation
        onBack={handleBack}
        onNext={handleNext}
        disableNext={
          (mode === 'private' && parsedBeneficiaries.length === 0) ||
          (mode === 'public' && requirements.length === 0)
        }
      />
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
  modeCardsContainer: {
    marginBottom: Spacing.four,
  },
  modeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.lg,
    padding: Spacing.three,
    borderWidth: 2,
    borderColor: BrandColors.lightGray,
    marginBottom: Spacing.three,
  },
  modeCardActive: {
    borderColor: BrandColors.green,
    backgroundColor: '#F7FCF6',
  },
  modeIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.three,
  },
  modeTextContainer: {
    flex: 1,
    marginRight: Spacing.two,
  },
  modeTitle: {
    fontSize: 15,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: BrandColors.navy,
    marginBottom: 2,
  },
  modeTitleActive: {
    color: BrandColors.green,
  },
  modeSubtitle: {
    fontSize: 12,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: BrandColors.grey,
    lineHeight: 16,
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: BrandColors.grey,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioCircleActive: {
    borderColor: BrandColors.green,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: BrandColors.green,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: BrandColors.navy,
  },
  sectionCountBadge: {
    fontSize: 12,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: BrandColors.green,
    backgroundColor: '#EAF8E6',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  sectionSubtext: {
    fontSize: 12,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: BrandColors.grey,
    marginBottom: Spacing.three,
    lineHeight: 18,
  },
  codeText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: BrandColors.navy,
  },
  requirementsList: {
    marginBottom: Spacing.four,
  },
  requirementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.md,
    padding: Spacing.three,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: Spacing.two,
  },
  requirementMain: {
    flex: 1,
  },
  reqBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  typeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 6,
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  requiredPill: {
    fontSize: 10,
    fontWeight: '700',
    color: '#DC2626',
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  optionalPill: {
    fontSize: 10,
    fontWeight: '600',
    color: BrandColors.grey,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  requirementLabel: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: BrandColors.navy,
  },
  requirementDesc: {
    fontSize: 11,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: BrandColors.grey,
    marginTop: 2,
  },
  deleteReqButton: {
    padding: 8,
    marginLeft: 8,
  },
  addCustomCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.lg,
    padding: Spacing.three,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: Spacing.four,
  },
  addCustomTitle: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: BrandColors.navy,
    marginBottom: Spacing.two,
  },
  textInput: {
    height: 44,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.three,
    fontSize: 13,
    backgroundColor: '#F8FAFC',
    color: BrandColors.navy,
    marginBottom: Spacing.three,
  },
  inputSubLabel: {
    fontSize: 12,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: BrandColors.navy,
    marginBottom: Spacing.one,
  },
  typeSelectorRow: {
    flexDirection: 'row',
    marginBottom: Spacing.three,
  },
  typeChip: {
    flex: 1,
    height: 34,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: BorderRadius.sm,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 6,
    backgroundColor: '#F8FAFC',
  },
  typeChipActive: {
    borderColor: BrandColors.navy,
    backgroundColor: BrandColors.navy,
  },
  typeChipText: {
    fontSize: 11,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: BrandColors.navy,
  },
  typeChipTextActive: {
    color: '#FFFFFF',
  },
  mandatoryToggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.two,
    marginBottom: Spacing.two,
  },
  mandatoryToggleLabel: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: '#334155',
  },
  addReqButton: {
    height: 42,
    backgroundColor: BrandColors.navy,
    borderRadius: BorderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addReqButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_700Bold',
  },
  csvActionsContainer: {
    marginBottom: Spacing.two,
  },
  uploadCsvButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BrandColors.green,
    borderRadius: BorderRadius.md,
    height: 46,
  },
  uploadCsvButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_700Bold',
  },
  orText: {
    textAlign: 'center',
    fontSize: 11,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: BrandColors.grey,
    marginVertical: Spacing.two,
  },
  csvTextArea: {
    minHeight: 80,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: BorderRadius.md,
    padding: Spacing.three,
    fontSize: 13,
    backgroundColor: '#FFFFFF',
    color: BrandColors.navy,
    textAlignVertical: 'top',
    marginBottom: Spacing.three,
  },
  parsedPreviewCard: {
    backgroundColor: '#F0FDF4',
    borderRadius: BorderRadius.md,
    padding: Spacing.three,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    marginBottom: Spacing.four,
  },
  parsedHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.two,
  },
  parsedCountText: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#15803D',
    marginLeft: 6,
  },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
    borderBottomWidth: 1,
    borderBottomColor: '#DCFCE7',
  },
  previewName: {
    fontSize: 12,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: '#166534',
  },
  previewPhone: {
    fontSize: 12,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: '#166534',
  },
  moreRecipientsText: {
    fontSize: 11,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: '#15803D',
    marginTop: 4,
    textAlign: 'center',
  },
});
