import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TextInput,
  Text,
  TouchableOpacity,
  Modal,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useCreateProgram } from './_layout';
import { StepIndicator } from '@/components/CreateProgram/StepIndicator';
import { WizardNavigation } from '@/components/CreateProgram/WizardNavigation';
import { BrandColors, BorderRadius, Spacing } from '@/constants/theme';

export default function BasicInfoScreen() {
  const router = useRouter();
  const { draft, updateDraft, lookups, isLoadingLookups } = useCreateProgram();

  // Local state for city selection
  const [selectedCityId, setSelectedCityId] = useState<number | null>(null);

  // Modal open states
  const [disasterModalVisible, setDisasterModalVisible] = useState(false);
  const [cityModalVisible, setCityModalVisible] = useState(false);
  const [areaModalVisible, setAreaModalVisible] = useState(false);
  const [agencyModalVisible, setAgencyModalVisible] = useState(false);
  const [fundingModalVisible, setFundingModalVisible] = useState(false);

  // Validation
  const isNextDisabled =
    !draft.name.trim() ||
    !draft.description.trim() ||
    !draft.disasterTypeId ||
    !draft.implementingAgencyId ||
    !draft.fundingSourceId ||
    draft.affectedAreaIds.length === 0;

  const handleNext = () => {
    router.push('/(lgu)/create-program/budget' as any);
  };

  const getSelectedCityName = () => {
    const city = lookups.cities.find((c) => c.id === selectedCityId);
    return city ? city.name : '';
  };

  const toggleArea = (areaId: number, areaName: string) => {
    const isSelected = draft.affectedAreaIds.includes(areaId);
    let updatedIds: number[];
    let updatedNames: string[];

    if (isSelected) {
      updatedIds = draft.affectedAreaIds.filter((id) => id !== areaId);
      updatedNames = draft.affectedAreas.filter((name) => name !== areaName);
    } else {
      updatedIds = [...draft.affectedAreaIds, areaId];
      updatedNames = [...draft.affectedAreas, areaName];
    }

    updateDraft({ affectedAreaIds: updatedIds, affectedAreas: updatedNames });
  };

  // Filter areas based on chosen city
  const filteredAreas = lookups.areas.filter((a) => a.city_id === selectedCityId);

  if (isLoadingLookups) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={BrandColors.green} />
        <Text style={styles.loadingText}>Loading lookup tables...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StepIndicator currentStep={1} title="Basic Information" />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Program Name */}
        <View style={styles.formGroup}>
          <Text style={styles.label}>Program Name <Text style={styles.required}>*</Text></Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Typhoon Kristine Relief Drive"
            placeholderTextColor={BrandColors.grey}
            value={draft.name}
            onChangeText={(text) => updateDraft({ name: text })}
          />
        </View>

        {/* Description */}
        <View style={styles.formGroup}>
          <Text style={styles.label}>Description <Text style={styles.required}>*</Text></Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Describe the main objectives and details of the program..."
            placeholderTextColor={BrandColors.grey}
            multiline
            numberOfLines={4}
            value={draft.description}
            onChangeText={(text) => updateDraft({ description: text })}
          />
        </View>

        {/* Disaster Type (Dropdown) */}
        <View style={styles.formGroup}>
          <Text style={styles.label}>Disaster Type <Text style={styles.required}>*</Text></Text>
          <TouchableOpacity
            style={styles.dropdownTrigger}
            onPress={() => setDisasterModalVisible(true)}>
            <Text style={[styles.dropdownValue, !draft.disasterType && styles.placeholderText]}>
              {draft.disasterType || 'Select Disaster Type'}
            </Text>
            <Text style={styles.dropdownChevron}>▼</Text>
          </TouchableOpacity>
        </View>

        {/* City (Dropdown) */}
        <View style={styles.formGroup}>
          <Text style={styles.label}>City <Text style={styles.required}>*</Text></Text>
          <TouchableOpacity
            style={styles.dropdownTrigger}
            onPress={() => setCityModalVisible(true)}>
            <Text style={[styles.dropdownValue, !selectedCityId && styles.placeholderText]}>
              {getSelectedCityName() || 'Select City'}
            </Text>
            <Text style={styles.dropdownChevron}>▼</Text>
          </TouchableOpacity>
        </View>

        {/* Affected Area (Multi-select based on city selection) */}
        <View style={styles.formGroup}>
          <Text style={styles.label}>Affected Areas <Text style={styles.required}>*</Text></Text>
          <TouchableOpacity
            style={[styles.dropdownTrigger, !selectedCityId && styles.disabledTrigger]}
            disabled={!selectedCityId}
            onPress={() => setAreaModalVisible(true)}>
            <Text style={[styles.dropdownValue, draft.affectedAreas.length === 0 && styles.placeholderText]}>
              {draft.affectedAreas.length > 0
                ? draft.affectedAreas.join(', ')
                : selectedCityId
                ? 'Select Affected Areas'
                : 'Select a city first'}
            </Text>
            <Text style={styles.dropdownChevron}>▼</Text>
          </TouchableOpacity>
        </View>

        {/* Implementing Agency (Dropdown) */}
        <View style={styles.formGroup}>
          <Text style={styles.label}>Implementing Agency <Text style={styles.required}>*</Text></Text>
          <TouchableOpacity
            style={styles.dropdownTrigger}
            onPress={() => setAgencyModalVisible(true)}>
            <Text style={[styles.dropdownValue, !draft.implementingAgency && styles.placeholderText]}>
              {draft.implementingAgency || 'Select Implementing Agency'}
            </Text>
            <Text style={styles.dropdownChevron}>▼</Text>
          </TouchableOpacity>
        </View>

        {/* Funding Source (Dropdown) */}
        <View style={styles.formGroup}>
          <Text style={styles.label}>Funding Source <Text style={styles.required}>*</Text></Text>
          <TouchableOpacity
            style={styles.dropdownTrigger}
            onPress={() => setFundingModalVisible(true)}>
            <Text style={[styles.dropdownValue, !draft.fundingSource && styles.placeholderText]}>
              {draft.fundingSource || 'Select Funding Source'}
            </Text>
            <Text style={styles.dropdownChevron}>▼</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <WizardNavigation onNext={handleNext} disableNext={isNextDisabled} />

      {/* DISASTER TYPE SELECT MODAL */}
      <Modal visible={disasterModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Disaster Type</Text>
              <TouchableOpacity onPress={() => setDisasterModalVisible(false)}>
                <Text style={styles.closeButton}>Cancel</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={lookups.disasterTypes}
              keyExtractor={(item) => item.id.toString()}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.modalItem, draft.disasterTypeId === item.id && styles.selectedItem]}
                  onPress={() => {
                    updateDraft({ disasterTypeId: item.id, disasterType: item.name });
                    setDisasterModalVisible(false);
                  }}>
                  <Text style={[styles.modalItemText, draft.disasterTypeId === item.id && styles.selectedItemText]}>
                    {item.name}
                  </Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* CITIES SELECT MODAL */}
      <Modal visible={cityModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select City</Text>
              <TouchableOpacity onPress={() => setCityModalVisible(false)}>
                <Text style={styles.closeButton}>Cancel</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={lookups.cities}
              keyExtractor={(item) => item.id.toString()}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.modalItem, selectedCityId === item.id && styles.selectedItem]}
                  onPress={() => {
                    setSelectedCityId(item.id);
                    // Clear selected areas when city changes
                    updateDraft({ affectedAreaIds: [], affectedAreas: [] });
                    setCityModalVisible(false);
                  }}>
                  <Text style={[styles.modalItemText, selectedCityId === item.id && styles.selectedItemText]}>
                    {item.name}
                  </Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* AFFECTED AREAS MULTI SELECT MODAL */}
      <Modal visible={areaModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Areas in {getSelectedCityName()}</Text>
              <TouchableOpacity onPress={() => setAreaModalVisible(false)}>
                <Text style={styles.closeButton}>Done</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={filteredAreas}
              keyExtractor={(item) => item.id.toString()}
              renderItem={({ item }) => {
                const isSelected = draft.affectedAreaIds.includes(item.id);
                return (
                  <TouchableOpacity
                    style={[styles.modalItem, isSelected && styles.selectedItem]}
                    onPress={() => toggleArea(item.id, item.name)}>
                    <Text style={[styles.modalItemText, isSelected && styles.selectedItemText]}>
                      {item.name} {isSelected ? '✓' : ''}
                    </Text>
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </View>
      </Modal>

      {/* IMPLEMENTING AGENCY SELECT MODAL */}
      <Modal visible={agencyModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Implementing Agency</Text>
              <TouchableOpacity onPress={() => setAgencyModalVisible(false)}>
                <Text style={styles.closeButton}>Cancel</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={lookups.agencies}
              keyExtractor={(item) => item.id.toString()}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.modalItem, draft.implementingAgencyId === item.id && styles.selectedItem]}
                  onPress={() => {
                    updateDraft({ implementingAgencyId: item.id, implementingAgency: item.name });
                    setAgencyModalVisible(false);
                  }}>
                  <Text style={[styles.modalItemText, draft.implementingAgencyId === item.id && styles.selectedItemText]}>
                    {item.name}
                  </Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* FUNDING SOURCE SELECT MODAL */}
      <Modal visible={fundingModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Funding Source</Text>
              <TouchableOpacity onPress={() => setFundingModalVisible(false)}>
                <Text style={styles.closeButton}>Cancel</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={lookups.fundingSources}
              keyExtractor={(item) => item.id.toString()}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.modalItem, draft.fundingSourceId === item.id && styles.selectedItem]}
                  onPress={() => {
                    updateDraft({ fundingSourceId: item.id, fundingSource: item.name });
                    setFundingModalVisible(false);
                  }}>
                  <Text style={[styles.modalItemText, draft.fundingSourceId === item.id && styles.selectedItemText]}>
                    {item.name}
                  </Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF9F6',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FAF9F6',
  },
  loadingText: {
    marginTop: Spacing.two,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: BrandColors.navy,
    fontSize: 14,
  },
  scrollContent: {
    padding: Spacing.three,
    paddingBottom: Spacing.six,
  },
  formGroup: {
    marginBottom: Spacing.three,
  },
  label: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: BrandColors.navy,
    marginBottom: Spacing.one,
  },
  required: {
    color: 'red',
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: BrandColors.lightGray,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.three,
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_400Regular',
    backgroundColor: '#FFFFFF',
    color: BrandColors.navy,
  },
  textArea: {
    height: 100,
    paddingTop: Spacing.two,
    textAlignVertical: 'top',
  },
  dropdownTrigger: {
    height: 48,
    borderWidth: 1,
    borderColor: BrandColors.lightGray,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.three,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  disabledTrigger: {
    backgroundColor: '#EEEDED',
    opacity: 0.6,
  },
  dropdownValue: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: BrandColors.navy,
  },
  placeholderText: {
    color: BrandColors.grey,
  },
  dropdownChevron: {
    fontSize: 12,
    color: BrandColors.grey,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    maxHeight: '60%',
    paddingBottom: Spacing.five,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.three,
    borderBottomWidth: 1,
    borderBottomColor: BrandColors.lightGray,
  },
  modalTitle: {
    fontSize: 16,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: BrandColors.navy,
  },
  closeButton: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: BrandColors.green,
  },
  modalItem: {
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  selectedItem: {
    backgroundColor: '#F1FAF1',
  },
  modalItemText: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: BrandColors.navy,
  },
  selectedItemText: {
    color: BrandColors.green,
    fontFamily: 'PlusJakartaSans_700Bold',
  },
});
