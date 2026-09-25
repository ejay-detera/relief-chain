import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import {
    fetchNotifications,
    markAllNotificationsRead,
    markNotificationRead,
} from '@/services/notification-service';
import type { AppNotification } from '@/types/notification';

export type NotificationsHook = Readonly<{
  notifications: readonly AppNotification[];
  unreadCount: number;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
}>;

/**
 * Loads the signed-in user's notifications and keeps the list live via a
 * Realtime subscription scoped to their own rows, so a beneficiary sees an
 * approval notice (or an org member sees a new applicant) without a manual
 * refresh. RLS already scopes reads to `recipient_id = auth.uid()`; the
 * subscription filter mirrors that boundary rather than relying on it alone.
 */
/** Module-level counter so every hook instance gets a distinct Realtime channel
 * topic. `LogoHeader` (and thus this hook) mounts once per tab screen, and
 * Expo Router's tab navigator keeps inactive tabs mounted rather than
 * unmounting them — so multiple instances are live at once for the same
 * user. Supabase's client reuses a channel object for a topic it has already
 * seen, and calling `.on()` on an already-`subscribe()`d channel throws; a
 * per-instance suffix keeps each mount's channel independent. */
let notificationsChannelSequence = 0;

export function useNotifications(): NotificationsHook {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;

  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);
  const instanceIdRef = useRef<number | null>(null);
  if (instanceIdRef.current === null) {
    instanceIdRef.current = ++notificationsChannelSequence;
  }

  const load = useCallback(async () => {
    if (!userId) {
      setNotifications([]);
      setIsLoading(false);
      return;
    }
    const request = ++requestRef.current;
    setIsLoading(true);
    setError(null);
    try {
      const rows = await fetchNotifications();
      if (request !== requestRef.current) return;
      setNotifications(rows);
    } catch (err) {
      if (request !== requestRef.current) return;
      setError(err instanceof Error ? err.message : 'Unable to load notifications.');
    } finally {
      if (request === requestRef.current) setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`notifications:recipient:${userId}:${instanceIdRef.current}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${userId}` },
        (payload) => {
          const row = payload.new as {
            id: string;
            type: string;
            title: string;
            body: string;
            data: Record<string, unknown> | null;
            is_read: boolean;
            read_at: string | null;
            created_at: string;
          };
          setNotifications((prev) =>
            prev.some((n) => n.id === row.id)
              ? prev
              : [
                  {
                    id: row.id,
                    type: row.type as AppNotification['type'],
                    title: row.title,
                    body: row.body,
                    data: row.data ?? {},
                    isRead: row.is_read,
                    readAt: row.read_at,
                    createdAt: row.created_at,
                  },
                  ...prev,
                ],
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const markRead = useCallback(async (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true, readAt: new Date().toISOString() } : n)),
    );
    try {
      await markNotificationRead(id);
    } catch {
      // Reconcile with the server rather than leaving optimistic state stuck
      // on a failure; the next load() or realtime event will correct it.
      void load();
    }
  }, [load]);

  const markAllRead = useCallback(async () => {
    const now = new Date().toISOString();
    setNotifications((prev) => prev.map((n) => (n.isRead ? n : { ...n, isRead: true, readAt: now })));
    try {
      await markAllNotificationsRead();
    } catch {
      void load();
    }
  }, [load]);

  const unreadCount = notifications.reduce((count, n) => (n.isRead ? count : count + 1), 0);

  return { notifications, unreadCount, isLoading, error, refresh: load, markRead, markAllRead };
}
