-- Function public.td_record_activity
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_record_activity(p_account uuid, p_activity text, p_entity_id text, p_region text, p_district text, p_value numeric, p_metadata jsonb, p_once boolean): execute: service_role
CREATE OR REPLACE FUNCTION public.td_record_activity(p_account uuid, p_activity text, p_entity_id text, p_region text, p_district text, p_value numeric DEFAULT NULL::numeric, p_metadata jsonb DEFAULT '{}'::jsonb, p_once boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_account IS NULL OR p_entity_id IS NULL THEN RETURN; END IF;
  INSERT INTO public.account_activity
    (account_id, account_role, activity, entity_id, region, district, value, metadata, dedupe_key, team_id)
  VALUES
    (p_account, public.td_activity_role(p_account), p_activity, p_entity_id, p_region, p_district,
     p_value, coalesce(p_metadata, '{}'::jsonb),
     CASE WHEN p_once THEN p_activity || ':' || p_entity_id END,
     public.td_team_of(p_account))
  ON CONFLICT (dedupe_key) DO NOTHING;
END $function$;
