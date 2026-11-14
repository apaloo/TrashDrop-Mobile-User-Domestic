-- Function public.td_user_name
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_user_name(p_user uuid): execute: service_role
CREATE OR REPLACE FUNCTION public.td_user_name(p_user uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
  SELECT coalesce(nullif(btrim(concat_ws(' ', u.raw_user_meta_data ->> 'firstName', u.raw_user_meta_data ->> 'lastName')), ''),
                  nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''), split_part(u.email, '@', 1))
  FROM auth.users u WHERE u.id = p_user
$function$;
