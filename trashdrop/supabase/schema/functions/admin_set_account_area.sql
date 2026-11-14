-- Function public.admin_set_account_area
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- admin_set_account_area(p_user_id uuid, p_region text, p_district text): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.admin_set_account_area(p_user_id uuid, p_region text, p_district text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  reg text := nullif(btrim(coalesce(p_region, '')), '');
  dis text := nullif(btrim(coalesce(p_district, '')), '');
  old public.account_roles;
  me text := auth.jwt() ->> 'email';
BEGIN
  IF NOT public.can_do('users.manage') THEN RAISE EXCEPTION 'Only TrashDrop admins can change an account''s area'; END IF;
  IF reg IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.gh_districts WHERE region = reg) THEN
    RAISE EXCEPTION 'Unknown region: %', reg;
  END IF;
  IF dis IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.gh_districts WHERE name = dis AND region = reg) THEN
    RAISE EXCEPTION 'Choose a district in the % region', coalesce(reg, 'selected');
  END IF;
  SELECT * INTO old FROM public.account_roles WHERE user_id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Account not found'; END IF;
  IF old.region IS NOT DISTINCT FROM reg AND old.district IS NOT DISTINCT FROM dis THEN
    RETURN jsonb_build_object('region', reg, 'district', dis, 'changed', false);
  END IF;
  UPDATE public.account_roles SET region = reg, district = dis, updated_at = now() WHERE user_id = p_user_id;
  PERFORM public.td_write_log('info', 'admin', 'account.area_changed', 'user', p_user_id::text,
    format('%s set the area of %s to %s', coalesce(me, 'An admin'),
           coalesce((SELECT email FROM auth.users WHERE id = p_user_id), p_user_id::text),
           coalesce(concat_ws(', ', dis, reg), 'none')),
    jsonb_build_object('region', old.region, 'district', old.district),
    jsonb_build_object('region', reg, 'district', dis),
    '{}'::jsonb, auth.uid(), me, 'admin');
  RETURN jsonb_build_object('region', reg, 'district', dis, 'changed', true);
END $function$;
