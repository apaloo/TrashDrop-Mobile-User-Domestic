-- Function public.enforce_active_collector_claim
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- enforce_active_collector_claim(): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.enforce_active_collector_claim()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW; -- service role / backend
  END IF;

  IF NEW.collector_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.collector_id IS DISTINCT FROM OLD.collector_id) THEN

    IF NOT public.is_active_collector(NEW.collector_id) THEN
      RAISE EXCEPTION 'Only registered, active collectors can take jobs'
        USING ERRCODE = '42501';
    END IF;

    -- A collector taking a request or bin for themselves must be On-Duty
    IF TG_TABLE_NAME IN ('pickup_requests', 'digital_bins')
       AND NEW.collector_id = auth.uid()
       AND NOT EXISTS (
         SELECT 1 FROM public.collector_profiles cp
         WHERE cp.user_id = auth.uid() AND cp.on_duty
       ) THEN
      RAISE EXCEPTION 'Go On-Duty to accept requests'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
