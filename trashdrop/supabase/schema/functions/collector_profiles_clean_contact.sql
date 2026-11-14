-- Function public.collector_profiles_clean_contact
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- collector_profiles_clean_contact(): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.collector_profiles_clean_contact()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  clash record;
BEGIN
  IF public.td_gh_phone(NEW.phone) IS NOT NULL THEN
    NEW.phone := public.td_gh_phone(NEW.phone);
  END IF;
  IF NEW.email IS NOT NULL AND NEW.email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[a-z]{2,}$' THEN
    NEW.email := NULL; -- e.g. the phone number the collector app copies into email
  END IF;
  NEW.email := lower(nullif(btrim(NEW.email), ''));

  -- Duplicates: block admin-added collectors (no app account yet) that reuse
  -- the phone or email of another collector. App sign-ups are never blocked.
  -- The cleanup script sets app.collector_cleanup = on to fix existing rows.
  IF coalesce(current_setting('app.collector_cleanup', true), '') <> 'on'
     AND NEW.user_id IS NULL AND (TG_OP = 'INSERT'
      OR NEW.phone IS DISTINCT FROM OLD.phone OR NEW.email IS DISTINCT FROM OLD.email) THEN
    SELECT id, first_name, last_name INTO clash
    FROM public.collector_profiles c
    WHERE c.id IS DISTINCT FROM NEW.id
      AND ((NEW.phone IS NOT NULL AND public.td_gh_phone(c.phone) = public.td_gh_phone(NEW.phone))
        OR (NEW.email IS NOT NULL AND lower(c.email) = NEW.email))
    LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'duplicate collector: % % already uses this phone number or email', clash.first_name, clash.last_name
        USING ERRCODE = 'unique_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
