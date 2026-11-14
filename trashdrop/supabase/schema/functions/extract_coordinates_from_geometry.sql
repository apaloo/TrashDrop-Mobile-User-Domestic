-- Function public.extract_coordinates_from_geometry
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- extract_coordinates_from_geometry(report_id uuid): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.extract_coordinates_from_geometry(report_id uuid)
 RETURNS TABLE(id uuid, latitude double precision, longitude double precision)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
    RETURN QUERY
    SELECT 
        d.id,
        ST_Y(d.coordinates::geometry) as latitude,
        ST_X(d.coordinates::geometry) as longitude
    FROM public.illegal_dumping_mobile d
    WHERE d.id = report_id
    AND d.coordinates IS NOT NULL;
END;
$function$;
