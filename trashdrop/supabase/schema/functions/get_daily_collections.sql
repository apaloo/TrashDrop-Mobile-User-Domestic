-- Function public.get_daily_collections
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- get_daily_collections(): execute: service_role
CREATE OR REPLACE FUNCTION public.get_daily_collections()
 RETURNS TABLE(date date, count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    DATE(scanned_at) as date, 
    COUNT(*) as count
  FROM 
    public.scans
  WHERE 
    scanned_at >= NOW() - INTERVAL '7 days'
  GROUP BY 
    DATE(scanned_at)
  ORDER BY 
    date;
END;
$function$;
