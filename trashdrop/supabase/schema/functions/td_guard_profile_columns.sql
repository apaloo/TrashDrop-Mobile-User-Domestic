-- Function public.td_guard_profile_columns
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_guard_profile_columns(): execute: anon, authenticated, service_role
CREATE OR REPLACE FUNCTION public.td_guard_profile_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.role := 'user';
    new.points := 0;
    new.level := 'Eco Starter';
    new.phone_verified := false;
  else
    new.role := old.role;
    new.points := old.points;
    new.level := old.level;
    new.phone_verified := old.phone_verified;
  end if;
  return new;
end;
$function$;
