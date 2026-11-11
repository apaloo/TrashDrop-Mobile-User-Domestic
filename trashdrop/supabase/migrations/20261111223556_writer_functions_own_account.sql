-- Signed-in callers act only for their own account (staff excepted).
--
-- Follows 20261111222807, which made these functions signed-in only. They
-- take a user id and write rows for it, and until now any signed-in user
-- could pass someone else's id. Each now starts with
--   PERFORM public.td_assert_self_or_staff(<user id parameter>);
-- which lets through: the secret key (service_role), the user themselves,
-- and staff who manage requests (td_can_manage_requests: admin, manager).
-- Anyone else gets error 42501 "Not allowed for this account".
--
-- Callers checked 2026-11-11: the household app passes the signed-in user's
-- own id (onboardingService, PickupRequest.js). The admin portal's call to
-- create_digital_bin uses parameters this function doesn't have, so it
-- already fails (tech-debt TD37). No other callers.
--
-- The line is added to the live definitions, which are otherwise unchanged:
-- the block stops if a definition doesn't have exactly one top-level
-- "BEGIN" line, and skips a function that already has the check.

CREATE OR REPLACE FUNCTION public.td_assert_self_or_staff(p_user uuid)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
BEGIN
  IF coalesce(auth.role(), '') = 'service_role' THEN
    RETURN;
  END IF;
  IF auth.uid() IS NOT NULL AND (p_user = auth.uid() OR public.td_can_manage_requests()) THEN
    RETURN;
  END IF;
  RAISE EXCEPTION 'Not allowed for this account' USING ERRCODE = '42501';
END;
$function$;

REVOKE ALL ON FUNCTION public.td_assert_self_or_staff(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.td_assert_self_or_staff(uuid) TO authenticated, service_role;

DO $$
DECLARE
  t record;
  def text;
  guard text;
  n int;
BEGIN
  FOR t IN
    SELECT * FROM (VALUES
      ('public.add_user_location(uuid, text, text, numeric, numeric)', 'user_uuid'),
      ('public.create_digital_bin(uuid, uuid)', 'user_uuid'),
      ('public.create_onboarding_pickup(uuid, uuid, integer)', 'user_uuid'),
      ('public.create_pickup_request(text, uuid, text, integer, text, text, double precision, double precision, text)', 'p_user_id'),
      ('public.process_qr_scan(uuid, text)', 'user_uuid'),
      ('public.set_has_bags(uuid, boolean)', 'user_uuid'),
      ('public.start_onboarding(uuid)', 'user_uuid')
    ) AS v(fn, param)
  LOOP
    def := pg_get_functiondef(t.fn::regprocedure);
    IF position('td_assert_self_or_staff' IN def) > 0 THEN
      CONTINUE;
    END IF;
    n := (length(def) - length(replace(def, E'\nBEGIN\n', ''))) / length(E'\nBEGIN\n');
    IF n <> 1 THEN
      RAISE EXCEPTION '%: expected one top-level BEGIN line, found %', t.fn, n;
    END IF;
    guard := E'\nBEGIN\n  PERFORM public.td_assert_self_or_staff(' || t.param || E');\n';
    EXECUTE replace(def, E'\nBEGIN\n', guard);
  END LOOP;
END $$;
