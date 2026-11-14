-- Function public.volunteer_claimable_reports
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- volunteer_claimable_reports(): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.volunteer_claimable_reports()
 RETURNS SETOF jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF public.td_my_volunteer_profile() IS NULL THEN
    RAISE EXCEPTION 'Only approved volunteer groups can see reports to claim' USING ERRCODE = '42501';
  END IF;
  PERFORM public.td_release_expired_claims();
  RETURN QUERY
  SELECT jsonb_build_object(
           'id', r.id,
           'location', j ->> 'location',
           'area_name', j ->> 'area_name',
           'region', r.region,
           'district', r.district,
           'latitude', ST_Y(p.g),
           'longitude', ST_X(p.g),
           'severity', j ->> 'severity',
           'waste_type', j ->> 'waste_type',
           'size', j ->> 'size',
           'description', j ->> 'description',
           'photos', j -> 'photos',
           'created_at', r.created_at)
  FROM public.illegal_dumping_mobile r
  CROSS JOIN LATERAL (SELECT to_jsonb(r) AS j) jr
  CROSS JOIN LATERAL (SELECT public.td_report_point(jr.j) AS g) p
  WHERE r.status = 'verified' AND r.assigned_to IS NULL
    AND public.td_in_my_area(r.region, r.district)
  ORDER BY r.created_at;
END $function$;
