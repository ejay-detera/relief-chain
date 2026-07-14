import { FontAwesome } from '@expo/vector-icons';
import { Pressable, ScrollView, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BrandColors } from '@/constants/theme';
import { TERMS_AND_CONDITIONS_SECTIONS, TERMS_LAST_UPDATED } from '@/data/terms-and-conditions';

import { termsStyles as styles } from './styles';

type TermsAndConditionsContentProps = {
  onClose: () => void;
};

export const TermsAndConditionsContent = ({ onClose }: TermsAndConditionsContentProps) => (
  <View style={styles.page}>
    <View style={styles.header}>
      <Pressable accessibilityLabel="Close Terms & Conditions" accessibilityRole="button" onPress={onClose} style={styles.closeButton}>
        <FontAwesome color={BrandColors.navy} name="close" size={22} />
      </Pressable>
      <ThemedText style={styles.headerTitle}>Terms &amp; Conditions</ThemedText>
    </View>

    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator>
      <ThemedText style={styles.lastUpdated}>Last updated: {TERMS_LAST_UPDATED}</ThemedText>

      {TERMS_AND_CONDITIONS_SECTIONS.map((section) => (
        <View key={section.heading}>
          <ThemedText style={styles.sectionHeading}>{section.heading}</ThemedText>
          {section.body.map((paragraph) => (
            <ThemedText key={paragraph.slice(0, 40)} style={styles.paragraph}>{paragraph}</ThemedText>
          ))}
        </View>
      ))}
    </ScrollView>
  </View>
);
