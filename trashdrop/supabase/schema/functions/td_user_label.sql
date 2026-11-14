-- Function public.td_user_label
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_user_label(p_id uuid): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.td_user_label(p_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE r text;
BEGIN
  IF p_id IS NULL OR NOT public.td_is_staff() THEN RETURN NULL; END IF; -- names are for admins only
  IF to_regclass('public.profiles') IS NOT NULL THEN
    EXECUTE $q$SELECT nullif(btrim(concat_ws(' ', to_jsonb(p) ->> 'first_name', to_jsonb(p) ->> 'last_name')), '')
               FROM public.profiles p WHERE p.id = $1$q$ INTO r USING p_id;
  END IF;
  IF r IS NULL THEN
    SELECT coalesce(nullif(btrim(concat_ws(' ', u.raw_user_meta_data ->> 'firstName', u.raw_user_meta_data ->> 'lastName')), ''),
                    nullif(btrim(concat_ws(' ', u.raw_user_meta_data ->> 'first_name', u.raw_user_meta_data ->> 'last_name')), ''),
                    u.raw_user_meta_data ->> 'full_name', u.email)
    INTO r FROM auth.users u WHERE u.id = p_id;
  END IF;
  RETURN r;
END $function$;
