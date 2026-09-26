-- ORG-04 program status workflow: every status change is timestamped and logged
-- with the acting user. The application writes only the allowed direct stages
-- (active → closing, closing → closed); funding stages move through the
-- treasury activation flow and reconciler. This trigger records all of them —
-- whoever the writer is — into the append-only audit trail without gating the
-- write itself (enforcement lives in RLS + the owning flows).
create or replace function private.log_program_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status and new.organization_id is not null then
    perform public.append_audit_event(
      new.organization_id,
      (select auth.uid()),
      'program.status_change',
      gen_random_uuid(),
      false,
      jsonb_build_object(
        'program_id', new.id,
        'from_status', old.status,
        'to_status', new.status
      )
    );
  end if;
  return new;
end;
$$;

drop trigger if exists programs_log_status_change on public.programs;
create trigger programs_log_status_change
after update of status on public.programs
for each row execute function private.log_program_status_change();

comment on function private.log_program_status_change() is
  'Appends program.status_change audit events (actor + timestamp) for the ORG-04 workflow; never blocks the write.';
