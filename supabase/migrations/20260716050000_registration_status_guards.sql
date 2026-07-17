-- Enforce the registration review state machine at the database boundary.
-- RLS determines which actor may reach a row; this trigger determines whether
-- the requested update is a valid state transition for that actor.
create or replace function public.guard_registration_status_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_is_super_admin boolean := public.is_super_admin(actor_id);
begin
  if new.status is null
     or new.status not in ('Pending', 'Approved', 'Rejected') then
    raise exception using
      errcode = '22023',
      message = 'Registration status must be Pending, Approved, or Rejected.';
  end if;

  -- A rejection must always explain the decision. Preserve the submitted text;
  -- the web mutation trims it before calling the database, while this guard
  -- also protects direct database clients from whitespace-only reasons.
  if new.status = 'Rejected'
     and (new.rejection_reason is null or btrim(new.rejection_reason) = '') then
    raise exception using
      errcode = '22023',
      message = 'A non-empty rejection reason is required when rejecting a registration.';
  end if;

  -- Reasons are meaningful only for rejected registrations. Clearing here
  -- keeps updates safe even when a client sends a stale reason value; the table
  -- constraint remains a second line of defense for inserts and other paths.
  if new.status <> 'Rejected' then
    new.rejection_reason := null;
  end if;

  if old.status = 'Pending' then
    if new.status = 'Approved' then
      if not actor_is_super_admin then
        raise exception using
          errcode = '42501',
          message = 'Only a Super Admin can approve a Pending registration.';
      end if;
      return new;
    end if;

    if new.status = 'Rejected' then
      if not actor_is_super_admin then
        raise exception using
          errcode = '42501',
          message = 'Only a Super Admin can reject a Pending registration.';
      end if;
      return new;
    end if;

    -- A Pending row may remain Pending for an ordinary data update. RLS still
    -- controls whether the caller can perform that update at all.
    return new;
  end if;

  if old.status = 'Rejected' then
    if new.status = 'Pending'
       and actor_id = old.lgu_id
       and not actor_is_super_admin then
      -- This is the only permitted resubmission transition. The assignment is
      -- intentional even if the caller supplied a stale rejection reason.
      new.rejection_reason := null;
      return new;
    end if;

    raise exception using
      errcode = '55000',
      message = 'A Rejected registration may only be resubmitted by its owning LGU.';
  end if;

  if old.status = 'Approved' then
    raise exception using
      errcode = '55000',
      message = 'Approved registrations are immutable.';
  end if;

  -- Keep this explicit so a future status value cannot bypass the state
  -- machine if the table constraint is changed independently.
  raise exception using
    errcode = '22023',
    message = 'Invalid registration status transition.';
end;
$$;

drop trigger if exists registrations_status_guard on public.registrations;
create trigger registrations_status_guard
before update on public.registrations
for each row
execute procedure public.guard_registration_status_transition();
