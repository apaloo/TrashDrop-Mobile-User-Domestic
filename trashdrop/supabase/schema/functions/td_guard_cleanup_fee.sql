-- Function public.td_guard_cleanup_fee
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_guard_cleanup_fee(): execute: service_role
CREATE OR REPLACE FUNCTION public.td_guard_cleanup_fee()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then
    return new; -- service key
  end if;
  if coalesce(new.cleanup_fee, 0) > 0
     and (tg_op = 'INSERT' or new.cleanup_fee is distinct from old.cleanup_fee)
     and not public.can_do('dumping.fee') then
    raise exception 'Only an admin or the MMDA can set a cleanup fee' using errcode = '42501';
  end if;
  return new;
end $function$;
