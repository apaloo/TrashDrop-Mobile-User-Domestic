-- Database security, views (TD19; owner's approval 2026-11-12). Views run with
-- their owner's rights, so they skip row-level security. Checked against all
-- three apps and 24 hours of API logs on 2026-11-12.

-- 1. Collector cleanup jobs: each collector sees their own (the collector app
--    only ever asks for its own), staff see all, and server functions such as
--    td_withdrawable_items (which run as the owner) are unaffected.
CREATE OR REPLACE VIEW public.collector_assignments_view AS
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
    td_cleanup_payment(idm.cleanup_fee, idm.size, idm.severity, to_jsonb(cp.*) ->> 'collector_type'::text) AS payment,
        CASE idm.size
            WHEN 'small'::text THEN '15 mins'::text
            WHEN 'medium'::text THEN '30 mins'::text
            WHEN 'large'::text THEN '1 hour'::text
            ELSE '30 mins'::text
        END AS estimated_time,
    'Calculate'::text AS distance
   FROM illegal_dumping_mobile idm
     JOIN collector_profiles cp ON idm.assigned_to = cp.id
  WHERE idm.assigned_to IS NOT NULL
    AND idm.status = ANY (ARRAY['verified'::text, 'in_progress'::text, 'completed'::text, 'disposed'::text])
    AND (cp.user_id = auth.uid() OR public.td_can_manage_requests()
         OR CURRENT_USER <> ALL (ARRAY['anon'::name, 'authenticated'::name]));
REVOKE SELECT ON public.collector_assignments_view FROM anon;

-- 2. Views no app reads (none in 24 hours of API logs): closed to app users.
REVOKE SELECT ON public.dumping_duplicate_monitoring, public.unified_pickup_status,
  public.urgent_digital_bins, public.user_dumping_activity FROM anon, authenticated;
