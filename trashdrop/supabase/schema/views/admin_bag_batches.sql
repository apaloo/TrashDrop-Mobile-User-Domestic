-- View public.admin_bag_batches
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.
-- select: authenticated, service_role

create view public.admin_bag_batches as
SELECT b.id,
    (b.id)::text AS id_text,
    (to_jsonb(b.*) ->> 'batch_number'::text) AS batch_number,
    (to_jsonb(b.*) ->> 'batch_name'::text) AS batch_name,
    COALESCE(b.bag_count, 0) AS bag_count,
    b.type,
    b.size,
    b.qr_prefix,
    b.status AS raw_status,
    b.unit_price,
    ((to_jsonb(b.*) ->> 'total_batch_price'::text))::numeric AS total_batch_price,
    b.created_at,
    b.updated_at,
    (COALESCE(b.archived, false) OR (lower(COALESCE(b.status, ''::text)) = 'archived'::text)) AS archived,
    b.archived_at,
    b.generated_by,
    td_user_label(b.generated_by) AS generated_by_name,
        CASE
            WHEN act.activated THEN b.created_by
            ELSE NULL::uuid
        END AS household_id,
        CASE
            WHEN act.activated THEN td_user_label(b.created_by)
            ELSE NULL::text
        END AS household_name,
        CASE
            WHEN act.activated THEN b.updated_at
            ELSE NULL::timestamp with time zone
        END AS scanned_by_household_at,
    COALESCE(s.total, (0)::bigint) AS bag_rows,
    COALESCE(s.reached_distributed, (0)::bigint) AS distributed_count,
    COALESCE(s.reached_filled, (0)::bigint) AS filled_count,
    COALESCE(s.reached_collected, (0)::bigint) AS collected_count,
    COALESCE(s.reached_processed, (0)::bigint) AS processed_count,
        CASE
            WHEN (COALESCE(b.archived, false) OR (lower(COALESCE(b.status, ''::text)) = 'archived'::text)) THEN 'archived'::text
            WHEN (COALESCE(s.total, (0)::bigint) = 0) THEN
            CASE
                WHEN act.activated THEN 'distributed'::text
                ELSE 'generated'::text
            END
            ELSE td_bag_stage_name(s.min_rank)
        END AS stage,
    s.last_activity_at,
    lower(concat_ws(' '::text, (b.id)::text, (to_jsonb(b.*) ->> 'batch_number'::text), (to_jsonb(b.*) ->> 'batch_name'::text), b.type, b.size, b.qr_prefix)) AS search_text,
    COALESCE(s.scanned, (0)::bigint) AS scanned_count,
        CASE
            WHEN (GREATEST(COALESCE(s.total, (0)::bigint), (COALESCE(b.bag_count, 0))::bigint) > 0) THEN (round(((100.0 * (COALESCE(s.scanned, (0)::bigint))::numeric) / (GREATEST(COALESCE(s.total, (0)::bigint), (COALESCE(b.bag_count, 0))::bigint))::numeric)))::integer
            ELSE 0
        END AS scanned_pct,
    s.last_scan_at,
    COALESCE(s.scan_events, (0)::bigint) AS scan_count
   FROM ((batches b
     CROSS JOIN LATERAL ( SELECT (lower(COALESCE(b.status, ''::text)) = ANY (ARRAY['used'::text, 'activated'::text, 'scanned'::text, 'completed'::text, 'distributed'::text])) AS activated) act)
     LEFT JOIN LATERAL ( SELECT count(*) AS total,
            min(i.stage_rank) AS min_rank,
            count(*) FILTER (WHERE (i.stage_rank >= 2)) AS reached_distributed,
            count(*) FILTER (WHERE (i.stage_rank >= 3)) AS reached_filled,
            count(*) FILTER (WHERE (i.stage_rank >= 4)) AS reached_collected,
            count(*) FILTER (WHERE (i.stage_rank >= 5)) AS reached_processed,
            max(i.last_activity_at) AS last_activity_at,
            count(*) FILTER (WHERE (i.scan_count > 0)) AS scanned,
            sum(i.scan_count) AS scan_events,
            max(i.last_scan_at) AS last_scan_at
           FROM admin_bag_items i
          WHERE (i.batch_id = b.id)) s ON (true))
  WHERE td_is_staff();
