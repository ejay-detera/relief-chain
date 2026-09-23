-- Atomic pending/failed -> prepared -> submitted transition for distribution
-- recipients.
--
-- submit-disbursement previously performed this as two separate `.update()`
-- calls from the Edge Function. The on-chain transfer is already submitted to
-- Stellar by the time either call runs, but if the function crashed or timed
-- out between the two updates, a recipient could be left stuck in `prepared`
-- with no attempt to move it forward: `submit-disbursement`'s retry mode only
-- re-drives recipients in `pending` or `failed`, not `prepared`, and the
-- `distribution_recipients_validate_mutation` trigger does not allow a direct
-- `pending -> submitted` jump. Wrapping both hops in one function makes the
-- transition atomic from the caller's point of view: either both status
-- writes land, or neither does.
create or replace function public.mark_distribution_recipient_submitted(
  p_recipient_id uuid,
  p_transaction_hash text
)
returns public.distribution_recipients
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated public.distribution_recipients;
begin
  update public.distribution_recipients
  set status = 'prepared'
  where id = p_recipient_id
    and status in ('pending', 'failed');

  update public.distribution_recipients
  set status = 'submitted', transaction_hash = p_transaction_hash
  where id = p_recipient_id
    and status = 'prepared'
  returning * into updated;

  if updated.id is null then
    select * into updated from public.distribution_recipients where id = p_recipient_id;
  end if;

  return updated;
end;
$$;

revoke all privileges on function public.mark_distribution_recipient_submitted(uuid, text)
  from public, anon, authenticated;
grant execute on function public.mark_distribution_recipient_submitted(uuid, text) to service_role;

comment on function public.mark_distribution_recipient_submitted is
  'Atomically moves a distribution recipient pending/failed -> prepared -> submitted in one transaction, so a crash between the two status hops can never leave the row stuck in "prepared".';
