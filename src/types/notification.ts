/**
 * In-app notification types. All rows are created server-side by database
 * triggers (enrollment submitted/approved/rejected, a new applicant for an
 * organization, a confirmed merchant payment) — the client can only read its
 * own notifications and mark them read, never create or edit their content
 * (enforced by RLS + a column-restricting trigger; see
 * supabase/migrations/20260925110000_add_notifications.sql).
 */
export type NotificationType =
  | 'application_submitted'
  | 'application_approved'
  | 'application_rejected'
  | 'new_applicant'
  | 'merchant_payment_received';

export type AppNotification = Readonly<{
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  data: Readonly<Record<string, unknown>>;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}>;
