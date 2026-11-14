-- Function public.get_waste_distribution
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- get_waste_distribution(): execute: service_role
CREATE OR REPLACE FUNCTION public.get_waste_distribution()
 RETURNS TABLE(waste_type text, percentage numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  RETURN QUERY
  WITH waste_counts AS (
    SELECT 
      b.type as waste_type, 
      COUNT(*) as count
    FROM 
      public.scans s
      JOIN public.bags b ON s.bag_id = b.id
    WHERE 
      s.scanned_at >= NOW() - INTERVAL '30 days'
    GROUP BY 
      b.type
  ),
  total_waste AS (
    SELECT SUM(count) as total FROM waste_counts
  )
  SELECT 
    wc.waste_type, 
    ROUND((wc.count::NUMERIC / NULLIF(tw.total, 0)::NUMERIC) * 100, 1) as percentage
  FROM 
    waste_counts wc, total_waste tw
  ORDER BY 
    percentage DESC;
END;
$function$;
