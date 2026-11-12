-- Database security, round 3 (TD19; secure development principle 8; owner's
-- approval 2026-11-12).
-- Older functions that run with their owner's rights and didn't check who
-- is calling. Checked against all three apps and the API logs on 2026-11-12.

-- 1. Contact lookups (admin site: messages, notifications, pickups). Staff
--    who manage requests (admin, manager) get what they ask for; anyone else
--    gets only their own row.
CREATE OR REPLACE FUNCTION public.get_user_contacts(p_user_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, name text, email text, phone text, role text, status text, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    COALESCE(NULLIF(TRIM(CONCAT_WS(' ', p.first_name, p.last_name)), ''), p.email, 'Unknown User')::text AS name,
    COALESCE(p.email, '')::text AS email,
    COALESCE(p.phone, '')::text AS phone,
    COALESCE(p.role, 'user')::text AS role,
    'active'::text AS status,
    p.created_at,
    p.updated_at
  FROM public.profiles p
  WHERE (p_user_id IS NULL OR p.id = p_user_id)
    AND (public.td_can_manage_requests() OR auth.role() = 'service_role' OR p.id = auth.uid());
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_user_emails(user_ids uuid[])
 RETURNS TABLE(id uuid, email text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT au.id, au.email::text
  FROM auth.users au
  WHERE au.id = ANY(user_ids)
    AND (public.td_can_manage_requests() OR auth.role() = 'service_role' OR au.id = auth.uid());
$function$;

REVOKE EXECUTE ON FUNCTION public.get_user_contacts(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_user_emails(uuid[]) FROM PUBLIC, anon;

-- 2. Old functions no app calls (none in 24 hours of API logs; the admin site
--    marks the dumping ones deprecated). They change dumping reports or pickup
--    requests without checking who is calling. Server-only from now on.
DO $$
DECLARE f regprocedure;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
    WHERE p.proname IN ('update_illegal_dumping_status', 'assign_cleanup_team', 'merge_dumping_reports',
                        'merge_dumping_reports_comprehensive', 'merge_dumping_reports_fixed', 'test_merge_dumping_reports',
                        'accept_pickup_request', 'mark_request_picked_up', 'dispose_bags')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;
END $$;
