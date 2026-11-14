-- Function public.admin_list_account_roles
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- admin_list_account_roles(p_status text): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.admin_list_account_roles(p_status text DEFAULT 'pending'::text)
 RETURNS TABLE(user_id uuid, email text, name text, company_type text, org_name text, requested_role text, role text, status text, region text, district text, details jsonb, review_note text, reviewed_at timestamp with time zone, created_at timestamp with time zone, signed_up_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
BEGIN
  IF NOT public.can_do('users.manage') THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE = 'insufficient_privilege'; END IF;
  RETURN QUERY
    SELECT r.user_id, u.email::text,
           coalesce(nullif(btrim(concat_ws(' ', u.raw_user_meta_data ->> 'firstName', u.raw_user_meta_data ->> 'lastName')), ''),
                    u.raw_user_meta_data ->> 'name', split_part(u.email, '@', 1))::text,
           r.company_type, r.org_name, r.requested_role, r.role, r.status, r.region, r.district, r.details,
           r.review_note, r.reviewed_at, r.created_at, u.created_at
    FROM public.account_roles r JOIN auth.users u ON u.id = r.user_id
    WHERE p_status IS NULL OR r.status = p_status
    ORDER BY (r.status = 'pending') DESC, r.created_at DESC
    LIMIT 500;
END $function$;
