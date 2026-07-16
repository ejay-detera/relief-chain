import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BrandColors, Spacing } from '@/constants/theme';
import type { ProjectionState } from '@/types/projection';
import { reconciledAtLabel } from '@/utils/projection-state';

type Tone = 'muted' | 'light';

type Props = {
  /** Any projection state; only the reconciliation metadata/trust state is read. */
  state: ProjectionState<unknown>;
  /** A verifiable Stellar transaction reference for the confirmed financial event. */
  transactionHash?: string | null;
  /** `light` renders on dark/gradient cards; `muted` on white surfaces. */
  tone?: Tone;
};

const shortHash = (hash: string): string =>
  hash.length > 16 ? `${hash.slice(0, 8)}…${hash.slice(-6)}` : hash;

/**
 * Renders the provenance of a reconciled value: its reconciliation time, stale or
 * quarantined trust state, and a verifiable transaction reference. A reconciled
 * value is never shown without this context (Requirements 18.6, 21.3, 21.6).
 */
export function ReconciliationBadge({ state, transactionHash, tone = 'muted' }: Props) {
  const color = tone === 'light' ? 'rgba(255,255,255,0.85)' : BrandColors.grey;

  let caption: string | null = null;
  switch (state.status) {
    case 'current':
      caption = reconciledAtLabel(state.metadata.reconciledAt);
      break;
    case 'stale':
      caption = `Stale · ${reconciledAtLabel(state.metadata.reconciledAt)}`;
      break;
    case 'quarantined':
      caption = `Under review · issue ${state.issueId}`;
      break;
    case 'unavailable':
      caption = 'Reconciliation unavailable';
      break;
    default:
      caption = null;
  }

  if (!caption) return null;

  return (
    <View style={styles.container}>
      <ThemedText style={[styles.caption, { color }]}>{caption}</ThemedText>
      {transactionHash ? (
        <ThemedText style={[styles.hash, { color }]} numberOfLines={1}>
          Ref: {shortHash(transactionHash)}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: Spacing.one, rowGap: 1 },
  caption: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 10 },
  hash: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 9 },
});
