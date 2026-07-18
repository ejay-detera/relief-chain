import { Pressable, StyleSheet, View } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { BrandColors, BorderRadius, Spacing } from '@/constants/theme';

export const SubmissionConfirmationStep = () => {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconCircle}>
          <FontAwesome name="clock-o" size={36} color={BrandColors.yellow} />
        </View>
        <ThemedText style={styles.title}>Application Submitted</ThemedText>
        <ThemedText style={styles.body}>
          Your merchant application is under review. You will be notified once it has been approved or rejected.
        </ThemedText>
        <Pressable
          style={styles.button}
          onPress={() => router.replace('/(merchant)/' as any)}
          accessibilityRole="button"
        >
          <ThemedText style={styles.buttonText}>Go to Dashboard</ThemedText>
        </Pressable>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.four, gap: Spacing.three },
  iconCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: BrandColors.lightGray, alignItems: 'center', justifyContent: 'center' },
  title: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 22, textAlign: 'center' },
  body: { color: BrandColors.grey, fontFamily: 'PlusJakartaSans_400Regular', fontSize: 14, lineHeight: 22, textAlign: 'center' },
  button: { backgroundColor: BrandColors.navy, borderRadius: BorderRadius.xl, paddingVertical: Spacing.three, paddingHorizontal: Spacing.five, alignSelf: 'stretch', alignItems: 'center' },
  buttonText: { color: '#FFFFFF', fontFamily: 'PlusJakartaSans_700Bold', fontSize: 15 },
});
