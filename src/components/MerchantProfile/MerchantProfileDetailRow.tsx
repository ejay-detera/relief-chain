import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];
type Props = { icon: IconName; label: string; value: string };
export const MerchantProfileDetailRow = ({ icon, label, value }: Props) => <View style={styles.row}>
  <View style={styles.icon}><MaterialCommunityIcons color={BrandColors.navy} name={icon} size={21} /></View>
  <View style={styles.copy}><ThemedText style={styles.label}>{label}</ThemedText><ThemedText numberOfLines={2} selectable style={styles.value}>{value}</ThemedText></View>
</View>;
const styles = StyleSheet.create({
  row: { alignItems: 'center', backgroundColor: BrandColors.lightGray, borderRadius: BorderRadius.xl, flexDirection: 'row', minHeight: 68, padding: Spacing.three },
  icon: { alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: BorderRadius.full, height: 40, justifyContent: 'center', width: 40 }, copy: { flex: 1, marginLeft: Spacing.three },
  label: { color: BrandColors.grey, fontFamily: 'PlusJakartaSans_500Medium', fontSize: 10 }, value: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 12, marginTop: 2 },
});
