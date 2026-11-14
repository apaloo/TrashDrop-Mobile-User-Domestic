-- Function public.get_collector_performance
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- get_collector_performance(): execute: service_role
CREATE OR REPLACE FUNCTION public.get_collector_performance()
 RETURNS TABLE(collector_id uuid, name text, collections bigint, avg_time numeric, rating numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    c.id as collector_id,
    CONCAT(c.first_name, ' ', c.last_name) as name,
    COUNT(s.id) as collections,
    AVG(EXTRACT(EPOCH FROM (s.scanned_at - pr.accepted_at)) / 60)::NUMERIC as avg_time,
    c.rating
  FROM 
    public.collectors c
    LEFT JOIN public.scans s ON c.id = s.scanned_by
    LEFT JOIN public.bags b ON s.bag_id = b.id
    LEFT JOIN public.pickup_requests pr ON b.request_id = pr.id
  WHERE 
    s.scanned_at >= NOW() - INTERVAL '30 days'
  GROUP BY 
    c.id, c.first_name, c.last_name, c.rating
  ORDER BY 
    collections DESC;
END;
$function$;
