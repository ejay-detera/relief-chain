import { FontAwesome } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PILOT_NETWORK_LABEL, PILOT_NO_VALUE_LABEL } from '@/constants/pilot-disclosure';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import type {
    DistributionJobObservation,
    DistributionJobProjection,
    DistributionJobStatus,
} from '@/types/distribution';
import { formatStroops } from '@/utils/format-stroops';

type Props = {
  job: DistributionJobObservation;
  refreshing: boolean;
  onRefresh: () => void;
};

const STATUS_LABEL: Record<DistributionJobStatus, string> = {
  draft: 'Draft',
  validating: 'Validating recipients',
  awaiting_approval: 'Awaiting authorization',
  queued: 'Queued for submission',
  submitting: 'Submitting to the network',
  reconciling: 'Confirming on-chain',
  completed: 'Completed',
  partial_failed: 'Completed with failures',
  cancelled: 'Cancelled',
};

const isTerminal = (status: DistributionJobStatus): boolean =>
  status === 'completed' || status === 'partial_failed' || status === 'cancelled';

/**
 * Renders the honest lifecycle of a server-managed distribution job. Every state
 * is explicit — loading, empty, unavailable, in-flight, and terminal — and no
 * progress is ever simulated with a timer (Requirements 21.1, 21.2). Confirmed
 * counts and reconciliation time come only from observed reconciled state.
 */
export const DistributionProgress = ({ job, refreshing, onRefresh }: Props) => {
  if (job.status === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={BrandColors.navy} />
        <ThemedText style={styles.mutedText}>Loading distribution status…</ThemedText>
      </View>
    );
  }

  if (job.status === 'empty') {
    return (
      <View style={styles.center}>
        <FontAwesome name="inbox" size={44} color={BrandColors.lightGray} />
        <ThemedText style={styles.mutedText}>No distribution job has been started yet.</ThemedText>
      </View>
    );
  }

  if (job.status === 'unavailable') {
    return (
      <View style={styles.center}>
        <FontAwesome name="exclamation-triangle" size={40} color={BrandColors.yellow} />
        <ThemedText style={styles.title}>Status unavailable</ThemedText>
        <ThemedText style={styles.mutedText}>{job.reason}</ThemedText>
        {job.retryable && (
          <Pressable onPress={onRefresh} style={styles.retryBtn} disabled={refreshing}>
            <ThemedText style={styles.retryBtnText}>{refreshing ? 'Retrying…' : 'Try again'}</ThemedText>
          </Pressable>
        )}
      </View>
    );
  }

  const { job: projection, reconciliation } = job;

  return (
    <View style={styles.container}>
      <View style={styles.statusCard}>
        <View style={styles.statusHeader}>
          <StatusIcon status={projection.status} refreshing={refreshing} />
          <View style={styles.statusHeaderText}>
            <ThemedText style={styles.statusLabel}>{STATUS_LABEL[projection.status]}</ThemedText>
            <ThemedText style={styles.disclosure}>
              {PILOT_NETWORK_LABEL} · {PILOT_NO_VALUE_LABEL}
            </ThemedText>
          </View>
          <Pressable onPress={onRefresh} hitSlop={8} disabled={refreshing} style={styles.refreshBtn}>
            <FontAwesome
              name="refresh"
              size={16}
              color={refreshing ? BrandColors.grey : BrandColors.navy}
            />
          </Pressable>
        </View>

        {reconciliation ? (
          <ReconciliationBanner
            isStale={reconciliation.isStale}
            isQuarantined={reconciliation.isQuarantined}
            reconciledAt={reconciliation.reconciledAt}
          />
        ) : (
          !isTerminal(projection.status) && (
            <ThemedText style={styles.pendingNote}>
              Awaiting first reconciliation. Recipients show as pending until confirmed on-chain.
            </ThemedText>
          )
        )}
      </View>

      <CountsGrid projection={projection} />
    </View>
  );
};

