-- Function public.get_user_contacts
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- get_user_contacts(p_user_id uuid): execute: authenticated, service_role
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
