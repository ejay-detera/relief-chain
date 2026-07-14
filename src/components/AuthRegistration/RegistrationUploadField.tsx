import { FontAwesome } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { Alert, Pressable, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BrandColors } from '@/constants/theme';
import type { SelectedDocumentAsset } from '@/types/registration';

import { registrationStyles as styles } from './styles';

type RegistrationUploadFieldProps = {
  asset: SelectedDocumentAsset | null;
  label: string;
  onSelect: (asset: SelectedDocumentAsset) => void;
  required?: boolean;
};

export const RegistrationUploadField = ({ asset, label, onSelect, required = false }: RegistrationUploadFieldProps) => {
  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
        type: ['image/*', 'application/pdf'],
      });
      if (result.canceled) return;
      const selected = result.assets[0];
      if (!selected) return;
      onSelect({ name: selected.name, uri: selected.uri, mimeType: selected.mimeType ?? null, ...(selected.size === undefined ? {} : { size: selected.size }) });
    } catch (error: unknown) {
      Alert.alert('Unable to select document', error instanceof Error ? error.message : 'Please try again.');
    }
  };

  return (
    <View>
      <View style={styles.fieldLabelRow}>
        <ThemedText style={styles.fieldLabel}>{label}</ThemedText>
        {required && <ThemedText style={styles.required}>*</ThemedText>}
      </View>
      <Pressable accessibilityLabel={`Select ${label}`} accessibilityRole="button" onPress={pickDocument} style={styles.upload}>
        <FontAwesome color={BrandColors.navy} name={asset ? 'file-text-o' : 'file-image-o'} size={24} />
        <ThemedText numberOfLines={2} style={[styles.uploadText, asset && styles.uploadTextSelected]}>{asset?.name ?? 'Choose an image or PDF'}</ThemedText>
      </Pressable>
    </View>
  );
};
