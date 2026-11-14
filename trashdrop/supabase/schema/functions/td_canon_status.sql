-- Function public.td_canon_status
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_canon_status(s text): execute: anon, authenticated, service_role
CREATE OR REPLACE FUNCTION public.td_canon_status(s text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  SELECT CASE
    WHEN v IN ('pending', 'available', 'new', 'requested', 'scheduled', 'open') THEN 'pending'
    WHEN v IN ('accepted', 'assigned', 'confirmed', 'reserved') THEN 'accepted'
    WHEN v IN ('en_route', 'in_transit', 'started', 'in_progress') THEN 'en_route'
    WHEN v = 'arrived' THEN 'arrived'
    WHEN v IN ('collecting', 'picked_up') THEN 'collecting'
    WHEN v IN ('disposed', 'completed', 'collected', 'done') THEN 'disposed'
    WHEN v IN ('cancelled', 'canceled', 'rejected', 'declined', 'failed') THEN 'cancelled'
    WHEN v = 'expired' THEN 'expired'
    ELSE v END
  FROM (SELECT regexp_replace(lower(btrim(coalesce(s, 'pending'))), '[\s-]+', '_', 'g') AS v) x
$function$;
