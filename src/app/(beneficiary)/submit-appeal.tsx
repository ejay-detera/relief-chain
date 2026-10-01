import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome } from '@expo/vector-icons';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { LogoHeader } from '@/components/LogoHeader/LogoHeader';
import { AppealForm } from '@/components/beneficiary/Appeals/appeal-form';
import { BottomTabInset, BrandColors, MaxContentWidth, Spacing } from '@/constants/theme';
import { useAppeals } from '@/hooks/use-appeals';

export default function SubmitAppealScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    enrollmentId?: string;
    programName?: string;
    programId?: string;
  }>();

  const { submit } = useAppeals();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (reason: string, documentUrls: string[]) => {
    if (!params.enrollmentId || !params.programId) {
      Alert.alert('Missing Context', 'Application details are missing. Please go back and try again.');
      return;
    }

    setIsSubmitting(true);
    try {
      await submit({
        enrollmentId: params.enrollmentId,
        programId: params.programId,
        reason,
        documentUrls,
      });

      Alert.alert(
        'Appeal Submitted',
        'Your appeal has been received and is queued for verification review. You can track its status in My Appeals.',
        [
          {
            text: 'View My Appeals',
            onPress: () => router.replace('/(beneficiary)/my-appeals'),
          },
        ]
      );
    } catch (err) {
      Alert.alert('Submission Failed', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <LogoHeader />

          <View style={styles.navBar}>
            <Pressable onPress={() => router.back()} style={styles.backButton}>
              <FontAwesome name="arrow-left" size={16} color={BrandColors.navy} />
            </Pressable>
            <ThemedText style={styles.screenTitle}>Submit an Appeal</ThemedText>
            <View style={styles.placeholder} />
          </View>

          <View style={styles.content}>
            <ThemedText style={styles.description}>
              If your assistance application was declined or rejected, you may submit clarifying remarks
              or additional supporting documents for review by our verification officers.
            </ThemedText>

            <AppealForm
              programName={params.programName}
              isSubmitting={isSubmitting}
              onSubmit={handleSubmit}
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFC',
  },
  safeArea: {
    flex: 1,
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    width: '100%',
  },
  scrollContent: {
    paddingBottom: BottomTabInset + Spacing.six,
  },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    marginBottom: Spacing.three,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  },
  screenTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: BrandColors.navy,
  },
  placeholder: {
    width: 36,
  },
  content: {
    paddingHorizontal: Spacing.four,
  },
  description: {
    fontSize: 13,
    color: BrandColors.grey,
    lineHeight: 18,
    marginBottom: Spacing.four,
  },
});
