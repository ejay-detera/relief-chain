-- Allow authenticated users to execute private.can_view_payment_workflow.
-- Migration 20260716090000_add_payment_workflows.sql used this helper in RLS policies
-- on public.refunds, public.payment_intents, and public.voucher_redemptions, but
-- mistakenly revoked execute privileges from authenticated, causing permission denied
-- errors during merchant settlements and refunds retrieval.

grant usage on schema private to authenticated;
grant execute on function private.can_view_payment_workflow(uuid, uuid, uuid) to authenticated;
