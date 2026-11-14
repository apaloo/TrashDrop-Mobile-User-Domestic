-- Function public.td_pickup_email_mark
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_pickup_email_mark(p_source text, p_request_id text, p_ok boolean, p_error text): execute: service_role
CREATE OR REPLACE FUNCTION public.td_pickup_email_mark(p_source text, p_request_id text, p_ok boolean, p_error text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  UPDATE public.td_pickup_email_alerts a
     SET status = CASE WHEN p_ok THEN 'sent' WHEN a.attempts >= 5 THEN 'failed' ELSE 'pending' END,
         sent_at = CASE WHEN p_ok THEN now() ELSE a.sent_at END,
         last_error = CASE WHEN p_ok THEN NULL ELSE left(p_error, 500) END
   WHERE a.source = p_source AND a.request_id = p_request_id;
$function$;
