import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import type { MerchantProgram } from '@/types/merchant-dashboard';

type ActiveProgramsCardProps = { onBrowsePress: () => void; programs: MerchantProgram[] };

export const ActiveProgramsCard = ({ onBrowsePress, programs }: ActiveProgramsCardProps) => (
  <View style={styles.card}>
    <ThemedText style={styles.title}>Active Programs</ThemedText>
    <FlatList
      data={programs}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <View style={styles.program}><View style={styles.meta}><ThemedText style={styles.name}>{item.name}</ThemedText><ThemedText style={styles.percent}>{item.completion} %</ThemedText></View><View style={styles.track}><View style={[styles.progress, { width: `${item.completion}%` }]} /></View></View>}
      scrollEnabled={false}
    />
    <Pressable accessibilityRole="button" onPress={onBrowsePress} style={styles.button}><ThemedText style={styles.buttonText}>Browse More Programs</ThemedText></Pressable>
  </View>
);

const styles = StyleSheet.create({
  card: { backgroundColor: '#FFFFFF', borderRadius: BorderRadius.md, elevation: 3, padding: Spacing.three, shadowColor: '#000000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: 8 },
  title: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 16, marginBottom: Spacing.three },
  program: { marginBottom: Spacing.three },
  meta: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.one },
  name: { color: BrandColors.grey, fontFamily: 'PlusJakartaSans_400Regular', fontSize: 9 },
  percent: { color: BrandColors.green, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 9 },
  track: { backgroundColor: '#9E9E9E', borderRadius: BorderRadius.full, height: 18, overflow: 'hidden' },
  progress: { backgroundColor: BrandColors.green, height: '100%' },
  button: { alignItems: 'center', backgroundColor: BrandColors.navy, borderRadius: BorderRadius.xl, height: 34, justifyContent: 'center' },
  buttonText: { color: '#FFFFFF', fontFamily: 'PlusJakartaSans_700Bold', fontSize: 10 },
});
