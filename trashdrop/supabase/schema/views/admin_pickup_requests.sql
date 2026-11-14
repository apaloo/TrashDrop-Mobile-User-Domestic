-- View public.admin_pickup_requests
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.
-- select: anon, authenticated, service_role
-- options: security_invoker=true

create view public.admin_pickup_requests with (security_invoker=true) as
WITH src AS (
         SELECT 'pickup_requests'::text AS source,
            to_jsonb(p.*) AS j,
            td_row_point(to_jsonb(p.*)) AS pt,
            NULL::text AS place
           FROM pickup_requests p
        UNION ALL
         SELECT 'digital_bins'::text AS text,
            to_jsonb(b.*) AS to_jsonb,
            td_row_point(to_jsonb(l.*)) AS td_row_point,
            COALESCE((to_jsonb(l.*) ->> 'address'::text), (to_jsonb(l.*) ->> 'location_name'::text)) AS "coalesce"
           FROM (digital_bins b
             LEFT JOIN bin_locations l ON (((l.id)::text = (to_jsonb(b.*) ->> 'location_id'::text))))
        UNION ALL
         SELECT 'scheduled_pickups'::text AS text,
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
