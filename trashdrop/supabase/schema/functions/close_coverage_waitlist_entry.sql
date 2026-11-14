-- Function public.close_coverage_waitlist_entry
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- close_coverage_waitlist_entry(p_waitlist_id uuid, p_reason text): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.close_coverage_waitlist_entry(p_waitlist_id uuid, p_reason text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  UPDATE public.coverage_waitlist
  SET closed_at = now(),
      close_reason = p_reason
  WHERE id = p_waitlist_id
    AND user_id = auth.uid()
    AND closed_at IS NULL;
$function$;
