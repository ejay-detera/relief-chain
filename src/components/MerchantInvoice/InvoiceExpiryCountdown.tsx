import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';

type Props = {
  /** ISO-8601 UTC expiry instant (exactly ten minutes after issuance). */
  expiresAt: string;
  /** Fired once when the invoice crosses its expiry. */
  onExpired: () => void;
};

const formatRemaining = (ms: number): string => {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

/**
 * Renders the live ten-minute invoice expiry (Requirement 10.4). When the window
 * elapses it fires `onExpired` exactly once so the shell can require a new
 * invoice with a fresh nonce (Requirement 13.5).
 */
export const InvoiceExpiryCountdown = ({ expiresAt, onExpired }: Props) => {
  const expiryMs = Date.parse(expiresAt);
  const [remainingMs, setRemainingMs] = useState(() => expiryMs - Date.now());

  useEffect(() => {
    let fired = false;
    const tick = () => {
      const next = expiryMs - Date.now();
      setRemainingMs(next);
      if (next <= 0 && !fired) {
        fired = true;
        onExpired();
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [expiryMs, onExpired]);

  const expired = remainingMs <= 0;
  return (
    <View style={[styles.pill, expired ? styles.expired : styles.active]}>
      <ThemedText style={[styles.text, expired ? styles.expiredText : styles.activeText]}>
        {expired ? 'Invoice expired — create a new one' : `Expires in ${formatRemaining(remainingMs)}`}
      </ThemedText>
    </View>
  );
};

const styles = StyleSheet.create({
  pill: { alignSelf: 'center', borderRadius: BorderRadius.full, paddingHorizontal: Spacing.three, paddingVertical: Spacing.one },
  active: { backgroundColor: 'rgba(17,46,88,0.08)' },
  expired: { backgroundColor: 'rgba(192,57,43,0.12)' },
  text: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13 },
  activeText: { color: BrandColors.navy },
  expiredText: { color: '#C0392B' },
});
