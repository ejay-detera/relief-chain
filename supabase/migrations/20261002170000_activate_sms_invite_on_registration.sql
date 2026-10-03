-- Close the other half of the US8 invite-activation gap: previously nothing
-- ever consumed a `pending_sms_invites` row when the targeted person
-- actually registered — `invite_code` was minted, "sent" via the SMS stub,
-- and then permanently orphaned at `status = 'pending'` even after the
-- person signed up with the exact phone number the invite was sent to.
--
-- The SMS text itself (`src/services/sms-service.ts`) offers two paths:
-- "Use activation code X or register in ReliefChain to claim your
-- assistance." Registering is already how a beneficiary becomes eligible
-- for a private program — `private.is_program_invited_beneficiary()`
-- (20261002120000_enforce_private_program_access.sql) matches on phone
-- number alone, no code entry required. What was missing is simply marking
-- the invite as consumed once that registration happens, so staff reviewing
-- the import queue (`fetchPendingSmsInvites`) see an accurate picture
-- instead of every invite sitting at 'pending' forever.
--
-- This adds a trigger on `profiles`: whenever a beneficiary profile's
-- `mobile_number` is set (on insert, or on a later update — e.g. a
-- profile created before a phone number was collected), any
-- `pending_sms_invites` row with status 'pending' whose normalized phone
-- matches is flipped to 'registered' and the beneficiary is notified that
-- their invited program is now visible to them.

create or replace function private.activate_sms_invites_for_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  invite record;
begin
  if new.role <> 'beneficiary' or new.mobile_number is null then
    return new;
  end if;

  if tg_op = 'UPDATE'
    and old.mobile_number is not null
    and private.normalize_phone(old.mobile_number) = private.normalize_phone(new.mobile_number) then
    -- Phone number did not actually change; nothing new to activate.
    return new;
  end if;

  for invite in
    update public.pending_sms_invites
    set status = 'registered'
    where status = 'pending'
      and normalized_phone = private.normalize_phone(new.mobile_number)
    returning id, program_id
  loop
    perform private.enqueue_notification(
      new.id,
      'added_to_program_list',
      'You have been added to a program',
      format(
        'An organization has added you to the targeted beneficiary list for "%s". Check your assistance list to see if you need to apply.',
        coalesce((select name from public.programs where id = invite.program_id), 'a relief program')
      ),
      jsonb_build_object('programId', invite.program_id, 'pendingSmsInviteId', invite.id)
    );
  end loop;

  return new;
end;
$$;

revoke all privileges on function private.activate_sms_invites_for_profile()
  from public, anon, authenticated;

create trigger profiles_activate_sms_invites
after insert or update of mobile_number, role on public.profiles
for each row execute function private.activate_sms_invites_for_profile();

comment on function private.activate_sms_invites_for_profile() is
  'Flips any pending_sms_invites row matching this beneficiary''s phone number to registered when they sign up or add a phone number, and notifies them in-app. Closes the gap where invite_code was minted and sent but never consumed by anything.';
