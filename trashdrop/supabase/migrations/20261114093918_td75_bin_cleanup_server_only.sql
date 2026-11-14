-- TD75 (2026-11-14): cleanup_expired_digital_bins() deletes every digital bin
-- past expires_at or inactive, across all accounts, and bin_payments rows go
-- with them (ON DELETE CASCADE). It is SECURITY DEFINER and signed-in users
-- could run it: one call would have deleted 26 of 28 bins, 15 of them disposed
-- bins collectors are paid from. No app calls it (the household caller is
-- commented out) and no scheduled job runs it. Only the server may now.
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_digital_bins() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_digital_bins() TO service_role;
