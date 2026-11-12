-- Rollback for migrations/20261112091839_drop_dead_functions_and_count_tables.sql
-- Definitions exported from production with pg_get_functiondef on
-- 2026-11-12, before the drop. Run only if something turns out to need them.
--
-- Grants are restored to authenticated and service_role only, and each
-- function gets a fixed search_path (secure development principle 8).

begin;

CREATE OR REPLACE FUNCTION public.check_dumping_duplicate(p_reported_by uuid, p_latitude numeric, p_longitude numeric, p_radius_km numeric DEFAULT 0.05, p_hours_back integer DEFAULT 1)
 RETURNS TABLE(is_duplicate boolean, duplicate_count bigint, nearest_distance numeric, nearest_report_id uuid, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
    nearby_count BIGINT;
    nearest_report RECORD := NULL; -- Initialize to NULL
BEGIN
    -- Count nearby reports from same user
    SELECT COUNT(*) INTO nearby_count
    FROM illegal_dumping_mobile d
    WHERE d.reported_by = p_reported_by
    AND (
        (d.coordinates IS NOT NULL AND ST_DWithin(
            d.coordinates,
            ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326),
            p_radius_km * 1000
        ))
        OR
        (d.coordinates IS NULL AND d.latitude IS NOT NULL AND d.longitude IS NOT NULL AND
         ST_DWithin(
            ST_SetSRID(ST_MakePoint(d.longitude, d.latitude), 4326),
            ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326),
            p_radius_km * 1000
         ))
    )
    AND d.created_at > NOW() - INTERVAL '1 hour' * p_hours_back;

    -- Get nearest report if any exist
    IF nearby_count > 0 THEN
        SELECT * INTO nearest_report
        FROM find_nearby_dumping(p_latitude, p_longitude, p_radius_km, p_hours_back, p_reported_by)
        LIMIT 1;
    END IF;

    RETURN QUERY SELECT
        nearby_count > 0 as is_duplicate,
        nearby_count as duplicate_count,
        COALESCE(nearest_report.distance_meters, 0) as nearest_distance,
        COALESCE(nearest_report.id, NULL::UUID) as nearest_report_id,
        CASE
            WHEN nearby_count = 0 THEN 'No duplicates found'
            WHEN nearby_count = 1 THEN 'Found 1 similar report nearby'
            ELSE CONCAT('Found ', nearby_count, ' similar reports nearby')
        END as message;
END;
$function$;

CREATE OR REPLACE FUNCTION public.prevent_duplicate_dumping_reports()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path = public
AS $function$
DECLARE
    duplicate_check RECORD;
    nearby_reports RECORD := NULL; -- Initialize to NULL
BEGIN
    -- Skip duplicate check if idempotency token is provided (for retries)
    IF NEW.idempotency_token IS NOT NULL THEN
        -- Check if this is a retry of an existing submission
        IF EXISTS (
            SELECT 1 FROM illegal_dumping_mobile
            WHERE idempotency_token = NEW.idempotency_token
        ) THEN
            -- This is a duplicate retry, return existing record
            RAISE EXCEPTION 'DUPLICATE_RETRY: Report already exists with idempotency token %', NEW.idempotency_token;
        END IF;

        -- New submission with idempotency token, allow it
        RETURN NEW;
    END IF;

    -- Check for exact duplicates using submission fingerprint
    IF NEW.submission_fingerprint IS NOT NULL THEN
        IF EXISTS (
            SELECT 1 FROM illegal_dumping_mobile
            WHERE submission_fingerprint = NEW.submission_fingerprint
            AND created_at > NOW() - INTERVAL '5 minutes'
        ) THEN
            RAISE EXCEPTION 'DUPLICATE_SUBMISSION: Identical submission detected within 5 minutes';
        END IF;
    END IF;

    -- Check for spatial duplicates within 100m and 24 hours
    SELECT * INTO duplicate_check
    FROM check_dumping_duplicate(NEW.reported_by, NEW.latitude, NEW.longitude, 0.1, 24);

    IF duplicate_check.is_duplicate THEN
        RAISE EXCEPTION 'SPATIAL_DUPLICATE: Found % similar report(s) within 100m in the last 24 hours. Nearest is %m away.',
            duplicate_check.duplicate_count,
            ROUND(duplicate_check.nearest_distance);
    END IF;

    -- Check for stricter duplicates within 50m and 1 hour (same user)
    SELECT * INTO nearby_reports
    FROM check_dumping_duplicate(NEW.reported_by, NEW.latitude, NEW.longitude, 0.05, 1);

    IF nearby_reports.is_duplicate THEN
        RAISE EXCEPTION 'TEMPORAL_DUPLICATE: You already reported a dumping site %m away within the last hour. Please wait before submitting another report.',
            ROUND(nearby_reports.nearest_distance);
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.process_qr_scan(user_uuid uuid, qr text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  batch_record RECORD;
BEGIN
  PERFORM public.td_assert_self_or_staff(user_uuid);
  -- Check if QR code exists in batches table
  SELECT * INTO batch_record
  FROM batches
  WHERE qr_code = qr AND created_by = user_uuid;

  IF NOT FOUND THEN
    RETURN JSON_BUILD_OBJECT('success', FALSE, 'error', 'QR code not found or not owned by user');
  END IF;

  -- Record QR scan activity
  INSERT INTO user_activity (user_id, activity_type, description, metadata)
  VALUES (user_uuid, 'qr_scan', 'QR code scanned during onboarding',
          JSON_BUILD_OBJECT('qr_code', qr, 'batch_id', batch_record.id))
  ON CONFLICT (user_id, activity_type, metadata) DO NOTHING;

  RETURN JSON_BUILD_OBJECT('success', TRUE, 'batch_id', batch_record.id);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.check_dumping_duplicate(uuid, numeric, numeric, numeric, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.prevent_duplicate_dumping_reports() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.process_qr_scan(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_dumping_duplicate(uuid, numeric, numeric, numeric, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.prevent_duplicate_dumping_reports() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.process_qr_scan(uuid, text) TO authenticated, service_role;

-- Count tables: one row each, values as on 2026-11-12. Row-level security
-- on with no policies, as before (readable by the service role only).
CREATE TABLE IF NOT EXISTS public.bag_count (count bigint);
CREATE TABLE IF NOT EXISTS public.batch_count (count bigint);
CREATE TABLE IF NOT EXISTS public.dumping_count (count bigint);
CREATE TABLE IF NOT EXISTS public.log_count (count bigint);
CREATE TABLE IF NOT EXISTS public.message_count (count bigint);
CREATE TABLE IF NOT EXISTS public.notification_count (count bigint);
CREATE TABLE IF NOT EXISTS public.scan_count (count bigint);
CREATE TABLE IF NOT EXISTS public.service_area_count (count bigint);
CREATE TABLE IF NOT EXISTS public.waste_item_count (count bigint);
INSERT INTO public.bag_count VALUES (68);
INSERT INTO public.batch_count VALUES (16);
INSERT INTO public.dumping_count VALUES (12);
INSERT INTO public.log_count VALUES (22);
INSERT INTO public.message_count VALUES (12);
INSERT INTO public.notification_count VALUES (22);
INSERT INTO public.scan_count VALUES (32);
INSERT INTO public.service_area_count VALUES (13);
INSERT INTO public.waste_item_count VALUES (28);
ALTER TABLE public.bag_count ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batch_count ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dumping_count ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.log_count ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_count ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_count ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scan_count ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_area_count ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waste_item_count ENABLE ROW LEVEL SECURITY;

commit;
