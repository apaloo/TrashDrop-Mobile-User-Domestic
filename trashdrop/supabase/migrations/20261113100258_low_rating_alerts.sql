-- Ratings phase B (issue #186; owner's decisions 2026-11-13): a 1-2 star
-- rating alerts operations, and staff see each job's rating and comment.
--
-- * admin_pickup_requests: customer_rating and rated_at come from
--   job_ratings (td_rate_job), and rating_comment is added at the end. Same
--   columns otherwise; still security_invoker (staff read job_ratings).
-- * run_alert_rules(): new rule 11 'low_rating' (1 star high, 2 stars
--   medium). The owner allowed this rule as an exception to the 2026-11-12
--   decision not to change the alert rules (TD42). Rules 1-10 are unchanged,
--   including the protected fee-mismatch rule 9 (admin site CLAUDE.md).
-- * alert_rule_settings: the rule's switch, on, max_stars 2.

CREATE OR REPLACE VIEW public.admin_pickup_requests WITH (security_invoker = true) AS
 WITH src AS (
         SELECT 'pickup_requests'::text AS source,
            to_jsonb(p.*) AS j,
            td_row_point(to_jsonb(p.*)) AS pt,
            NULL::text AS place
           FROM pickup_requests p
        UNION ALL
         SELECT 'digital_bins'::text,
            to_jsonb(b.*) AS to_jsonb,
            td_row_point(to_jsonb(l.*)) AS td_row_point,
            COALESCE((to_jsonb(l.*) ->> 'address'::text), (to_jsonb(l.*) ->> 'location_name'::text)) AS "coalesce"
           FROM (digital_bins b
             LEFT JOIN bin_locations l ON (((l.id)::text = (to_jsonb(b.*) ->> 'location_id'::text))))
        UNION ALL
         SELECT 'scheduled_pickups'::text,
            to_jsonb(s.*) AS to_jsonb,
            td_row_point(to_jsonb(l.*)) AS td_row_point,
            COALESCE((to_jsonb(l.*) ->> 'address'::text), (to_jsonb(l.*) ->> 'location_name'::text)) AS "coalesce"
           FROM (scheduled_pickups s
             LEFT JOIN locations l ON (((l.id)::text = (to_jsonb(s.*) ->> 'location_id'::text))))
        )
 SELECT (src.j ->> 'id'::text) AS id,
    src.source,
    lower(COALESCE((src.j ->> 'status'::text), 'pending'::text)) AS status,
    ((src.j ->> 'created_at'::text))::timestamp with time zone AS created_at,
    ((src.j ->> 'updated_at'::text))::timestamp with time zone AS updated_at,
    (src.j ->> 'user_id'::text) AS user_id,
    NULLIF(TRIM(BOTH FROM concat_ws(' '::text, pr.first_name, pr.last_name)), ''::text) AS customer_name,
    pr.email AS customer_email,
    pr.phone AS customer_phone,
    COALESCE(NULLIF((src.j ->> 'address'::text), ''::text), src.place) AS address,
    st_y(src.pt) AS lat,
    st_x(src.pt) AS lng,
    COALESCE((src.j ->> 'waste_type'::text), 'general'::text) AS waste_type,
    COALESCE(td_num((src.j ->> 'bag_count'::text)), td_num((src.j ->> 'bags'::text)), td_num((src.j ->> 'estimated_volume'::text))) AS bag_count,
    td_num((src.j ->> 'bin_size_liters'::text)) AS bin_size_liters,
    td_num((src.j ->> 'fee'::text)) AS fee,
    COALESCE(((src.j ->> 'is_urgent'::text))::boolean, ((src.j ->> 'urgent_enabled'::text))::boolean, false) AS is_urgent,
        CASE
            WHEN COALESCE(((src.j ->> 'is_urgent'::text))::boolean, ((src.j ->> 'urgent_enabled'::text))::boolean, false) THEN 'high'::text
            WHEN (lower((src.j ->> 'priority'::text)) = ANY (ARRAY['high'::text, 'urgent'::text, 'critical'::text])) THEN 'high'::text
            WHEN (lower((src.j ->> 'priority'::text)) = 'low'::text) THEN 'low'::text
            ELSE 'medium'::text
        END AS priority,
        CASE
            WHEN (COALESCE(((src.j ->> 'is_urgent'::text))::boolean, ((src.j ->> 'urgent_enabled'::text))::boolean, false) OR (lower((src.j ->> 'priority'::text)) = ANY (ARRAY['high'::text, 'urgent'::text, 'critical'::text]))) THEN 3
            WHEN (lower((src.j ->> 'priority'::text)) = 'low'::text) THEN 1
            ELSE 2
        END AS priority_rank,
        CASE lower(COALESCE((src.j ->> 'status'::text), 'pending'::text))
            WHEN 'pending'::text THEN 0
            WHEN 'available'::text THEN 0
            WHEN 'scheduled'::text THEN 0
            WHEN 'accepted'::text THEN 1
            WHEN 'assigned'::text THEN 1
            WHEN 'en_route'::text THEN 2
            WHEN 'in_transit'::text THEN 2
            WHEN 'in_progress'::text THEN 2
            WHEN 'arrived'::text THEN 3
            WHEN 'collecting'::text THEN 4
            WHEN 'picked_up'::text THEN 4
            WHEN 'completed'::text THEN 5
            WHEN 'disposed'::text THEN 5
            WHEN 'cancelled'::text THEN 6
            WHEN 'canceled'::text THEN 6
            WHEN 'expired'::text THEN 7
            ELSE 8
        END AS status_rank,
    (src.j ->> 'priority'::text) AS raw_priority,
    COALESCE((src.j ->> 'collector_id'::text), (src.j ->> 'assigned_to'::text)) AS collector_ref,
    (cp.user_id)::text AS collector_user_id,
    (cp.id)::text AS collector_profile_id,
    NULLIF(TRIM(BOTH FROM concat_ws(' '::text, cp.first_name, cp.last_name)), ''::text) AS collector_name,
    ((src.j ->> 'accepted_at'::text))::timestamp with time zone AS accepted_at,
    ((src.j ->> 'picked_up_at'::text))::timestamp with time zone AS picked_up_at,
    COALESCE(((src.j ->> 'disposed_at'::text))::timestamp with time zone, ((src.j ->> 'completed_at'::text))::timestamp with time zone, ((src.j ->> 'collected_at'::text))::timestamp with time zone) AS completed_at,
    ((src.j ->> 'cancelled_at'::text))::timestamp with time zone AS cancelled_at,
    (src.j ->> 'cancelled_by'::text) AS cancelled_by,
    (src.j ->> 'cancellation_reason'::text) AS cancellation_reason,
    COALESCE((src.j ->> 'special_instructions'::text), (src.j ->> 'notes'::text)) AS notes,
    COALESCE((src.j ->> 'scheduled_date'::text), (src.j ->> 'pickup_date'::text)) AS scheduled_date,
    (src.j ->> 'batch_id'::text) AS batch_id,
    td_num((src.j ->> 'promotional_client_fee'::text)) AS promotional_fee,
    td_num((src.j ->> 'collector_core_payout'::text)) AS collector_core_payout,
    td_num((src.j ->> 'collector_urgent_payout'::text)) AS collector_urgent_payout,
    td_num((src.j ->> 'collector_distance_payout'::text)) AS collector_distance_payout,
    td_num((src.j ->> 'collector_total_payout'::text)) AS collector_total_payout,
    td_num((src.j ->> 'platform_share'::text)) AS platform_share,
    COALESCE((jr.stars)::numeric, td_num(COALESCE((src.j ->> 'collector_rating'::text), (src.j ->> 'rating'::text)))) AS customer_rating,
    COALESCE(jr.created_at, ((src.j ->> 'rated_at'::text))::timestamp with time zone) AS rated_at,
    jr.comment AS rating_comment
   FROM (((src
     LEFT JOIN profiles pr ON (((pr.id)::text = (src.j ->> 'user_id'::text))))
     LEFT JOIN job_ratings jr ON (((jr.job_source = src.source) AND (jr.job_id = (src.j ->> 'id'::text)))))
     LEFT JOIN LATERAL ( SELECT c.id,
            c.user_id,
            c.first_name,
            c.last_name
           FROM collector_profiles c
          WHERE (((c.user_id)::text = COALESCE((src.j ->> 'collector_id'::text), (src.j ->> 'assigned_to'::text))) OR ((c.id)::text = COALESCE((src.j ->> 'collector_id'::text), (src.j ->> 'assigned_to'::text))))
         LIMIT 1) cp ON (true));

-- run_alert_rules(): rule 11 is inserted into the live definition, so rules
-- 1-10 (including the protected fee-mismatch rule 9) are carried over exactly.
-- The live definition must be the one this was tested against, and the result
-- must be exactly the reviewed definition; otherwise nothing changes.
DO $mig$
DECLARE
  live text := pg_get_functiondef('public.run_alert_rules(boolean)'::regprocedure);
  anchor text := $anchor$  -- ── report (dry run) or apply ────────────────────────────────────────────
$anchor$;
  rule text := $rule$  -- 11. a household rated the collector 1 or 2 stars (issue #186; owner 2026-11-13)
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

$rule$;
  next text;
BEGIN
  IF md5(live) <> '33ff3a7b7f6d8a033184f0be22300119' THEN
    RAISE EXCEPTION 'run_alert_rules has changed since this migration was written (md5 %)', md5(live);
  END IF;
  IF position(anchor in live) = 0 THEN
    RAISE EXCEPTION 'run_alert_rules: reporting section not found';
  END IF;
  next := replace(live, anchor, rule || anchor);
  IF md5(next) <> '1460b63fb5e3c3ae08dc4e259af1463c' THEN
    RAISE EXCEPTION 'run_alert_rules: the new definition is not the reviewed one (md5 %)', md5(next);
  END IF;
  EXECUTE next;
END
$mig$;

INSERT INTO public.alert_rule_settings (rule_key, enabled, params)
VALUES ('low_rating', true, '{"max_stars": 2}'::jsonb)
ON CONFLICT (rule_key) DO NOTHING;
