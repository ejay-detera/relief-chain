import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, FlatList, ActivityIndicator, StyleSheet } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { RegistrationField } from '@/components/AuthRegistration/RegistrationField';
import { RegistrationPrimaryAction } from '@/components/AuthRegistration/RegistrationPrimaryAction';
import { registrationStyles as styles } from '@/components/AuthRegistration/styles';
import { BrandColors, BorderRadius, Spacing } from '@/constants/theme';
import type { BeneficiaryRegistrationData } from '@/types/beneficiary-registration';

type Props = {
  data: BeneficiaryRegistrationData;
  onChange: (values: Partial<BeneficiaryRegistrationData>) => void;
  onNext: () => void;
};

interface DropdownFieldProps {
  label: string;
  value: string;
  placeholder: string;
  onPress: () => void;
  required?: boolean;
}

const DropdownField = ({ label, value, placeholder, onPress, required }: DropdownFieldProps) => (
  <View style={styles.flexField}>
    <View style={styles.fieldLabelRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {required && <Text style={styles.required}>*</Text>}
    </View>
    <TouchableOpacity style={styles.inputWrap} onPress={onPress} activeOpacity={0.8}>
      <Text style={[styles.input, !value && { color: '#979797' }]} numberOfLines={1}>
        {value || placeholder}
      </Text>
      <View style={styles.inputAction}>
        <FontAwesome name="chevron-down" size={12} color="#112E58" />
      </View>
    </TouchableOpacity>
  </View>
);

export const BeneficiaryPersonalStep = ({ data, onChange, onNext }: Props) => {
  const [cities, setCities] = useState<{ id: number; name: string }[]>([]);
  const [districts, setDistricts] = useState<{ id: number; city_id: number; name: string }[]>([]);
  const [barangays, setBarangays] = useState<{ id: number; area_id: number; name: string }[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal states
  const [activeModal, setActiveModal] = useState<'city' | 'district' | 'barangay' | null>(null);

  useEffect(() => {
    let active = true;
    const loadAddressData = async () => {
      try {
        const [cRes, dRes, bRes] = await Promise.all([
          supabase.from('cities').select('*').order('name'),
          supabase.from('areas').select('*').order('name'), // areas represents districts
          supabase.from('barangays').select('*').order('name'),
        ]);

        if (active) {
          setCities(cRes.data || []);
          setDistricts(dRes.data || []);
          setBarangays(bRes.data || []);
        }
      } catch (err) {
        console.error('Error loading address hierarchies:', err);
      } finally {
        if (active) setLoading(false);
      }
    };

    loadAddressData();
    return () => {
      active = false;
    };
  }, []);

  // Filter options based on parents
  const filteredDistricts = districts.filter(d => d.city_id === data.cityId);
  const filteredBarangays = barangays.filter(b => b.area_id === data.districtId);

  const selectCity = (cityId: number, cityName: string) => {
    onChange({
      cityId,
      city: cityName,
      municipalityCity: cityName, // maintain compatibility with existing fields
      districtId: null,
      district: '',
      barangayId: null,
      barangay: '',
    });
    setActiveModal(null);
  };

  const selectDistrict = (districtId: number, districtName: string) => {
    onChange({
      districtId,
      district: districtName,
      barangayId: null,
      barangay: '',
    });
    setActiveModal(null);
  };

  const selectBarangay = (barangayId: number, barangayName: string) => {
    onChange({
      barangayId,
      barangay: barangayName,
    });
    setActiveModal(null);
  };

  const isNextDisabled =
    !data.mobileNumber ||
    !data.email ||
    !data.completeAddress ||
    !data.cityId ||
    !data.districtId ||
    !data.barangayId;

  if (loading) {
    return (
      <View style={localStyles.loadingContainer}>
        <ActivityIndicator size="small" color={BrandColors.green} />
        <Text style={localStyles.loadingText}>Loading address options...</Text>
      </View>
    );
  }

  return (
    <View style={styles.form}>
      {/* Mobile Number & Email */}
      <RegistrationField
        keyboardType="phone-pad"
        label="Mobile Number"
        onChangeText={(mobileNumber) => onChange({ mobileNumber: mobileNumber.replace(/\D/g, '').slice(0, 11) })}
        required
        value={data.mobileNumber}
      />
      <RegistrationField
        autoCapitalize="none"
        keyboardType="email-address"
        label="Email"
        onChangeText={(email) => onChange({ email })}
        required
        value={data.email}
      />

      {/* Complete Address: Full Row / 1 Row Only */}
      <RegistrationField
        label="Complete Address"
        onChangeText={(completeAddress) => onChange({ completeAddress })}
        required
        value={data.completeAddress}
      />

      {/* City (Dropdown) */}
      <DropdownField
        label="City / Municipality"
        placeholder="Select City"
        value={data.city}
        required
        onPress={() => setActiveModal('city')}
      />

      {/* District & Barangay (Side-by-Side Row) */}
      <View style={styles.row}>
        <DropdownField
          label="District"
          placeholder={data.cityId ? "Select District" : "Select City first"}
          value={data.district}
          required
          onPress={() => {
            if (data.cityId) setActiveModal('district');
          }}
        />
        <DropdownField
          label="Barangay"
          placeholder={data.districtId ? "Select Barangay" : "Select District first"}
          value={data.barangay}
          required
          onPress={() => {
            if (data.districtId) setActiveModal('barangay');
          }}
        />
      </View>

      <RegistrationPrimaryAction label="Next" onPress={onNext} disabled={isNextDisabled} />

      {/* CHOICES MODALS */}
      <Modal visible={activeModal !== null} transparent animationType="slide">
        <TouchableOpacity style={localStyles.modalOverlay} activeOpacity={1} onPress={() => setActiveModal(null)}>
          <View style={localStyles.modalContent}>
            <View style={localStyles.modalHeader}>
              <Text style={localStyles.modalTitle}>
                {activeModal === 'city' && 'Select City / Municipality'}
                {activeModal === 'district' && 'Select District'}
                {activeModal === 'barangay' && 'Select Barangay'}
              </Text>
              <TouchableOpacity onPress={() => setActiveModal(null)}>
                <Text style={localStyles.closeText}>Cancel</Text>
              </TouchableOpacity>
            </View>

            {activeModal === 'city' && (
              <FlatList
                data={cities}
                keyExtractor={(item) => item.id.toString()}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[localStyles.modalItem, data.cityId === item.id && localStyles.selectedItem]}
                    onPress={() => selectCity(item.id, item.name)}
                  >
                    <Text style={[localStyles.modalItemText, data.cityId === item.id && localStyles.selectedItemText]}>
                      {item.name}
                    </Text>
                  </TouchableOpacity>
                )}
              />
            )}

            {activeModal === 'district' && (
              <FlatList
                data={filteredDistricts}
                keyExtractor={(item) => item.id.toString()}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[localStyles.modalItem, data.districtId === item.id && localStyles.selectedItem]}
                    onPress={() => selectDistrict(item.id, item.name)}
                  >
                    <Text style={[localStyles.modalItemText, data.districtId === item.id && localStyles.selectedItemText]}>
                      {item.name}
                    </Text>
                  </TouchableOpacity>
                )}
              />
            )}

            {activeModal === 'barangay' && (
              <FlatList
                data={filteredBarangays}
                keyExtractor={(item) => item.id.toString()}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[localStyles.modalItem, data.barangayId === item.id && localStyles.selectedItem]}
                    onPress={() => selectBarangay(item.id, item.name)}
                  >
                    <Text style={[localStyles.modalItemText, data.barangayId === item.id && localStyles.selectedItemText]}>
                      {item.name}
                    </Text>
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const localStyles = StyleSheet.create({
  loadingContainer: {
    paddingVertical: Spacing.six,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 8,
    fontSize: 12,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: BrandColors.grey,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(17, 46, 88, 0.3)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    maxHeight: '50%',
    padding: Spacing.four,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.three,
    borderBottomWidth: 1,
    borderBottomColor: '#EEEDED',
    paddingBottom: Spacing.two,
  },
  modalTitle: {
    fontSize: 16,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: BrandColors.navy,
  },
  closeText: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: BrandColors.grey,
  },
  modalItem: {
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.two,
    borderBottomWidth: 0.5,
    borderBottomColor: '#EEEDED',
  },
  selectedItem: {
    backgroundColor: 'rgba(111, 202, 75, 0.1)', // Light brand green
  },
  modalItemText: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: BrandColors.navy,
  },
  selectedItemText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    color: BrandColors.green,
  },
});
