import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { ThemedText } from '@/components/themed-text';
import { BrandColors, BorderRadius, Spacing } from '@/constants/theme';

type AuditEventRow = {
  id: string;
  actor_identifier: string;
  action: string;
  metadata: Record<string, unknown>;
  occurred_at: string;
};

type Props = { log: AuditEventRow };

export const AuditLogRow = ({ log }: Props) => {
  const [expanded, setExpanded] = useState(false);

  const getActionColor = (action: string) => {
    if (action.includes('reject') || action.includes('revoke') || action.includes('suspend')) return '#E74C3C';
    if (action.includes('approve') || action.includes('active')) return BrandColors.green;
    return BrandColors.navy;
  };

  const actionColor = getActionColor(log.action);
  const metadataStr = JSON.stringify(log.metadata, null, 2);

  return (
    <View style={styles.card}>
      <Pressable style={styles.row} onPress={() => setExpanded(!expanded)} accessibilityRole="button">
        <View style={styles.info}>
          <View style={styles.actionRow}>
            <View style={[styles.dot, { backgroundColor: actionColor }]} />
            <ThemedText style={styles.action}>{log.action}</ThemedText>
          </View>
          <View style={styles.metaRow}>
            <ThemedText style={styles.actor}>{log.actor_identifier}</ThemedText>
            <ThemedText style={styles.dotSeparator}>•</ThemedText>
            <ThemedText style={styles.date}>
              {new Date(log.occurred_at).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </ThemedText>
          </View>
        </View>
        <FontAwesome name={expanded ? 'chevron-up' : 'chevron-down'} size={12} color={BrandColors.grey} />
      </Pressable>
      {expanded && (
        <View style={styles.expanded}>
          <ThemedText style={styles.jsonText}>{metadataStr}</ThemedText>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: { backgroundColor: '#FFF', borderRadius: BorderRadius.md, borderWidth: 0.5, borderColor: 'rgba(151,151,151,0.35)', marginHorizontal: Spacing.three, marginBottom: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, padding: Spacing.three },
  info: { flex: 1, gap: 4 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  dot: { width: 8, height: 8, borderRadius: 4 },
  action: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 13, color: BrandColors.navy },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actor: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 11, color: BrandColors.grey },
  dotSeparator: { fontSize: 10, color: BrandColors.grey },
  date: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 10, color: BrandColors.grey },
  expanded: { backgroundColor: '#F8F9F9', padding: Spacing.three, borderBottomLeftRadius: BorderRadius.md, borderBottomRightRadius: BorderRadius.md, borderTopWidth: 1, borderTopColor: BrandColors.lightGray },
  jsonText: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 11, color: BrandColors.navy }, // monospace font could be used if available
});
