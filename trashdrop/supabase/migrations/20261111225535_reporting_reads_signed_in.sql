-- Staff dashboards and report reads: not for signed-out visitors.
--
-- Callers checked 2026-11-11 in all three repositories and the database.
--
-- Signed-in only (staff pages in the admin portal; household pages that
-- need a sign-in):
--   fetch_dashboard_stats, fetch_illegal_dumping_reports,
--   extract_coordinates_from_geometry (admin)
--   find_nearby_dumping, get_request_coordinates_wkt (household)
--
-- Server and database only (no caller in any app):
--   get_collector_performance, get_daily_collections, get_waste_distribution,
--   get_dumping_duplicate_stats, get_illegal_dumping_with_coordinates,
--   validate_photo_urls, get_nearby_disposal_centers,
--   get_whatsapp_guest_user_id (used inside create_whatsapp_digital_bin,
--   which runs as its owner)
--
-- Left open on purpose: check_dumping_duplicate (called by the
-- prevent_duplicate_dumping_reports trigger as the person reporting),
-- collector_phone_registered (collector sign-up), team_invite_info
-- (invite links opened before sign-in), is_active_collector (payment proxy).

DO $$
DECLARE
  f text;
  signed_in text[] := ARRAY[
    'public.fetch_dashboard_stats()',
    'public.fetch_illegal_dumping_reports(text, integer, integer)',
    'public.extract_coordinates_from_geometry(uuid)',
    'public.find_nearby_dumping(numeric, numeric, numeric, integer, uuid)',
    'public.get_request_coordinates_wkt(text)'
  ];
  server_only text[] := ARRAY[
    'public.get_collector_performance()',
    'public.get_daily_collections()',
    'public.get_waste_distribution()',
    'public.get_dumping_duplicate_stats(integer)',
    'public.get_illegal_dumping_with_coordinates()',
    'public.validate_photo_urls()',
    'public.get_nearby_disposal_centers(double precision, double precision, integer)',
    'public.get_whatsapp_guest_user_id()'
  ];
BEGIN
  FOREACH f IN ARRAY signed_in LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;
  FOREACH f IN ARRAY server_only LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;
END $$;
