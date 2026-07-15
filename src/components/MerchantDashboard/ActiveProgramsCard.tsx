import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import type { MerchantProgram } from '@/types/merchant-program';

type Props = {
  error: Error | null;
  isLoading: boolean;
  onBrowsePress: () => void;
  onRetry: () => void;
  programs: MerchantProgram[];
};

const formatValue = (value: number) => `₱${value.toLocaleString('en-PH', { maximumFractionDigits: 2 })}`;

export const ActiveProgramsCard = ({ error, isLoading, onBrowsePress, onRetry, programs }: Props) => (
  <View style={styles.card}>
    <ThemedText style={styles.title}>Active Programs</ThemedText>
    {isLoading && programs.length === 0 ? <ActivityIndicator color={BrandColors.green} /> : null}
    {error && programs.length === 0 ? <Pressable accessibilityRole="button" onPress={onRetry} style={styles.messageButton}><ThemedText style={styles.message}>Unable to load programs. Tap to retry.</ThemedText></Pressable> : null}
    {!isLoading && !error && programs.length === 0 ? <ThemedText style={styles.message}>No active programs are available.</ThemedText> : null}
    <FlatList data={programs.slice(0, 3)} keyExtractor={(item) => item.id} renderItem={({ item }) => (
      <View style={styles.program}><View style={styles.meta}><ThemedText numberOfLines={1} style={styles.name}>{item.name}</ThemedText><ThemedText style={styles.value}>{formatValue(item.voucherValue)}</ThemedText></View><ThemedText style={styles.type}>{item.voucherTypes.join(', ') || 'General voucher'}</ThemedText></View>
    )} scrollEnabled={false} />
    <Pressable accessibilityRole="button" onPress={onBrowsePress} style={styles.button}><ThemedText style={styles.buttonText}>Browse Programs</ThemedText></Pressable>
  </View>
);

const styles = StyleSheet.create({
  card: { backgroundColor: '#FFFFFF', borderRadius: BorderRadius.md, elevation: 3, padding: Spacing.three, shadowColor: '#000000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: 8 },
  title: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 16, marginBottom: Spacing.three },
  program: { borderBottomColor: BrandColors.lightGray, borderBottomWidth: 1, marginBottom: Spacing.two, paddingBottom: Spacing.two },
  meta: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two, justifyContent: 'space-between' },
  name: { color: BrandColors.navy, flex: 1, fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 10 },
  value: { color: BrandColors.green, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 10 },
  type: { color: BrandColors.grey, fontFamily: 'PlusJakartaSans_400Regular', fontSize: 8, marginTop: 2 },
  messageButton: { paddingVertical: Spacing.two },
  message: { color: BrandColors.grey, fontFamily: 'PlusJakartaSans_400Regular', fontSize: 10, marginBottom: Spacing.three, textAlign: 'center' },
  button: { alignItems: 'center', backgroundColor: BrandColors.navy, borderRadius: BorderRadius.xl, height: 34, justifyContent: 'center' },
  buttonText: { color: '#FFFFFF', fontFamily: 'PlusJakartaSans_700Bold', fontSize: 10 },
});
