-- Function public.log_media_export
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- log_media_export(p_filters jsonb, p_rows integer): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.log_media_export(p_filters jsonb, p_rows integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  who text := coalesce(auth.jwt() ->> 'email', 'A Media account');
  org text := (SELECT org_name FROM public.account_roles WHERE user_id = auth.uid());
BEGIN
  IF NOT public.td_can_read_media_data() THEN
    RAISE EXCEPTION 'Only approved Media accounts can export this data' USING ERRCODE = '42501';
  END IF;
  PERFORM public.td_write_log('info', 'admin', 'media.export', 'illegal_dumping', NULL,
    format('%s%s downloaded %s report(s)', who, CASE WHEN org IS NOT NULL THEN ' (' || org || ')' ELSE '' END, coalesce(p_rows, 0)),
    NULL, NULL, jsonb_build_object('filters', coalesce(p_filters, '{}'::jsonb), 'rows', p_rows),
    auth.uid(), who, public.td_my_role());
END $function$;
