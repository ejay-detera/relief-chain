-- Close the BEN-07 notification gap: "aid release" and "successful
-- redemption" never created a beneficiary-facing notification, and
-- `beneficiary_appeals` had no trigger at all despite the `appeal_submitted`
-- / `appeal_decision` types already existing in the `notifications` check
-- constraint (added by 20261001190000) with full client-side icon/color
-- support (see `src/types/notification.ts`,
-- `src/components/shared/NotificationsModal.tsx`). Only
-- `enrollments_notify_on_change` (application submitted/approved/rejected)
-- and `settlements_notify_on_confirmed` (merchant payment, addressed to the
-- merchant, not the beneficiary) existed before this migration.
--
-- This adds three triggers, following the exact `enqueue_notification` /
-- security-definer pattern established in 20260925110000_add_notifications.sql:
--
--   1. distribution_recipients -> 'confirmed'  => notify the beneficiary
--      ('aid_released'). This is the real aid-release event: funds have
--      landed in the beneficiary's wallet via the disbursement workflow.
--   2. settlements -> 'confirmed'              => notify the beneficiary
--      ('redemption_confirmed'), in addition to the existing merchant
--      notification. A new type is added since none of the existing types
--      describe "your redemption just settled" from the beneficiary's side.
--   3. beneficiary_appeals INSERT/UPDATE       => notify the beneficiary on
--      submission ('appeal_submitted') and on a decision transition
--      ('appeal_decision').

alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check check (
    type in (
      'application_submitted',
      'application_approved',
      'application_rejected',
      'new_applicant',
      'merchant_payment_received',
      'aid_released',
      'appeal_submitted',
      'appeal_decision',
      'redemption_confirmed'
    )
  );

-- ---------------------------------------------------------------------------
-- 1: distribution_recipients -> aid released
-- ---------------------------------------------------------------------------
create or replace function private.notify_on_distribution_recipient_confirmed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  beneficiary_user_id uuid;
  program_name text;
  amount_display text;
begin
  if new.status <> 'confirmed' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'confirmed' then
    -- Already notified when it first became confirmed; never re-notify.
    return new;
  end if;

  select user_id into beneficiary_user_id
  from public.beneficiary_identities
  where id = new.beneficiary_identity_id;

  if beneficiary_user_id is null then
    return new;
  end if;

  select name into program_name
  from public.programs
  where id = new.program_id;

  amount_display := to_char(new.amount_stroops::numeric / 10000000.0, 'FM999999999990.0000000');

  perform private.enqueue_notification(
    beneficiary_user_id,
    'aid_released',
    'Aid released',
    format(
      'Your assistance of %s RCPHP under "%s" has been released to your wallet.',
      amount_display,
      coalesce(program_name, 'your relief program')
    ),
    jsonb_build_object(
      'programId', new.program_id,
      'distributionRecipientId', new.id,
      'amountStroops', new.amount_stroops::text
    )
  );

  return new;
end;
$$;

revoke all privileges on function private.notify_on_distribution_recipient_confirmed()
  from public, anon, authenticated;

create trigger distribution_recipients_notify_on_confirmed
after insert or update on public.distribution_recipients
for each row execute function private.notify_on_distribution_recipient_confirmed();

-- ---------------------------------------------------------------------------
-- 2: settlements -> redemption confirmed (beneficiary side)
--
-- Separate from the existing `notify_on_settlement_confirmed` (merchant
-- side) rather than folding into it, so neither notification's delivery
-- depends on the other and a future change to one does not risk silently
-- breaking the other.
-- ---------------------------------------------------------------------------
create or replace function private.notify_on_settlement_confirmed_beneficiary()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  beneficiary_user_id uuid;
  amount_display text;
begin
  if new.status <> 'confirmed' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'confirmed' then
    return new;
  end if;

  select identity.user_id into beneficiary_user_id
  from public.payment_intents intent
  join public.beneficiary_identities identity on identity.id = intent.beneficiary_identity_id
  where intent.id = new.payment_intent_id;

  if beneficiary_user_id is null then
    return new;
  end if;

  amount_display := to_char(new.amount_stroops::numeric / 10000000.0, 'FM999999999990.0000000');

  perform private.enqueue_notification(
    beneficiary_user_id,
    'redemption_confirmed',
    'Redemption successful',
    format('Your redemption of %s RCPHP was confirmed.', amount_display),
    jsonb_build_object('settlementId', new.id, 'amountStroops', new.amount_stroops::text)
  );

  return new;
end;
$$;

revoke all privileges on function private.notify_on_settlement_confirmed_beneficiary()
  from public, anon, authenticated;

create trigger settlements_notify_on_confirmed_beneficiary
after insert or update on public.settlements
for each row execute function private.notify_on_settlement_confirmed_beneficiary();

-- ---------------------------------------------------------------------------
-- 3: beneficiary_appeals -> submitted / decided
-- ---------------------------------------------------------------------------
create or replace function private.notify_on_appeal_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  program_name text;
begin
  select name into program_name from public.programs where id = new.program_id;

  if tg_op = 'INSERT' then
    perform private.enqueue_notification(
      new.beneficiary_id,
      'appeal_submitted',
      'Appeal submitted',
      format('Your appeal for "%s" was submitted and is queued for review.', coalesce(program_name, 'your application')),
      jsonb_build_object('appealId', new.id, 'programId', new.program_id)
    );
    return new;
  end if;

  -- tg_op = 'UPDATE': notify only on a genuine transition into approved/rejected.
  if new.status is distinct from old.status and new.status in ('approved', 'rejected') then
    perform private.enqueue_notification(
      new.beneficiary_id,
      'appeal_decision',
      case when new.status = 'approved' then 'Appeal approved' else 'Appeal rejected' end,
      case
        when new.status = 'approved' then
          format('Your appeal for "%s" was approved. Your application has been reopened for review.', coalesce(program_name, 'your application'))
        else
          format('Your appeal for "%s" was rejected.', coalesce(program_name, 'your application'))
      end,
      jsonb_build_object('appealId', new.id, 'programId', new.program_id, 'status', new.status)
    );
  end if;

  return new;
end;
$$;

revoke all privileges on function private.notify_on_appeal_change()
  from public, anon, authenticated;

create trigger beneficiary_appeals_notify_on_change
after insert or update on public.beneficiary_appeals
for each row execute function private.notify_on_appeal_change();

comment on function private.notify_on_distribution_recipient_confirmed() is
  'Notifies the beneficiary (aid_released) when their distribution_recipients row reaches confirmed — the real on-chain aid-release event.';
comment on function private.notify_on_settlement_confirmed_beneficiary() is
  'Notifies the beneficiary (redemption_confirmed) when a settlement tied to their payment_intent is confirmed, independent of the existing merchant-side notification.';
comment on function private.notify_on_appeal_change() is
  'Notifies the beneficiary on appeal submission (appeal_submitted) and on a transition to approved/rejected (appeal_decision).';
