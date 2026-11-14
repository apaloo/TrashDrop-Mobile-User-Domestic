-- Function public.sync_collector_online_status
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- sync_collector_online_status(): execute: anon, authenticated, service_role
CREATE OR REPLACE FUNCTION public.sync_collector_online_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  IF NEW.status = 'suspended' THEN
    NEW.is_online := false;
    RETURN NEW;
  END IF;

  -- If last_active was just updated and is recent (within last 5 minutes)
  IF NEW.last_active IS NOT NULL AND
     NEW.last_active > NOW() - INTERVAL '5 minutes' THEN
    -- Set collector as online and active
    NEW.is_online := true;
    NEW.status := CASE
      WHEN NEW.status = 'busy' THEN 'busy'  -- Preserve busy status if already set
      ELSE 'active'
    END;
  ELSIF NEW.last_active IS NOT NULL AND
        NEW.last_active <= NOW() - INTERVAL '5 minutes' THEN
    -- Set collector as offline and inactive if last_active is older than 5 minutes
    NEW.is_online := false;
    NEW.status := 'inactive';
  END IF;

  RETURN NEW;
END;
$function$;
