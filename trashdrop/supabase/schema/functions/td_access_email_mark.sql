-- Function public.td_access_email_mark
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_access_email_mark(p_user_id uuid, p_reviewed_at timestamp with time zone, p_ok boolean, p_error text): execute: service_role
CREATE OR REPLACE FUNCTION public.td_access_email_mark(p_user_id uuid, p_reviewed_at timestamp with time zone, p_ok boolean, p_error text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  UPDATE public.td_access_decision_emails e
     SET status = CASE WHEN p_ok THEN 'sent' WHEN e.attempts >= 5 THEN 'failed' ELSE 'pending' END,
         sent_at = CASE WHEN p_ok THEN now() ELSE e.sent_at END,
         last_error = CASE WHEN p_ok THEN NULL ELSE left(p_error, 500) END
   WHERE e.user_id = p_user_id AND e.reviewed_at = p_reviewed_at;
$function$;
