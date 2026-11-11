-- Functions that change data run only for the callers that need them.
--
-- These SECURITY DEFINER functions write data and do not check the caller
-- themselves, and Postgres granted EXECUTE to everyone by default. Grants
-- now match how each one is really used (callers checked in all three
-- repositories and in the database, 2026-11-11):
--
-- Server and database only (Netlify functions with the secret key,
-- triggers, scheduled jobs). Nothing in the apps calls them:
--   WhatsApp booking: cleanup_whatsapp_messages, get_active_whatsapp_session,
--     record_whatsapp_message, update_whatsapp_session, upsert_whatsapp_user
--   increment_completed_requests (called by SECURITY DEFINER triggers)
--   redeem_reward, dismiss_onboarding (no caller)
--
-- Signed-in app users (household onboarding and pickups, admin digital bins),
-- never signed-out visitors:
--   add_user_location, create_digital_bin, create_onboarding_pickup,
--   create_pickup_request, process_qr_scan, set_has_bags, start_onboarding,
--   cleanup_expired_digital_bins
--
-- Function bodies are unchanged. Checking that a signed-in caller acts only
-- for their own account is the next step (tech-debt TD19).

DO $$
DECLARE
  f text;
  server_only text[] := ARRAY[
    'public.cleanup_whatsapp_messages()',
    'public.get_active_whatsapp_session(text)',
    'public.record_whatsapp_message(text, text)',
    'public.update_whatsapp_session(uuid, text, jsonb)',
    'public.upsert_whatsapp_user(text, text)',
    'public.increment_completed_requests(uuid)',
    'public.redeem_reward(uuid, uuid)',
    'public.dismiss_onboarding(uuid)'
  ];
  signed_in text[] := ARRAY[
    'public.add_user_location(uuid, text, text, numeric, numeric)',
    'public.create_digital_bin(uuid, uuid)',
    'public.create_onboarding_pickup(uuid, uuid, integer)',
    'public.create_pickup_request(text, uuid, text, integer, text, text, double precision, double precision, text)',
    'public.process_qr_scan(uuid, text)',
    'public.set_has_bags(uuid, boolean)',
    'public.start_onboarding(uuid)',
    'public.cleanup_expired_digital_bins()'
  ];
BEGIN
  FOREACH f IN ARRAY server_only LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;
  FOREACH f IN ARRAY signed_in LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;
END $$;
