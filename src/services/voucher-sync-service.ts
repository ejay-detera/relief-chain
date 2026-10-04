import { supabase } from '@/lib/supabase';

export interface VoucherSyncEvent {
  type: 'scanned' | 'redeemed' | 'changed';
  enrollmentId?: string;
  programId?: string;
  beneficiaryIdentifier?: string;
  timestamp: string;
}

const localScannedEnrollmentIds = new Set<string>();

/**
 * Checks if an enrollment was scanned in the current session.
 */
export function isVoucherScannedLocally(enrollmentId?: string | null): boolean {
  if (!enrollmentId) return false;
  return localScannedEnrollmentIds.has(enrollmentId);
}

/**
 * Marks an enrollment as scanned locally.
 */
export function markVoucherScannedLocally(enrollmentId?: string | null): void {
  if (enrollmentId) {
    localScannedEnrollmentIds.add(enrollmentId);
  }
}

/**
 * Records that a merchant scanned a beneficiary's voucher.
 * Updates the database (setting enrollments.scanned_at) and broadcasts the scan
 * event over Supabase Realtime so the beneficiary's app reacts instantly.
 */
export async function notifyVoucherScanned(params: {
  merchantEntityId?: string | null;
  beneficiaryIdentifier?: string | null;
  programId?: string | null;
  enrollmentId?: string | null;
}): Promise<void> {
  const { merchantEntityId, beneficiaryIdentifier, programId, enrollmentId } = params;

  if (enrollmentId) {
    localScannedEnrollmentIds.add(enrollmentId);
  }

  // 1. Call DB RPC to update scanned_at timestamp
  try {
    if (beneficiaryIdentifier || enrollmentId) {
      const { data, error } = await supabase.rpc('record_voucher_scan', {
        p_merchant_entity_id: merchantEntityId ?? null,
        p_beneficiary_identifier: enrollmentId ?? beneficiaryIdentifier ?? null,
        p_program_id: programId ?? null,
      });

      if (!error && data && typeof data === 'object' && (data as any).enrollment_id) {
        localScannedEnrollmentIds.add((data as any).enrollment_id);
      }
    }
  } catch (err) {
    console.warn('[voucher-sync] RPC record_voucher_scan notice:', err);
  }

  // 2. Broadcast realtime event across connected clients
  try {
    const channel = supabase.channel('voucher-sync-global');
    await channel.send({
      type: 'broadcast',
      event: 'voucher_scanned',
      payload: {
        enrollmentId,
        programId,
        beneficiaryIdentifier,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.warn('[voucher-sync] Broadcast error:', err);
  }
}

/**
 * Broadcasts that a redemption occurred, notifying any listening beneficiary screens.
 */
export async function notifyVoucherRedeemed(params: {
  enrollmentId?: string | null;
  programId?: string | null;
  beneficiaryIdentifier?: string | null;
  amountPhp?: string | number;
  remainingBalancePhp?: string | number;
}): Promise<void> {
  const { enrollmentId, programId, beneficiaryIdentifier, amountPhp, remainingBalancePhp } = params;

  if (enrollmentId) {
    localScannedEnrollmentIds.add(enrollmentId);
  }

  try {
    const channel = supabase.channel('voucher-sync-global');
    await channel.send({
      type: 'broadcast',
      event: 'voucher_redeemed',
      payload: {
        enrollmentId,
        programId,
        beneficiaryIdentifier,
        amountPhp,
        remainingBalancePhp,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.warn('[voucher-sync] Broadcast redemption error:', err);
  }
}

/**
 * Subscribes to voucher scan & redemption events via both Realtime broadcast
 * and postgres_changes table listeners.
 */
export function subscribeToVoucherLifecycle(params: {
  enrollmentId?: string | null;
  beneficiaryId?: string | null;
  onSync: (event: VoucherSyncEvent) => void;
}): () => void {
  const { enrollmentId, beneficiaryId, onSync } = params;
  const channelName = `voucher-sync-${enrollmentId || beneficiaryId || 'all'}-${Math.random().toString(36).substring(2, 7)}`;
  const channel = supabase.channel(channelName);

  // 1. Listen for broadcast scan events
  channel.on('broadcast', { event: 'voucher_scanned' }, (payload) => {
    const data = payload.payload as Record<string, unknown> | undefined;
    const incomingEnrollmentId = data?.enrollmentId as string | undefined;

    if (incomingEnrollmentId) {
      localScannedEnrollmentIds.add(incomingEnrollmentId);
    }

    if (!enrollmentId || incomingEnrollmentId === enrollmentId) {
      onSync({
        type: 'scanned',
        enrollmentId: incomingEnrollmentId,
        programId: data?.programId as string | undefined,
        beneficiaryIdentifier: data?.beneficiaryIdentifier as string | undefined,
        timestamp: (data?.timestamp as string) || new Date().toISOString(),
      });
    }
  });

  // 2. Listen for broadcast redemption events
  channel.on('broadcast', { event: 'voucher_redeemed' }, (payload) => {
    const data = payload.payload as Record<string, unknown> | undefined;
    const incomingEnrollmentId = data?.enrollmentId as string | undefined;

    if (incomingEnrollmentId) {
      localScannedEnrollmentIds.add(incomingEnrollmentId);
    }

    if (!enrollmentId || incomingEnrollmentId === enrollmentId) {
      onSync({
        type: 'redeemed',
        enrollmentId: incomingEnrollmentId,
        programId: data?.programId as string | undefined,
        beneficiaryIdentifier: data?.beneficiaryIdentifier as string | undefined,
        timestamp: (data?.timestamp as string) || new Date().toISOString(),
      });
    }
  });

  // 3. Listen to postgres_changes on enrollments
  if (enrollmentId) {
    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'enrollments',
        filter: `id=eq.${enrollmentId}`,
      },
      () => {
        onSync({
          type: 'changed',
          enrollmentId,
          timestamp: new Date().toISOString(),
        });
      }
    );
  } else if (beneficiaryId) {
    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'enrollments',
        filter: `beneficiary_id=eq.${beneficiaryId}`,
      },
      (payload) => {
        const row = payload.new as { id?: string } | undefined;
        onSync({
          type: 'changed',
          enrollmentId: row?.id,
          timestamp: new Date().toISOString(),
        });
      }
    );
  }

  // 4. Listen to postgres_changes on redemptions
  if (enrollmentId) {
    channel.on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'redemptions',
        filter: `enrollment_id=eq.${enrollmentId}`,
      },
      () => {
        onSync({
          type: 'redeemed',
          enrollmentId,
          timestamp: new Date().toISOString(),
        });
      }
    );
  } else if (beneficiaryId) {
    channel.on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'redemptions',
        filter: `beneficiary_id=eq.${beneficiaryId}`,
      },
      (payload) => {
        const row = payload.new as { enrollment_id?: string } | undefined;
        onSync({
          type: 'redeemed',
          enrollmentId: row?.enrollment_id,
          timestamp: new Date().toISOString(),
        });
      }
    );
  }

  // 5. Listen to postgres_changes on beneficiary_balance_projection
  channel.on(
    'postgres_changes',
    {
      event: 'UPDATE',
      schema: 'public',
      table: 'beneficiary_balance_projection',
    },
    () => {
      onSync({
        type: 'changed',
        enrollmentId: enrollmentId ?? undefined,
        timestamp: new Date().toISOString(),
      });
    }
  );

  channel.subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
