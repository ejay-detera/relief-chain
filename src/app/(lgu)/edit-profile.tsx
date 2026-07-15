import { FontAwesome } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BorderRadius, BottomTabInset, BrandColors, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { updateOwnProfile } from '@/services/profileService';

type FieldProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'phone-pad';
};

const Field = ({ label, value, onChangeText, placeholder, keyboardType = 'default' }: FieldProps) => (
  <View style={styles.fieldGroup}>
    <ThemedText style={styles.fieldLabel}>{label}</ThemedText>
    <TextInput
      keyboardType={keyboardType}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={BrandColors.grey}
      style={styles.input}
      value={value}
    />
  </View>
);

export default function EditProfileScreen() {
  const router = useRouter();
  const { profile, session, refreshProfile } = useAuth();

  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [mobileNumber, setMobileNumber] = useState(profile?.mobile_number ?? '');
  const [location, setLocation] = useState(profile?.location ?? '');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!session?.user) return;
    if (!fullName.trim()) {
      Alert.alert('Organization name required', 'Please enter your organization name.');
      return;
    }

    setIsSaving(true);
    try {
      await updateOwnProfile(session.user.id, {
        full_name: fullName.trim(),
        mobile_number: mobileNumber.trim(),
        location: location.trim(),
      });
      await refreshProfile();
      Alert.alert('Profile Updated', 'Your organization profile has been updated.');
      router.back();
    } catch (error) {
      console.error('Error updating profile:', error);
      Alert.alert('Update Failed', 'We could not save your changes. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity
            hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <FontAwesome color={BrandColors.navy} name="chevron-left" size={18} />
          </TouchableOpacity>
          <ThemedText style={styles.headerTitle}>Edit Profile</ThemedText>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <Field label="Organization Name" onChangeText={setFullName} placeholder="Organization name" value={fullName} />
          <Field
            keyboardType="phone-pad"
            label="Mobile Number"
            onChangeText={setMobileNumber}
            placeholder="Mobile number"
            value={mobileNumber}
          />
          <Field label="Location" onChangeText={setLocation} placeholder="Office / area location" value={location} />

          <TouchableOpacity
            disabled={isSaving}
            onPress={handleSave}
            style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
          >
            {isSaving ? <ActivityIndicator color="#FFFFFF" /> : <ThemedText style={styles.saveButtonText}>Save Changes</ThemedText>}
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.three,
    borderBottomWidth: 1,
    borderBottomColor: BrandColors.lightGray,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: BrandColors.navy,
  },
  headerSpacer: {
    width: 40,
  },
  scrollContent: {
    padding: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.six,
  },
  fieldGroup: {
    marginBottom: Spacing.four,
  },
  fieldLabel: {
    fontSize: 12,
    color: BrandColors.grey,
    marginBottom: Spacing.one,
  },
  input: {
    height: 46,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: BrandColors.lightGray,
    paddingHorizontal: Spacing.three,
    fontSize: 14,
    color: BrandColors.navy,
  },
  saveButton: {
    height: 50,
    backgroundColor: BrandColors.navy,
    borderRadius: BorderRadius.full,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing.two,
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
