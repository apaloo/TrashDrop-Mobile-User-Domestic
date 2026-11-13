-- An account's region and district decide what it can see and do (district
-- authorities and volunteer groups: illegal dumping reports in their area;
-- waste-management managers: where they assign jobs). request_account_role()
-- took the area from the caller even when the account already had that access
-- and stayed approved, so an approved account could move itself to another
-- area without an admin (found 2026-11-13). Now an account above User keeps
-- its area; only an admin changes it (admin_set_account_area). New applicants
-- still name their area, which the admin sees when approving.

CREATE OR REPLACE FUNCTION public.request_account_role(p_company_type text, p_org_name text DEFAULT NULL::text, p_region text DEFAULT NULL::text, p_district text DEFAULT NULL::text, p_details jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  req text := public.td_role_for_company_type(p_company_type);
  cur public.account_roles;
  -- An account with access above User keeps its region and district: they
  -- decide what it can see, so only an admin changes them (admin_set_account_area)
  own_area boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first' USING ERRCODE = 'insufficient_privilege'; END IF;
  INSERT INTO public.account_roles (user_id) VALUES (auth.uid()) ON CONFLICT DO NOTHING;
  SELECT * INTO cur FROM public.account_roles WHERE user_id = auth.uid() FOR UPDATE;
  own_area := coalesce(cur.role, 'user') = 'user' OR req = 'user';
  UPDATE public.account_roles SET
    company_type = nullif(btrim(coalesce(p_company_type, '')), ''),
    org_name = coalesce(nullif(btrim(coalesce(p_org_name, '')), ''), org_name),
    region = CASE WHEN own_area THEN coalesce(nullif(btrim(coalesce(p_region, '')), ''), region) ELSE region END,
    district = CASE WHEN own_area THEN coalesce(nullif(btrim(coalesce(p_district, '')), ''), district) ELSE district END,
    details = coalesce(details, '{}'::jsonb) || coalesce(p_details, '{}'::jsonb),
    requested_role = req,
    -- same role as already approved, or basic access: nothing to approve
    status = CASE WHEN req = 'user' OR req = cur.role THEN 'approved' ELSE 'pending' END,
    role = CASE WHEN req = 'user' THEN 'user' ELSE role END,
    review_note = NULL,
    updated_at = now()
  WHERE user_id = auth.uid();
  IF req <> 'user' AND req <> cur.role THEN
    PERFORM public.td_write_log('info', 'auth', 'account.role_requested', 'user', auth.uid()::text,
      format('%s requested %s access', coalesce(auth.jwt() ->> 'email', 'An account'), req), NULL,
      jsonb_build_object('requested_role', req, 'company_type', p_company_type));
  END IF;
  RETURN public.my_access();
END $function$;
