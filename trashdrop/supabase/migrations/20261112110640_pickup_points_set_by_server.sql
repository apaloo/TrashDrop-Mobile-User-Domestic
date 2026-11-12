-- Points are decided by the server (secure development principle 1; owner
-- approved 2026-11-12). A pickup request a household user creates starts
-- with 0 points; the one-off sign-up bonus (0 -> at most 5, once) is still
-- set by the update rule below. Server functions and staff are unaffected.
-- Specification: docs/POINTS.md.
CREATE OR REPLACE FUNCTION public.td_guard_request_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  me uuid := auth.uid();
  changed text[];
  allowed text[] := '{}';
  bad text[];
  o jsonb;
  n jsonb := to_jsonb(NEW);
  new_collector text := n ->> 'collector_id';
  old_collector text;
  new_points numeric;
BEGIN
  IF me IS NULL OR public.td_can_manage_requests() THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    -- also covers database functions that insert on the caller's behalf
    IF NEW.user_id IS DISTINCT FROM me THEN
      RAISE EXCEPTION 'A pickup request can only be created for your own account' USING ERRCODE = '42501';
    END IF;
    IF new_collector IS NOT NULL THEN
      RAISE EXCEPTION 'A new pickup request can''t already have a collector' USING ERRCODE = '42501';
    END IF;
    -- points are never set by the app when a request is created
    NEW.points_earned := 0;
    RETURN NEW;
  END IF;

  o := to_jsonb(OLD);
  old_collector := o ->> 'collector_id';
  changed := public.td_changed_columns(o, n);

  IF old_collector = me::text OR new_collector = me::text
     OR (public.td_is_active_collector() AND (old_collector IS NULL OR (o ->> 'assignment_expires_at')::timestamptz < now())) THEN
    -- the collector app: accept, release, navigate, collect, dispose, payouts, live location
    IF new_collector IS NOT NULL AND new_collector <> me::text THEN
      RAISE EXCEPTION 'You can only take a request for yourself' USING ERRCODE = '42501';
    END IF;
    allowed := ARRAY['status', 'collector_id', 'accepted_at', 'assignment_expires_at', 'picked_up_at',
                     'en_route_at', 'arrived_at', 'started_at', 'completed_at', 'disposal_site', 'disposal_timestamp',
                     'disposed_at', 'platform_share', 'payout_breakdown', 'reserved_by', 'reserved_at',
                     'reserved_until', 'reservation_expires_at']
               || ARRAY(SELECT c FROM unnest(changed) c WHERE c LIKE 'collector\_%');
  END IF;

  IF OLD.user_id = me THEN
    -- the household app: cancel, and its one-off sign-up points
    allowed := allowed || ARRAY['cancellation_reason', 'cancelled_at', 'cancelled_by'];
    IF 'status' = ANY (changed) AND lower(NEW.status) IN ('cancelled', 'canceled') THEN
      allowed := allowed || ARRAY['status'];
    END IF;
    IF 'points_earned' = ANY (changed) THEN
      new_points := (n ->> 'points_earned')::numeric;
      IF coalesce((o ->> 'points_earned')::numeric, 0) = 0 AND new_points BETWEEN 0 AND 5 THEN
        allowed := allowed || ARRAY['points_earned'];
      END IF;
    END IF;
  END IF;

  bad := ARRAY(SELECT c FROM unnest(changed) c
               WHERE c <> ALL (allowed || ARRAY['updated_at', 'region', 'district']));
  IF cardinality(bad) > 0 THEN
    RAISE EXCEPTION 'Not allowed to change % on this pickup request', array_to_string(bad, ', ')
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $function$;
