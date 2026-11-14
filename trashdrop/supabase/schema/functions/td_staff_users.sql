-- Function public.td_staff_users
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_staff_users(): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.td_staff_users()
 RETURNS TABLE(id uuid, email text, name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
begin
  if not public.td_is_staff() then return; end if;
  return query
    select u.id, u.email::text,
           coalesce(nullif(btrim(concat_ws(' ', u.raw_user_meta_data ->> 'firstName', u.raw_user_meta_data ->> 'lastName')), ''),
                    u.raw_user_meta_data ->> 'full_name', split_part(u.email, '@', 1))::text
      from auth.users u
      join public.staff_admins s on s.user_id = u.id
     order by 3;
end $function$;
