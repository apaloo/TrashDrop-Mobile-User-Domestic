-- View public.collector_assignments_view
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.
-- select: authenticated, service_role

create view public.collector_assignments_view as
SELECT idm.id,
    cp.user_id AS collector_id,
    idm.assigned_to AS collector_profile_id,
    idm.waste_type AS type,
    idm.location,
    idm.latitude,
    idm.longitude,
    idm.severity AS priority,
    idm.size,
    idm.photos,
    idm.reported_by,
        CASE idm.status
            WHEN 'verified'::text THEN 'available'::text
            WHEN 'in_progress'::text THEN 'accepted'::text
            WHEN 'completed'::text THEN 'completed'::text
            WHEN 'disposed'::text THEN 'disposed'::text
            ELSE idm.status
        END AS status,
    idm.status AS original_status,
    idm.created_at,
    idm.updated_at,
    idm.disposed_at,
    idm.disposal_site_id,
    idm.disposal_site_name,
    'Community Report'::text AS authority,
    td_cleanup_payment(idm.cleanup_fee, idm.size, idm.severity, (to_jsonb(cp.*) ->> 'collector_type'::text)) AS payment,
        CASE idm.size
            WHEN 'small'::text THEN '15 mins'::text
            WHEN 'medium'::text THEN '30 mins'::text
            WHEN 'large'::text THEN '1 hour'::text
            ELSE '30 mins'::text
        END AS estimated_time,
    'Calculate'::text AS distance,
    COALESCE(idm.fee_paid_by, 'trashdrop'::text) AS fee_paid_by
   FROM (illegal_dumping_mobile idm
     JOIN collector_profiles cp ON ((idm.assigned_to = cp.id)))
  WHERE ((idm.assigned_to IS NOT NULL) AND (idm.status = ANY (ARRAY['verified'::text, 'in_progress'::text, 'completed'::text, 'disposed'::text])) AND ((cp.user_id = auth.uid()) OR td_can_manage_requests() OR (CURRENT_USER <> ALL (ARRAY['anon'::name, 'authenticated'::name]))));
