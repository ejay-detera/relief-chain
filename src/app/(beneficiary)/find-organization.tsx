import { FontAwesome } from '@expo/vector-icons';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { DUMMY_ORGANIZATIONS } from '@/constants/dummy-data';
import { BorderRadius, BottomTabInset, BrandColors, Spacing } from '@/constants/theme';

export default function FindOrganizationScreen() {
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <ThemedText style={styles.title}>Find Organization</ThemedText>
          <ThemedText style={styles.subtitle}>Locate relief organizations and government offices near you.</ThemedText>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {DUMMY_ORGANIZATIONS.map((org) => (
            <View key={org.id} style={styles.card}>
              <View style={styles.iconCircle}>
                <FontAwesome color="white" name="building" size={18} />
              </View>
              <View style={styles.info}>
                <ThemedText style={styles.name}>{org.name}</ThemedText>
                <ThemedText style={styles.meta}>{org.category} · {org.location}</ThemedText>
              </View>
              <ThemedText style={styles.distance}>{org.distanceKm} km</ThemedText>
            </View>
          ))}
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
  },
  header: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.six,
    paddingBottom: Spacing.four,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: BrandColors.navy,
    marginBottom: Spacing.one,
  },
  subtitle: {
    fontSize: 13,
    color: BrandColors.grey,
    lineHeight: 18,
  },
  scrollContent: {
    paddingHorizontal: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.six,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: BorderRadius.lg,
    padding: Spacing.three,
    marginBottom: Spacing.three,
    boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: BrandColors.navy,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.three,
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: 14,
    fontWeight: '600',
    color: BrandColors.navy,
    marginBottom: 2,
  },
  meta: {
    fontSize: 12,
    color: BrandColors.grey,
  },
  distance: {
    fontSize: 12,
    fontWeight: '700',
    color: BrandColors.green,
  },
});
