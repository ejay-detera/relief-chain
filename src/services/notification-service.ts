import { supabase } from '@/lib/supabase';
import type { AppNotification, NotificationType } from '@/types/notification';

/**
 * Client boundary for in-app notifications. Reads are RLS-scoped to the
 * signed-in user (`recipient_id = auth.uid()`); this service never creates a
 * notification client-side — every row originates from a database trigger
 * (see supabase/migrations/20260925110000_add_notifications.sql). Marking a
 * notification read is the only client write this service performs, and even
 * that is restricted server-side to the `is_read`/`read_at` columns.
 */

type NotificationRow = Readonly<{
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}>;

const SELECT = 'id, type, title, body, data, is_read, read_at, created_at';

const mapRow = (row: NotificationRow): AppNotification => ({
  id: row.id,
  type: row.type as NotificationType,
  title: row.title,
  body: row.body,
  data: row.data ?? {},
  isRead: row.is_read,
  readAt: row.read_at,
  createdAt: row.created_at,
});

/** Fetches the signed-in user's notifications, most recent first. */
export const fetchNotifications = async (limit = 50): Promise<AppNotification[]> => {
  const { data, error } = await supabase
    .from('notifications')
    .select(SELECT)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return ((data ?? []) as unknown as NotificationRow[]).map(mapRow);
};

/** Marks a single notification read. A no-op if it is already read. */
export const markNotificationRead = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('id', id)
    .eq('is_read', false);

  if (error) throw error;
};

/** Marks every currently-unread notification for the signed-in user as read. */
export const markAllNotificationsRead = async (): Promise<void> => {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('is_read', false);

  if (error) throw error;
};
