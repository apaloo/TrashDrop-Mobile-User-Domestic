-- TD75 (removal approved by the owner 2026-11-14, "Remove the bin cleanup
-- function"): cleanup_expired_digital_bins() deleted every digital bin past
-- expires_at or inactive, in every account, with their bin_payments rows.
-- 20261114093918 made it server-only; nothing calls it (no app, function or
-- scheduled job), so it goes. Bins are never deleted in bulk: a cancelled or
-- expired bin stays as the record of what was booked and paid.
DROP FUNCTION IF EXISTS public.cleanup_expired_digital_bins();
