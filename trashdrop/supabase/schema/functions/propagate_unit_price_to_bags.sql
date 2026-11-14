-- Function public.propagate_unit_price_to_bags
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- propagate_unit_price_to_bags(): execute: anon, authenticated, service_role
CREATE OR REPLACE FUNCTION public.propagate_unit_price_to_bags()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  UPDATE bags
  SET unit_price = NEW.unit_price
  WHERE batch_id = NEW.id
    AND unit_price IS NULL;
  RETURN NEW;
END;
$function$;
