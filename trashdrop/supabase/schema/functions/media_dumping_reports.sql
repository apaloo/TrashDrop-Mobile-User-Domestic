-- Function public.media_dumping_reports
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- media_dumping_reports(p_from date, p_to date, p_region text, p_district text, p_status text): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.media_dumping_reports(p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date, p_region text DEFAULT NULL::text, p_district text DEFAULT NULL::text, p_status text DEFAULT NULL::text)
 RETURNS SETOF jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  sc jsonb := public.td_report_scope();
BEGIN
  IF NOT public.td_can_read_media_data() THEN
    RAISE EXCEPTION 'Only approved Media accounts can read this data' USING ERRCODE = '42501';
  END IF;
  IF p_from IS NOT NULL AND p_to IS NOT NULL AND p_to < p_from THEN
    RAISE EXCEPTION 'The end date is before the start date' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT jsonb_build_object(
    'id', r.id,
    'reported_at', r.created_at,
    'status', lower(coalesce(r.status, 'pending')),
    'severity', lower(coalesce(j ->> 'severity', 'medium')),
    'waste_type', lower(coalesce(j ->> 'waste_type', 'mixed')),
    'size', j ->> 'size',
    'region', r.region,
    'district', r.district,
    'area_name', nullif(btrim(j ->> 'area_name'), ''),
    'latitude', ST_Y(p.g),
    'longitude', ST_X(p.g),
    'cleaned_at', CASE WHEN r.status IN ('completed', 'disposed')
                    THEN coalesce((j ->> 'completed_at')::timestamptz, r.updated_at) END,
    'disposed_at', (j ->> 'disposed_at')::timestamptz,
    'cleanup_by', CASE j ->> 'assigned_via' WHEN 'claim' THEN 'volunteer group'
                    WHEN 'admin' THEN 'TrashDrop collector' END,
    'photos', public.td_https_links(j -> 'photos'),
    'cleanup_photos', public.td_https_links(j -> 'cleanup_photos'))
  FROM public.illegal_dumping_mobile r
  CROSS JOIN LATERAL (SELECT to_jsonb(r) AS j) jr
  CROSS JOIN LATERAL (SELECT public.td_report_point(jr.j) AS g) p
  WHERE public.td_in_scope(sc, r.region, r.district)
    AND (p_from IS NULL OR r.created_at >= p_from)
    AND (p_to IS NULL OR r.created_at < p_to + 1)
    AND (p_region IS NULL OR r.region = p_region)
    AND (p_district IS NULL OR r.district = p_district)
    AND (p_status IS NULL OR lower(r.status) = lower(p_status))
  ORDER BY r.created_at DESC
  LIMIT 5000;
END $function$;