const StatusIcon = ({ status, refreshing }: { status: DistributionJobStatus; refreshing: boolean }) => {
  if (!isTerminal(status) && refreshing) {
    return <ActivityIndicator size="small" color={BrandColors.navy} />;
  }
  if (status === 'completed') {
    return <FontAwesome name="check-circle" size={22} color={BrandColors.green} />;
  }
  if (status === 'partial_failed') {
    return <FontAwesome name="exclamation-circle" size={22} color={BrandColors.yellow} />;
  }
  if (status === 'cancelled') {
    return <FontAwesome name="times-circle" size={22} color={BrandColors.grey} />;
  }
  return <FontAwesome name="clock-o" size={22} color={BrandColors.navy} />;
};

const ReconciliationBanner = ({
  isStale,
  isQuarantined,
  reconciledAt,
}: {
  isStale: boolean;
  isQuarantined: boolean;
  reconciledAt: string;
}) => {
  const reconciledLabel = new Date(reconciledAt).toLocaleString();
  if (isQuarantined) {
    return (
      <ThemedText style={[styles.banner, styles.bannerQuarantined]}>
        Under operator review. Balances are held until a reconciliation mismatch is resolved.
      </ThemedText>
    );
  }
  if (isStale) {
    return (
      <ThemedText style={[styles.banner, styles.bannerStale]}>
        Showing the last reconciled state as of {reconciledLabel}. Newer ledger data is pending.
      </ThemedText>
    );
  }
  return <ThemedText style={styles.banner}>Reconciled as of {reconciledLabel}.</ThemedText>;
};

const CountsGrid = ({ projection }: { projection: DistributionJobProjection }) => (
  <View style={styles.grid}>
    <CountCell label="Recipients" value={String(projection.recipientCount)} tone="navy" />
    <CountCell label="Confirmed" value={String(projection.confirmedCount)} tone="green" />
    <CountCell label="Pending" value={String(projection.pendingCount + projection.submittedCount)} tone="navy" />
    <CountCell label="Failed" value={String(projection.failedCount)} tone={projection.failedCount > 0 ? 'yellow' : 'grey'} />
    <CountCell
      label="Confirmed amount"
      value={`${formatStroops(projection.confirmedAmountStroops)} RCPHP`}
      tone="green"
      wide
    />
  </View>
);

const TONE_COLOR = {
  navy: BrandColors.navy,
  green: BrandColors.green,
  yellow: '#B8860B',
  grey: BrandColors.grey,
} as const;

const CountCell = ({
  label,
  value,
  tone,
  wide,
}: {
  label: string;
  value: string;
  tone: keyof typeof TONE_COLOR;
  wide?: boolean;
}) => (
  <View style={[styles.cell, wide && styles.cellWide]}>
    <ThemedText style={styles.cellLabel}>{label}</ThemedText>
    <ThemedText style={[styles.cellValue, { color: TONE_COLOR[tone] }]}>{value}</ThemedText>
  </View>
);

const styles = StyleSheet.create({
  container: {
    padding: Spacing.four,
    gap: Spacing.four,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.six,
    gap: Spacing.three,
  },
  statusCard: {
    backgroundColor: 'white',
    borderRadius: BorderRadius.lg,
    padding: Spacing.four,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: Spacing.three,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  statusHeaderText: {
    flex: 1,
  },
  refreshBtn: {
    padding: Spacing.one,
  },
  statusLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: BrandColors.navy,
  },
  disclosure: {
    fontSize: 11,
    color: BrandColors.grey,
    marginTop: 2,
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    color: BrandColors.navy,
  },
  mutedText: {
    fontSize: 13,
    color: BrandColors.grey,
    textAlign: 'center',
  },
  pendingNote: {
    fontSize: 12,
    color: BrandColors.grey,
    lineHeight: 17,
  },
  banner: {
    fontSize: 12,
    color: BrandColors.navy,
    lineHeight: 17,
  },
  bannerStale: {
    color: '#B8860B',
  },
  bannerQuarantined: {
    color: '#B91C1C',
    fontWeight: '600',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
  },
  cell: {
    flexGrow: 1,
    flexBasis: '45%',
    backgroundColor: 'white',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: Spacing.three,
    gap: 4,
  },
  cellWide: {
    flexBasis: '100%',
  },
  cellLabel: {
    fontSize: 11,
    color: BrandColors.grey,
  },
  cellValue: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  retryBtn: {
    marginTop: Spacing.two,
    backgroundColor: BrandColors.navy,
    borderRadius: BorderRadius.full,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
  retryBtnText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 13,
  },
});
