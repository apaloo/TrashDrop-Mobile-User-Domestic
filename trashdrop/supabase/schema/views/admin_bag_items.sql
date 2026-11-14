-- View public.admin_bag_items
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.
-- select: authenticated, service_role

create view public.admin_bag_items as
WITH bt AS (
         SELECT b.id,
            b.bag_count,
            b.created_by,
            b.status,
            (lower(COALESCE(b.status, ''::text)) = ANY (ARRAY['used'::text, 'activated'::text, 'scanned'::text, 'completed'::text, 'distributed'::text])) AS activated
           FROM batches b
        ), bg AS (
         SELECT g.id,
            g.batch_id,
            g.user_id,
            g.qr_code,
            g.status,
            g.created_at,
            g.updated_at,
            to_jsonb(g.*) AS j,
            bt.activated,
            bool_or((g.user_id IS NOT NULL)) OVER (PARTITION BY g.batch_id) AS has_household_bags
           FROM (bags g
             JOIN bt ON ((bt.id = g.batch_id)))
        ), items AS (
         SELECT bg.id,
            bg.batch_id,
            bg.user_id,
            bg.qr_code,
            bg.status,
            bg.created_at,
            bg.updated_at,
            bg.j,
            bg.activated,
            bg.has_household_bags,
            row_number() OVER (PARTITION BY bg.batch_id ORDER BY bg.created_at, bg.id) AS bag_no
           FROM bg
          WHERE (NOT (bg.activated AND bg.has_household_bags AND (bg.user_id IS NULL)))
        ), pk AS (
         SELECT p.id,
            p.batch_id,
            p.created_at,
            p.n,
            p.st,
            p.collector_ref,
            p.address,
            p.last_event_at,
            sum(p.n) OVER (PARTITION BY p.batch_id ORDER BY p.created_at, p.id) AS cum_end
           FROM ( SELECT pr.id,
                    (to_jsonb(pr.*) ->> 'batch_id'::text) AS batch_id,
                    pr.created_at,
                    GREATEST(1, LEAST(500, COALESCE(
                        CASE
                            WHEN ((to_jsonb(pr.*) ->> 'estimated_volume'::text) ~ '^\d+(\.\d+)?$'::text) THEN (round(((to_jsonb(pr.*) ->> 'estimated_volume'::text))::numeric))::integer
                            ELSE NULL::integer
                        END,
                        CASE
                            WHEN ((to_jsonb(pr.*) ->> 'bag_count'::text) ~ '^\d+$'::text) THEN ((to_jsonb(pr.*) ->> 'bag_count'::text))::integer
                            ELSE NULL::integer
                        END, 1))) AS n,
                    td_canon_status((to_jsonb(pr.*) ->> 'status'::text)) AS st,
                    COALESCE((to_jsonb(pr.*) ->> 'collector_id'::text), (to_jsonb(pr.*) ->> 'assigned_to'::text)) AS collector_ref,
                    (to_jsonb(pr.*) ->> 'address'::text) AS address,
                    COALESCE(((to_jsonb(pr.*) ->> 'completed_at'::text))::timestamp with time zone, ((to_jsonb(pr.*) ->> 'disposed_at'::text))::timestamp with time zone, ((to_jsonb(pr.*) ->> 'picked_up_at'::text))::timestamp with time zone, ((to_jsonb(pr.*) ->> 'updated_at'::text))::timestamp with time zone, pr.created_at) AS last_event_at
                   FROM pickup_requests pr
                  WHERE (((to_jsonb(pr.*) ->> 'batch_id'::text) IS NOT NULL) AND (td_canon_status((to_jsonb(pr.*) ->> 'status'::text)) <> ALL (ARRAY['cancelled'::text, 'expired'::text])))) p
        ), sc AS (
         SELECT s.bag_id,
            count(*) AS n,
            max(s.scanned_at) AS last_at,
            (array_agg(s.scanned_by_name ORDER BY s.scanned_at DESC))[1] AS last_by,
            (array_agg(s.location ORDER BY s.scanned_at DESC))[1] AS last_location
           FROM admin_bag_scans s
          WHERE (s.bag_id IS NOT NULL)
          GROUP BY s.bag_id
        )
 SELECT i.id,
    i.batch_id,
    i.bag_no,
    i.qr_code,
    i.status AS raw_status,
    td_bag_stage_name(r.rank) AS stage,
    r.rank AS stage_rank,
    i.user_id AS household_id,
    td_user_label(i.user_id) AS household_name,
    pk.id AS pickup_id,
    pk.address AS pickup_address,
    pk.st AS pickup_status,
    pk.collector_ref AS collector_id,
    ( SELECT NULLIF(btrim(concat_ws(' '::text, c.first_name, c.last_name)), ''::text) AS "nullif"
           FROM collector_profiles c
          WHERE ((pk.collector_ref IS NOT NULL) AND (((c.user_id)::text = pk.collector_ref) OR ((c.id)::text = pk.collector_ref)))
         LIMIT 1) AS collector_name,
    GREATEST(i.created_at, ((i.j ->> 'scan_date'::text))::timestamp with time zone, ((i.j ->> 'scanned_at'::text))::timestamp with time zone, ((i.j ->> 'collected_at'::text))::timestamp with time zone, pk.last_event_at, sc.last_at) AS last_activity_at,
    i.created_at,
    pk.created_at AS pickup_requested_at,
        CASE
            WHEN (pk.st = ANY (ARRAY['collecting'::text, 'disposed'::text])) THEN pk.last_event_at
            ELSE NULL::timestamp with time zone
        END AS collected_at,
    ((
        CASE
            WHEN (i.user_id IS NOT NULL) THEN 1
            ELSE 0
        END + COALESCE(sc.n, (0)::bigint)))::integer AS scan_count,
    GREATEST(
        CASE
            WHEN (i.user_id IS NOT NULL) THEN i.created_at
            ELSE NULL::timestamp with time zone
        END, sc.last_at) AS last_scan_at,
        CASE
            WHEN ((sc.last_at IS NOT NULL) AND ((i.user_id IS NULL) OR (sc.last_at >= i.created_at))) THEN sc.last_by
            WHEN (i.user_id IS NOT NULL) THEN td_user_label(i.user_id)
            ELSE NULL::text
        END AS last_scanned_by_name,
        CASE
            WHEN ((sc.last_at IS NOT NULL) AND ((i.user_id IS NULL) OR (sc.last_at >= i.created_at))) THEN sc.last_location
            ELSE pk.address
        END AS last_location
   FROM (((items i
     LEFT JOIN pk ON (((pk.batch_id = (i.batch_id)::text) AND (i.bag_no > (pk.cum_end - pk.n)) AND (i.bag_no <= pk.cum_end))))
     LEFT JOIN sc ON ((sc.bag_id = i.id)))
     CROSS JOIN LATERAL ( SELECT GREATEST(td_bag_status_rank(i.status),
                CASE
                    WHEN (pk.st = ANY (ARRAY['collecting'::text, 'disposed'::text])) THEN 4
                    WHEN (pk.id IS NOT NULL) THEN 3
                    ELSE 0
                END,
                CASE
                    WHEN (i.activated OR (i.user_id IS NOT NULL)) THEN 2
                    ELSE 1
                END) AS rank) r)
  WHERE td_is_staff();
