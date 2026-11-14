-- Function public.fetch_illegal_dumping_reports
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- fetch_illegal_dumping_reports(p_status text, p_limit integer, p_offset integer): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.fetch_illegal_dumping_reports(p_status text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, reported_by uuid, location text, coordinates geometry, waste_type text, severity text, size text, photos text[], status text, created_at timestamp with time zone, updated_at timestamp with time zone, latitude numeric, longitude numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    d.id,
    d.reported_by,
    d.location,
    d.coordinates,
    d.waste_type,
    d.severity,
    d.size,
    d.photos,
    d.status,
    d.created_at,
    d.updated_at,
    d.latitude,
    d.longitude
  FROM public.illegal_dumping_mobile d
  WHERE (p_status IS NULL OR d.status = p_status)
  ORDER BY d.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$function$;
