-- Function public.get_illegal_dumping_with_coordinates
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- get_illegal_dumping_with_coordinates(): execute: service_role
CREATE OR REPLACE FUNCTION public.get_illegal_dumping_with_coordinates()
 RETURNS TABLE(id uuid, reported_by uuid, location text, latitude double precision, longitude double precision, waste_type text, severity text, size text, photos text[], status text, created_at timestamp with time zone, updated_at timestamp with time zone)
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
        COALESCE(d.latitude::double precision, ST_Y(d.coordinates::geometry)) as latitude,
        COALESCE(d.longitude::double precision, ST_X(d.coordinates::geometry)) as longitude,
        d.waste_type,
        d.severity,
        d.size,
        COALESCE(d.photos, '{}'::text[]) as photos,
        d.status,
        d.created_at,
        d.updated_at
    FROM public.illegal_dumping_mobile d
    ORDER BY d.created_at DESC;
END;
$function$;
