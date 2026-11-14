-- Function public.td_account_role_on_signup
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_account_role_on_signup(): execute: anon, authenticated, service_role
CREATE OR REPLACE FUNCTION public.td_account_role_on_signup()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  meta jsonb := coalesce(NEW.raw_user_meta_data, '{}'::jsonb);
  ct text := nullif(meta ->> 'companyType', '');
  req text := public.td_role_for_company_type(ct);
  det jsonb := CASE WHEN jsonb_typeof(meta -> 'accessDetails') = 'object' THEN meta -> 'accessDetails' ELSE '{}'::jsonb END;
BEGIN
  BEGIN
    INSERT INTO public.account_roles (user_id, company_type, org_name, requested_role, role, status, region, district, details)
    VALUES (NEW.id, ct, nullif(meta ->> 'companyName', ''), req, 'user',
            CASE WHEN req = 'user' THEN 'approved' ELSE 'pending' END,
            nullif(meta ->> 'region', ''), nullif(meta ->> 'district', ''), det)
    ON CONFLICT (user_id) DO NOTHING;
    IF req <> 'user' THEN
      PERFORM public.td_write_log('info', 'auth', 'account.role_requested', 'user', NEW.id::text,
        format('%s requested %s access', coalesce(NEW.email, 'A new account'), req), NULL,
        jsonb_build_object('requested_role', req, 'company_type', ct, 'region', meta ->> 'region', 'district', meta ->> 'district'),
        '{}'::jsonb, NEW.id, NEW.email, 'user');
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL; -- never block a sign-up; my_access() creates the row later if needed
  END;
  RETURN NEW;
END $function$;
