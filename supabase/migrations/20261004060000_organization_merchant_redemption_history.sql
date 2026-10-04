-- Migration: 20261004060000_organization_merchant_redemption_history.sql
-- Purpose: Support organization admin viewing a merchant's redemption history (ORG-11 / ORG-011)
-- Allows an authenticated organization admin to monitor financial aid transactions processed by an accredited merchant.

create or replace function public.get_organization_merchant_redemptions(
  p_merchant_id uuid,
  p_org_id uuid default null,
  p_program_id uuid default null,
  p_start_date timestamptz default null,
  p_end_date timestamptz default null
)
returns table (
  id uuid,
  merchant_id uuid,
  program_id uuid,
  program_name text,
  beneficiary_id uuid,
  beneficiary_name text,
  beneficiary_reference text,
  category text,
  amount numeric,
  status text,
  remaining_balance numeric,
  tx_hash text,
  redeemed_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_effective_org_id uuid;
begin
  -- 1. Resolve and verify the caller's organization ID
  v_effective_org_id := private.resolve_caller_organization_id(p_org_id);
  if v_effective_org_id is null then
    raise exception 'Unauthorized: caller must belong to an active organization' using errcode = '42501';
  end if;

  -- 2. Query redemptions filtered by merchant and organization's programs
  return query
  select
    r.id,
    coalesce(r.merchant_id, p_merchant_id) as merchant_id,
    p.id as program_id,
    coalesce(p.name, 'Relief Program') as program_name,
    r.beneficiary_id,
    coalesce(prof.full_name, 'Citizen Beneficiary') as beneficiary_name,
    case
      when prof.full_name is not null then
        prof.full_name || ' (B-' || substring(r.beneficiary_id::text from 1 for 4) || ')'
      else
        'Beneficiary (B-' || substring(r.beneficiary_id::text from 1 for 6) || ')'
    end as beneficiary_reference,
    coalesce(r.category, p.voucher_type, 'General Aid') as category,
    coalesce(r.amount, 0::numeric) as amount,
    coalesce(r.status, 'Completed') as status,
    r.remaining_balance,
    r.tx_hash,
    r.redeemed_at
  from public.redemptions r
  left join public.enrollments e on e.id = r.enrollment_id
  left join public.programs p on p.id = coalesce(r.program_id, e.program_id)
  left join public.profiles prof on prof.id = r.beneficiary_id
  where
    (r.merchant_id = p_merchant_id or r.merchant_name in (
      select me.display_name from public.merchant_entities me where me.id = p_merchant_id
    ))
    -- Organization scoping: either program belongs to caller's org, or enrollment belongs to caller's org
    and (
      p.organization_id = v_effective_org_id
      or e.organization_id = v_effective_org_id
      or exists (
        select 1 from public.merchant_accreditations ma
        where ma.organization_id = v_effective_org_id
          and ma.merchant_id = p_merchant_id
      )
    )
    and (p_program_id is null or p.id = p_program_id)
    and (p_start_date is null or r.redeemed_at >= p_start_date)
    and (p_end_date is null or r.redeemed_at <= p_end_date)
  order by r.redeemed_at desc;
end;
$$;

revoke all privileges on function public.get_organization_merchant_redemptions(uuid, uuid, uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.get_organization_merchant_redemptions(uuid, uuid, uuid, timestamptz, timestamptz) to authenticated;
