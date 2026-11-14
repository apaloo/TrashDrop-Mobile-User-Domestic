-- Function public.run_alert_rules
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- run_alert_rules(p_dry_run boolean): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.run_alert_rules(p_dry_run boolean DEFAULT true)
 RETURNS TABLE(rule_key text, enabled boolean, matched integer, already_open integer, created integer, escalated integer, resolved integer, note text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  cfg jsonb := '{}'::jsonb;
  r record;
  p jsonb;
  snooze interval;
  skipped jsonb := '{}'::jsonb;
  ran text[] := ARRAY[]::text[];
  now_accra timestamp := now() AT TIME ZONE 'Africa/Accra';
  open_states text[] := ARRAY['open', 'acknowledged', 'in_progress'];
  active_states text[] := ARRAY['pending', 'accepted', 'en_route', 'arrived', 'collecting'];
BEGIN
  -- Users may only call this when they are staff; pg_cron runs without a JWT
  IF auth.role() IS NOT NULL AND auth.role() <> 'service_role' AND NOT public.td_is_staff() THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = 'insufficient_privilege';
  END IF;

  FOR r IN SELECT s.rule_key, s.enabled, s.params FROM public.alert_rule_settings s LOOP
    cfg := cfg || jsonb_build_object(r.rule_key, jsonb_build_object('enabled', r.enabled, 'params', r.params));
  END LOOP;
  snooze := make_interval(hours => coalesce((cfg #>> '{_general,params,snooze_hours}')::int, 24));

  DROP TABLE IF EXISTS pg_temp.td_req;
  CREATE TEMP TABLE td_req ON COMMIT DROP AS
    SELECT v.*, public.td_canon_status(v.status) AS canon
    FROM public.admin_pickup_requests v;

  DROP TABLE IF EXISTS pg_temp.td_col;
  CREATE TEMP TABLE td_col ON COMMIT DROP AS
    SELECT c.id::text AS id, c.user_id::text AS user_id, j,
           nullif(btrim(concat_ws(' ', j ->> 'first_name', j ->> 'last_name')), '') AS name,
           lower(coalesce(j ->> 'status', '')) AS status,
           nullif(btrim(j ->> 'assigned_region'), '') AS zone,
           coalesce(public.td_try_ts(j ->> 'location_updated_at'), public.td_try_ts(j ->> 'last_active'), public.td_try_ts(j ->> 'last_active_at')) AS last_seen
    FROM public.collector_profiles c, LATERAL (SELECT to_jsonb(c) AS j) x;

  DROP TABLE IF EXISTS pg_temp.td_done;
  CREATE TEMP TABLE td_done (rule_key text, kind text) ON COMMIT DROP;

  DROP TABLE IF EXISTS pg_temp.td_cand;
  CREATE TEMP TABLE td_cand (
    rule_key text, entity_source text, entity_type text, entity_ref text,
    severity text, type text, title text, description text, metadata jsonb,
    lat double precision, lng double precision
  ) ON COMMIT DROP;

  -- 1. pending and not assigned
  IF coalesce((cfg #>> '{pending_unassigned,enabled}')::boolean, false) THEN
    p := cfg #> '{pending_unassigned,params}';
    INSERT INTO td_cand
    SELECT 'pending_unassigned', q.source, 'pickup_request', q.id,
           CASE WHEN q.age >= make_interval(mins => coalesce((p ->> 'critical_minutes')::int, 120)) THEN 'critical' ELSE 'high' END,
           'request_delay',
           format('Request #%s not assigned for %s', left(q.id, 8),
                  CASE WHEN q.age >= make_interval(mins => coalesce((p ->> 'critical_minutes')::int, 120))
                       THEN coalesce((p ->> 'critical_minutes')::int, 120) || '+ min'
                       ELSE coalesce((p ->> 'high_minutes')::int, 30) || '+ min' END),
           format('Pending since %s with no collector.', to_char(q.created_at AT TIME ZONE 'Africa/Accra', 'DD Mon HH24:MI')),
           jsonb_build_object('customer', q.customer_name, 'address', q.address, 'status', q.status),
           q.lat, q.lng
    FROM (SELECT t.*, now() - t.created_at AS age FROM td_req t) q
    WHERE q.canon = 'pending' AND q.collector_ref IS NULL
      AND q.age >= make_interval(mins => coalesce((p ->> 'high_minutes')::int, 30))
      AND coalesce(public.td_try_ts(q.scheduled_date), now()) <= now(); -- scheduled for later: not late yet
    ran := array_append(ran, 'pending_unassigned');
  END IF;

  -- 2. in progress / assigned with no (known) collector
  IF coalesce((cfg #>> '{in_progress_no_collector,enabled}')::boolean, false) THEN
    INSERT INTO td_cand
    SELECT 'in_progress_no_collector', q.source, 'pickup_request', q.id, 'critical', 'unassigned_job',
           format('Request #%s is %s with no collector', left(q.id, 8), replace(q.canon, '_', ' ')),
           CASE WHEN q.collector_ref IS NULL THEN 'No collector is set on this request.'
                ELSE format('Collector %s does not match any collector profile.', q.collector_ref) END,
           jsonb_build_object('customer', q.customer_name, 'address', q.address, 'status', q.status, 'collector_ref', q.collector_ref),
           q.lat, q.lng
    FROM td_req q
    WHERE q.canon IN ('accepted', 'en_route', 'arrived', 'collecting')
      AND (q.collector_ref IS NULL OR q.collector_profile_id IS NULL);
    ran := array_append(ran, 'in_progress_no_collector');
  END IF;

  -- 3. assigned but not started / collecting too long
  IF coalesce((cfg #>> '{stalled_job,enabled}')::boolean, false) THEN
    p := cfg #> '{stalled_job,params}';
    INSERT INTO td_cand
    SELECT 'stalled_job', q.source, 'pickup_request', q.id, 'high', 'stalled_job',
           CASE WHEN q.canon = 'accepted' THEN format('Request #%s assigned but not started', left(q.id, 8))
                ELSE format('Request #%s collecting for over %s h', left(q.id, 8), floor(coalesce((p ->> 'collecting_minutes')::int, 180) / 60.0)::int) END,
           format('%s since %s.', CASE WHEN q.canon = 'accepted' THEN 'Assigned' ELSE 'Collecting' END,
                  to_char(q.since AT TIME ZONE 'Africa/Accra', 'DD Mon HH24:MI')),
           jsonb_build_object('customer', q.customer_name, 'address', q.address, 'status', q.status, 'collector', q.collector_name),
           q.lat, q.lng
    FROM (SELECT t.*, CASE WHEN t.canon = 'accepted' THEN coalesce(t.accepted_at, t.updated_at, t.created_at)
                           ELSE coalesce(t.updated_at, t.created_at) END AS since
          FROM td_req t) q
    WHERE q.collector_profile_id IS NOT NULL AND (
      (q.canon = 'accepted' AND now() - q.since > make_interval(mins => coalesce((p ->> 'assigned_minutes')::int, 60)))
      OR (q.canon = 'collecting' AND now() - q.since > make_interval(mins => coalesce((p ->> 'collecting_minutes')::int, 180))));
    ran := array_append(ran, 'stalled_job');
  END IF;

  -- 4. invalid coordinates (open requests)
  IF coalesce((cfg #>> '{invalid_location,enabled}')::boolean, false) THEN
    INSERT INTO td_cand
    SELECT 'invalid_location', q.source, 'pickup_request', q.id, 'medium', 'invalid_location',
           format('Request #%s: %s', left(q.id, 8), q.problem), 'The location can''t be used for collection or the map.',
           jsonb_build_object('customer', q.customer_name, 'address', q.address, 'status', q.status, 'problem', q.problem, 'lat', q.lat, 'lng', q.lng),
           NULL, NULL
    FROM (SELECT t.*, CASE
            WHEN t.lat IS NULL OR t.lng IS NULL THEN 'missing coordinates'
            WHEN t.lat = 0 AND t.lng = 0 THEN 'coordinates are 0,0'
            WHEN public.td_supported_country(t.lat, t.lng) IS NULL
                 AND public.td_supported_country(t.lng, t.lat) IS NOT NULL THEN 'latitude and longitude look swapped'
            WHEN public.td_supported_country(t.lat, t.lng) IS NULL THEN 'location is outside Ghana and Liberia'
          END AS problem FROM td_req t) q
    WHERE q.canon = ANY (active_states) AND q.problem IS NOT NULL;
    ran := array_append(ran, 'invalid_location');
  END IF;

  -- 5. outside the service area: no zone with an active collector covers the point
  IF coalesce((cfg #>> '{outside_service_area,enabled}')::boolean, false) THEN
    IF NOT EXISTS (SELECT 1 FROM td_col c JOIN public.service_zones z ON lower(z.name) = lower(c.zone)
                   WHERE c.status = 'active' AND z.center_lat IS NOT NULL) THEN
      skipped := skipped || jsonb_build_object('outside_service_area', 'Skipped: no active collector has a service zone with a centre yet');
    ELSE
      INSERT INTO td_cand
      SELECT 'outside_service_area', q.source, 'pickup_request', q.id, 'medium', 'outside_service_area',
             format('Request #%s is outside the service area', left(q.id, 8)),
             'No service zone with an active collector covers this location.',
             jsonb_build_object('customer', q.customer_name, 'address', q.address, 'status', q.status),
             q.lat, q.lng
      FROM td_req q
      WHERE q.canon = ANY (active_states)
        AND public.td_supported_country(q.lat, q.lng) IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM public.service_zones z
          JOIN td_col c ON lower(c.zone) = lower(z.name) AND c.status = 'active'
          WHERE z.active AND z.center_lat IS NOT NULL
            AND ST_DWithin(ST_SetSRID(ST_MakePoint(q.lng, q.lat), 4326)::geography,
                           ST_SetSRID(ST_MakePoint(z.center_lng, z.center_lat), 4326)::geography,
                           coalesce(z.radius_km, 5) * 1000));
    END IF;
    ran := array_append(ran, 'outside_service_area');
  END IF;

  -- 6. possible duplicates: same customer, within 50 m, both open, within 48 h
  IF coalesce((cfg #>> '{duplicate_request,enabled}')::boolean, false) THEN
    p := cfg #> '{duplicate_request,params}';
    INSERT INTO td_cand
    SELECT DISTINCT ON (b.id) 'duplicate_request', b.source, 'pickup_request', b.id, 'low', 'duplicate_request',
           format('Request #%s may duplicate #%s', left(b.id, 8), left(a.id, 8)),
           format('Same customer, %s m apart, %s apart, both still open.',
                  round(ST_Distance(ST_SetSRID(ST_MakePoint(a.lng, a.lat), 4326)::geography, ST_SetSRID(ST_MakePoint(b.lng, b.lat), 4326)::geography)),
                  CASE WHEN b.created_at - a.created_at < interval '1 hour' THEN floor(extract(epoch FROM b.created_at - a.created_at) / 60)::int || ' min'
                       ELSE floor(extract(epoch FROM b.created_at - a.created_at) / 3600)::int || ' h' END),
           jsonb_build_object('customer', b.customer_name, 'address', b.address, 'status', b.status,
                              'duplicate_of', a.id, 'duplicate_of_source', a.source),
           b.lat, b.lng
    FROM td_req a
    JOIN td_req b ON b.user_id = a.user_id AND b.id <> a.id
     AND (a.created_at, a.id) < (b.created_at, b.id)
     AND b.created_at - a.created_at <= make_interval(hours => coalesce((p ->> 'window_hours')::int, 48))
    WHERE a.user_id IS NOT NULL
      AND a.canon = ANY (active_states) AND b.canon = ANY (active_states)
      AND a.lat IS NOT NULL AND b.lat IS NOT NULL
      AND ST_DWithin(ST_SetSRID(ST_MakePoint(a.lng, a.lat), 4326)::geography,
                     ST_SetSRID(ST_MakePoint(b.lng, b.lat), 4326)::geography,
                     coalesce((p ->> 'radius_m')::numeric, 50))
    ORDER BY b.id, a.created_at;
    ran := array_append(ran, 'duplicate_request');
  END IF;

  -- 7. collector on duty but silent during working hours
  IF coalesce((cfg #>> '{collector_offline,enabled}')::boolean, false) THEN
    p := cfg #> '{collector_offline,params}';
    IF extract(isodow FROM now_accra)::int IN (SELECT jsonb_array_elements_text(coalesce(p -> 'days', '[1,2,3,4,5,6]'))::int)
       AND extract(hour FROM now_accra) >= coalesce((p ->> 'start_hour')::int, 7)
       AND extract(hour FROM now_accra) < coalesce((p ->> 'end_hour')::int, 19) THEN
      INSERT INTO td_cand
      SELECT 'collector_offline', 'collector_profiles', 'collector', c.id, 'medium', 'collector_offline',
             format('%s is on duty but not reporting a location', coalesce(c.name, 'Collector ' || left(c.id, 8))),
             CASE WHEN c.last_seen IS NULL THEN 'Never reported a location.'
                  ELSE format('Last location update %s.', to_char(c.last_seen AT TIME ZONE 'Africa/Accra', 'DD Mon HH24:MI')) END,
             jsonb_build_object('name', c.name, 'last_seen', c.last_seen, 'phone', c.j ->> 'phone'),
             NULL, NULL
      FROM td_col c
      WHERE (CASE WHEN c.j ? 'is_online' THEN coalesce((c.j ->> 'is_online')::boolean, false) ELSE c.status = 'active' END)
        AND c.status <> 'inactive'
        AND (c.last_seen IS NULL OR now() - c.last_seen > make_interval(mins => coalesce((p ->> 'minutes')::int, 30)));
    END IF;
    ran := array_append(ran, 'collector_offline'); -- outside working hours: open alerts resolve
  END IF;

  -- 8. collector at or over capacity
  IF coalesce((cfg #>> '{collector_capacity,enabled}')::boolean, false) THEN
    p := cfg #> '{collector_capacity,params}';
    INSERT INTO td_cand
    SELECT 'collector_capacity', 'collector_profiles', 'collector', x.id, 'medium', 'collector_capacity',
           format('%s is at %s%%+ capacity', coalesce(x.name, 'Collector ' || left(x.id, 8)), coalesce((p ->> 'percent')::int, 90)),
           format('Vehicle about %s%% full; send them to dispose before new jobs.', round(x.pct)),
           jsonb_build_object('name', x.name, 'percent', round(x.pct), 'last_seen', x.last_seen), NULL, NULL
    FROM (
      SELECT c.id, c.name, c.last_seen, coalesce(
               nullif(public.td_try_num(coalesce(c.j ->> 'capacity_used', c.j ->> 'capacity_percent')), 0),
               (SELECT sum(coalesce(q.bag_count, 1)) FROM td_req q
                 WHERE q.collector_profile_id = c.id AND q.canon IN ('accepted', 'en_route', 'arrived', 'collecting'))
               * 100.0 / nullif(public.td_try_num(c.j ->> 'vehicle_capacity_bags'), 0)) AS pct
      FROM td_col c WHERE c.status = 'active') x
    WHERE x.pct >= coalesce((p ->> 'percent')::numeric, 90);
    ran := array_append(ran, 'collector_capacity');
  END IF;

  -- 9. stored fee doesn't match the pricing logic
  --    Digital bins are priced like the household app: a promotional bin pays
  --    the client fee of the active promotional_fee_schedule row for its size
  --    × bags (one bag's fee on older bookings); any other bin pays its pricing zone's price for the size × bags,
  --    + 30% if urgent, + GHS 1 request fee (get_covering_pricing_zone).
  --    Unknown expected price (no schedule row, location outside every zone,
  --    size the zone doesn't price) → no alert.
  IF coalesce((cfg #>> '{fee_mismatch,enabled}')::boolean, false) THEN
    p := cfg #> '{fee_mismatch,params}';
    INSERT INTO td_cand
    SELECT 'fee_mismatch', f.source, 'pickup_request', f.id, 'low', 'fee_mismatch',
           format('Request #%s fee GHS %s, expected GHS %s', left(f.id, 8), to_char(f.fee, 'FM999990.00'), to_char(f.expected, 'FM999990.00')),
           f.basis,
           jsonb_build_object('customer', f.customer_name, 'address', f.address, 'status', f.status, 'fee', f.fee, 'expected', f.expected),
           f.lat, f.lng
    FROM (
      SELECT q.*,
        CASE
          WHEN q.source = 'digital_bins' AND q.promotional_fee IS NOT NULL THEN q.promotional_fee
          -- promotional rate × bags; a fee of one bag's rate is a booking made
          -- before promotions were priced per bag (20261024 in the household app)
          WHEN q.source = 'digital_bins' AND b.promo THEN
            (SELECT CASE WHEN abs(q.fee - pf.promo_rate) <= 0.01 THEN pf.promo_rate ELSE round(pf.promo_rate * coalesce(q.bag_count, 1), 2) END
               FROM (SELECT public.td_try_num(to_jsonb(s) ->> 'client_fee') AS promo_rate FROM public.promotional_fee_schedule s
                      WHERE s.bin_size_liters = coalesce(q.bin_size_liters, 120) AND s.is_active LIMIT 1) pf)
          WHEN q.source = 'digital_bins' AND q.lat IS NOT NULL AND q.lng IS NOT NULL THEN
            (SELECT round(zp.price * coalesce(q.bag_count, 1) * (CASE WHEN q.is_urgent THEN 1.3 ELSE 1 END) + 1, 2)
               FROM (SELECT public.td_try_num(to_jsonb(z) ->> ('price_' || coalesce(q.bin_size_liters, 120) || 'l')) AS price
                       FROM public.get_covering_pricing_zone(q.lat, q.lng) z LIMIT 1) zp
              WHERE zp.price > 0)
          WHEN q.source = 'pickup_requests' AND q.batch_id IS NOT NULL AND to_regclass('public.batches') IS NOT NULL
            THEN (SELECT trunc(public.td_try_num(to_jsonb(bt) ->> 'unit_price')) FROM public.batches bt WHERE bt.id::text = q.batch_id)
        END AS expected,
        CASE WHEN q.source = 'digital_bins' AND (q.promotional_fee IS NOT NULL OR b.promo) THEN 'Promotional price for this bin size × bags.'
             WHEN q.source = 'digital_bins' THEN 'Pricing zone price × bags (+30% urgent) + GHS 1 request fee, at today''s zone price.'
             ELSE 'Unit price of the customer''s bag batch.' END AS basis
      FROM td_req q
      LEFT JOIN LATERAL (
        SELECT coalesce((to_jsonb(db) ->> 'is_promotional')::boolean, false) AS promo
        FROM public.digital_bins db WHERE q.source = 'digital_bins' AND db.id::text = q.id
      ) b ON true
      WHERE q.canon <> 'cancelled' AND q.fee IS NOT NULL
        AND q.created_at > now() - make_interval(days => coalesce((p ->> 'days')::int, 30))) f
    WHERE f.expected IS NOT NULL AND abs(f.fee - f.expected) > 0.01;
    ran := array_append(ran, 'fee_mismatch');
  END IF;

  -- 10. collector with an invalid email or phone
  IF coalesce((cfg #>> '{invalid_contact,enabled}')::boolean, false) THEN
    INSERT INTO td_cand
    SELECT 'invalid_contact', 'collector_profiles', 'collector', c.id, 'low', 'invalid_contact',
           format('%s has %s', coalesce(c.name, 'Collector ' || left(c.id, 8)), x.problem),
           'Fix it on the Collectors page (Edit).',
           jsonb_build_object('name', c.name, 'email', c.j ->> 'email', 'phone', c.j ->> 'phone', 'problem', x.problem), NULL, NULL
    FROM td_col c, LATERAL (SELECT concat_ws(' and ',
        CASE WHEN nullif(btrim(c.j ->> 'phone'), '') IS NULL THEN 'no phone number'
             WHEN public.td_gh_phone(c.j ->> 'phone') IS NULL THEN 'an invalid phone number' END,
        CASE WHEN nullif(btrim(c.j ->> 'email'), '') IS NOT NULL
              AND (c.j ->> 'email') !~* '^[^[:space:]@]+@[^[:space:]@]+\.[a-z]{2,}$' THEN 'an invalid email' END) AS problem) x
    WHERE x.problem <> '';
    ran := array_append(ran, 'invalid_contact');
  END IF;

  -- 11. a household rated the collector 1 or 2 stars (issue #186; owner 2026-11-13)
  --     One alert per rated job. Once a person has closed it, it stays closed
  --     (the rating never changes, so it would otherwise come back after the snooze).
  IF coalesce((cfg #>> '{low_rating,enabled}')::boolean, false) THEN
    p := cfg #> '{low_rating,params}';
    INSERT INTO td_cand
    SELECT 'low_rating', q.source, 'pickup_request', q.id,
           CASE WHEN jr.stars <= 1 THEN 'high' ELSE 'medium' END, 'low_rating',
           format('Request #%s rated %s star%s', left(q.id, 8), jr.stars, CASE WHEN jr.stars = 1 THEN '' ELSE 's' END),
           concat_ws(' ', CASE WHEN jr.comment IS NULL THEN 'No comment.' ELSE format('"%s"', jr.comment) END,
                     CASE WHEN q.collector_name IS NOT NULL THEN format('Collector: %s.', q.collector_name) END),
           jsonb_build_object('customer', q.customer_name, 'address', q.address, 'status', q.status, 'collector', q.collector_name,
                              'stars', jr.stars, 'comment', jr.comment, 'rated_at', jr.created_at),
           q.lat, q.lng
    FROM td_req q
    JOIN public.job_ratings jr ON jr.job_source = q.source AND jr.job_id = q.id
    WHERE jr.stars <= coalesce((p ->> 'max_stars')::int, 2)
      AND NOT EXISTS (SELECT 1 FROM public.alerts a WHERE a.rule_key = 'low_rating' AND a.entity_ref = q.id
                        AND a.status IN ('resolved', 'closed') AND NOT a.auto_resolved);
    ran := array_append(ran, 'low_rating');
  END IF;

  -- ── report (dry run) or apply ────────────────────────────────────────────
  IF NOT p_dry_run THEN
    -- escalate (e.g. pending 30 min High → 2 h Critical); refresh the text only when it changed
    FOR r IN
      SELECT a.id, a.severity AS old_severity, c.rule_key, c.severity, c.title, c.description, c.metadata
      FROM public.alerts a JOIN td_cand c ON c.rule_key = a.rule_key AND c.entity_ref = a.entity_ref
      WHERE a.status = ANY (open_states)
        AND (array_position(ARRAY['low', 'medium', 'high', 'critical'], c.severity)
               > array_position(ARRAY['low', 'medium', 'high', 'critical'], a.severity)
             OR a.title IS DISTINCT FROM c.title OR a.description IS DISTINCT FROM c.description)
    LOOP
      PERFORM set_config('app.alert_actor', 'Rule: ' || r.rule_key, true);
      UPDATE public.alerts a SET
        severity = CASE WHEN array_position(ARRAY['low', 'medium', 'high', 'critical'], r.severity)
                           > array_position(ARRAY['low', 'medium', 'high', 'critical'], a.severity) THEN r.severity ELSE a.severity END,
        title = r.title, description = r.description, metadata = a.metadata || r.metadata, last_seen_at = now()
      WHERE a.id = r.id;
      IF array_position(ARRAY['low', 'medium', 'high', 'critical'], r.severity)
           > array_position(ARRAY['low', 'medium', 'high', 'critical'], r.old_severity) THEN
        INSERT INTO td_done VALUES (r.rule_key, 'escalated');
      END IF;
    END LOOP;

    -- create new alerts (one open per rule + record; respect the snooze after a person closed one)
    FOR r IN
      SELECT c.* FROM td_cand c
      WHERE NOT EXISTS (SELECT 1 FROM public.alerts a WHERE a.rule_key = c.rule_key AND a.entity_ref = c.entity_ref AND a.status = ANY (open_states))
        AND NOT EXISTS (SELECT 1 FROM public.alerts a WHERE a.rule_key = c.rule_key AND a.entity_ref = c.entity_ref
                          AND a.status IN ('resolved', 'closed') AND NOT a.auto_resolved
                          AND coalesce(a.closed_at, a.resolved_at, a.updated_at) > now() - snooze)
    LOOP
      PERFORM set_config('app.alert_actor', 'Rule: ' || r.rule_key, true);
      INSERT INTO public.alerts (title, description, type, severity, status, rule_key, entity_type, entity_source, entity_ref,
                                 metadata, location_lat, location_lng, location_address, last_seen_at)
      VALUES (r.title, r.description, r.type, r.severity, 'open', r.rule_key, r.entity_type, r.entity_source, r.entity_ref,
              r.metadata, r.lat, r.lng, r.metadata ->> 'address', now())
      ON CONFLICT DO NOTHING;
      IF FOUND THEN INSERT INTO td_done VALUES (r.rule_key, 'created'); END IF;
    END LOOP;

    -- auto-resolve when the condition has cleared (only for rules that ran)
    FOR r IN
      SELECT a.id, a.rule_key FROM public.alerts a
      WHERE a.rule_key = ANY (ran) AND NOT (skipped ? a.rule_key) AND a.status = ANY (open_states)
        AND NOT EXISTS (SELECT 1 FROM td_cand c WHERE c.rule_key = a.rule_key AND c.entity_ref = a.entity_ref)
    LOOP
      PERFORM set_config('app.alert_actor', 'Rule: ' || r.rule_key, true);
      UPDATE public.alerts SET status = 'resolved', auto_resolved = true,
        resolution_note = 'Auto-resolved: the condition has cleared'
      WHERE id = r.id;
      INSERT INTO td_done VALUES (r.rule_key, 'resolved');
    END LOOP;
    PERFORM set_config('app.alert_actor', '', true);
  END IF;

  -- One row per rule. In a dry run created/escalated/resolved are what would happen.
  RETURN QUERY
  WITH rules AS (
    SELECT s.rule_key AS rk, s.enabled AS en FROM public.alert_rule_settings s WHERE s.rule_key <> '_general'
  ),
  cand AS (SELECT c.rule_key AS rk, c.entity_ref, c.severity FROM td_cand c),
  opn AS (SELECT a.rule_key AS rk, a.entity_ref, a.severity, a.status, a.updated_at, a.auto_resolved, a.resolved_at, a.closed_at FROM public.alerts a),
  done AS (SELECT d.rule_key AS rk, d.kind, count(*)::int AS n FROM td_done d GROUP BY 1, 2)
  SELECT rules.rk, rules.en,
    (SELECT count(*)::int FROM cand WHERE cand.rk = rules.rk),
    CASE WHEN p_dry_run THEN
      (SELECT count(*)::int FROM cand JOIN opn ON opn.rk = cand.rk AND opn.entity_ref = cand.entity_ref AND opn.status = ANY (open_states) WHERE cand.rk = rules.rk)
    ELSE (SELECT count(*)::int FROM cand WHERE cand.rk = rules.rk) - coalesce((SELECT n FROM done WHERE done.rk = rules.rk AND kind = 'created'), 0) END,
    CASE WHEN p_dry_run THEN
      (SELECT count(*)::int FROM cand WHERE cand.rk = rules.rk
        AND NOT EXISTS (SELECT 1 FROM opn WHERE opn.rk = cand.rk AND opn.entity_ref = cand.entity_ref AND opn.status = ANY (open_states))
        AND NOT EXISTS (SELECT 1 FROM opn WHERE opn.rk = cand.rk AND opn.entity_ref = cand.entity_ref AND opn.status IN ('resolved', 'closed')
                          AND NOT opn.auto_resolved AND coalesce(opn.closed_at, opn.resolved_at, opn.updated_at) > now() - snooze))
    ELSE coalesce((SELECT n FROM done WHERE done.rk = rules.rk AND kind = 'created'), 0) END,
    CASE WHEN p_dry_run THEN
      (SELECT count(*)::int FROM cand JOIN opn ON opn.rk = cand.rk AND opn.entity_ref = cand.entity_ref AND opn.status = ANY (open_states)
         WHERE cand.rk = rules.rk AND array_position(ARRAY['low', 'medium', 'high', 'critical'], cand.severity)
                                     > array_position(ARRAY['low', 'medium', 'high', 'critical'], opn.severity))
    ELSE coalesce((SELECT n FROM done WHERE done.rk = rules.rk AND kind = 'escalated'), 0) END,
    CASE WHEN p_dry_run THEN
      (SELECT count(*)::int FROM opn WHERE opn.rk = rules.rk AND rules.rk = ANY (ran) AND NOT (skipped ? rules.rk) AND opn.status = ANY (open_states)
         AND NOT EXISTS (SELECT 1 FROM cand WHERE cand.rk = opn.rk AND cand.entity_ref = opn.entity_ref))
    ELSE coalesce((SELECT n FROM done WHERE done.rk = rules.rk AND kind = 'resolved'), 0) END,
    CASE WHEN NOT rules.en THEN 'Off' ELSE skipped ->> rules.rk END
  FROM rules
  ORDER BY rules.rk;
END $function$;
