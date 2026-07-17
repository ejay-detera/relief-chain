-- Reconcile the immutable legacy programs.status check with the verified hosted values.
-- This migration changes constraints only; it does not rewrite program data.
do $$
declare
  legacy_count integer;
  compatible_count integer;
  legacy_name text;
  unexpected_constraints text;
begin
  select
    count(*) filter (where n.definition =
      'status=anyarray[''active''::text,''closed''::text]'),
    count(*) filter (where n.definition =
      'status=anyarray[''draft''::text,''active''::text,''scheduled''::text,''completed''::text,''closed''::text]'),
    string_agg(format('%I: %s', c.conname, pg_get_constraintdef(c.oid, true)), '; ')
      filter (where n.definition not in (
        'status=anyarray[''active''::text,''closed''::text]',
        'status=anyarray[''draft''::text,''active''::text,''scheduled''::text,''completed''::text,''closed''::text]'
      ))
  into legacy_count, compatible_count, unexpected_constraints
  from pg_constraint c
  join pg_attribute a
    on a.attrelid = c.conrelid
   and a.attnum = any (c.conkey)
   and not a.attisdropped
  cross join lateral (
    select regexp_replace(
      lower(pg_get_expr(c.conbin, c.conrelid, true)),
      '[[:space:]()]', '', 'g'
    ) as definition
  ) n
  where c.conrelid = 'public.programs'::regclass
    and c.contype = 'c'
    and a.attname = 'status';

  if unexpected_constraints is not null then
    raise exception 'Unexpected programs.status check constraint(s): %', unexpected_constraints;
  end if;

  if legacy_count > 1 then
    raise exception 'Expected at most one legacy programs.status check, found %', legacy_count;
  end if;

  if legacy_count = 0 and compatible_count = 0 then
    raise exception 'No recognized programs.status check constraint exists';
  end if;

  if legacy_count = 1 then
    select c.conname into strict legacy_name
    from pg_constraint c
    join pg_attribute a
      on a.attrelid = c.conrelid
     and a.attnum = any (c.conkey)
     and not a.attisdropped
    where c.conrelid = 'public.programs'::regclass
      and c.contype = 'c'
      and a.attname = 'status'
      and regexp_replace(lower(pg_get_expr(c.conbin, c.conrelid, true)),
        '[[:space:]()]', '', 'g') =
        'status=anyarray[''active''::text,''closed''::text]';

    execute format('alter table public.programs drop constraint %I', legacy_name);
  end if;

  if compatible_count = 0 then
    alter table public.programs
      add constraint programs_status_hosted_values_check
      check (status = any (array[
        'draft'::text, 'active'::text, 'scheduled'::text,
        'completed'::text, 'closed'::text
      ]));
  end if;
end
$$;