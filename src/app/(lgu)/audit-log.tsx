import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, View, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { ThemedText } from '@/components/themed-text';
import { ErrorState } from '@/components/shared/error-state';
import { EmptyState } from '@/components/shared/empty-state';
import { AuditLogRow } from '@/components/AuditLog/AuditLogRow';
import { BrandColors, BottomTabInset, FloatingTabBarHeight, FloatingTabBarGap, Spacing } from '@/constants/theme';
import { useOrganizationId } from '@/hooks/use-organization-id';

type AuditEventRow = {
  id: string;
  actor_identifier: string;
  action: string;
  metadata: Record<string, unknown>;
  occurred_at: string;
};

export default function AuditLogScreen() {
  const organizationId = useOrganizationId();
  const [logs, setLogs] = useState<AuditEventRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = async () => {
    if (!organizationId) return;
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: supaError } = await supabase
        .from('audit_events')
        .select('id, actor_identifier, action, metadata, occurred_at')
        .eq('organization_id', organizationId)
        .order('occurred_at', { ascending: false })
        .limit(100);
      if (supaError) throw supaError;
      setLogs((data as AuditEventRow[]) ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load audit log.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { void fetchLogs(); }, [organizationId]);

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <View style={styles.header}>
        <ThemedText style={styles.pageTitle}>Audit Log</ThemedText>
      </View>
      {isLoading && <ActivityIndicator color={BrandColors.navy} style={{ marginTop: Spacing.four }} />}
      {!isLoading && error && <ErrorState message={error} onRetry={fetchLogs} />}
      {!isLoading && !error && (
        <FlatList
          data={logs}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <AuditLogRow log={item} />}
          refreshing={isLoading}
          onRefresh={fetchLogs}
          ListEmptyComponent={<EmptyState title="No Audit Events" description="Actions will appear here as they occur." />}
          contentContainerStyle={{ paddingBottom: BottomTabInset + FloatingTabBarGap + FloatingTabBarHeight + Spacing.four }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FAFAFC' },
  header: { paddingHorizontal: Spacing.four, paddingTop: Spacing.three, paddingBottom: Spacing.two },
  pageTitle: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 22, color: BrandColors.navy },
});
