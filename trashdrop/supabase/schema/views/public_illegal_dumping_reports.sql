-- View public.public_illegal_dumping_reports
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.
-- select: anon, authenticated, service_role
-- options: security_invoker=false

create view public.public_illegal_dumping_reports with (security_invoker=false) as
WITH base AS (
         SELECT r.id,
                CASE
                    WHEN ((r.latitude)::text ~ '^\s*-?[0-9]+(\.[0-9]+)?\s*$'::text) THEN (TRIM(BOTH FROM (r.latitude)::text))::double precision
                    ELSE NULL::double precision
                END AS latitude,
                CASE
                    WHEN ((r.longitude)::text ~ '^\s*-?[0-9]+(\.[0-9]+)?\s*$'::text) THEN (TRIM(BOTH FROM (r.longitude)::text))::double precision
                    ELSE NULL::double precision
                END AS longitude,
            lower(TRIM(BOTH FROM COALESCE(r.severity, 'medium'::text))) AS severity,
            lower(TRIM(BOTH FROM COALESCE(r.waste_type, 'mixed'::text))) AS waste_type,
            lower(TRIM(BOTH FROM COALESCE(r.status, 'pending'::text))) AS status,
            r.created_at,
            r.updated_at,
            r.completed_at AS stored_completed_at,
            NULLIF(btrim(r.area_name), ''::text) AS stored_area,
                CASE
                    WHEN (COALESCE(r.location, ''::text) ~* '(coordinates|unknown location|location not specified)'::text) THEN ''::text
                    ELSE regexp_replace(COALESCE(r.location, ''::text), ',\s*Ghana\s*$'::text, ''::text, 'i'::text)
                END AS address,
            r.photos
           FROM illegal_dumping_mobile r
        ), named AS (
         SELECT b.id,
            b.latitude,
            b.longitude,
            b.severity,
            b.waste_type,
            b.status,
            b.created_at,
            b.updated_at,
            b.stored_completed_at,
            b.stored_area,
            b.address,
            b.photos,
            COALESCE(b.stored_area, NULLIF(btrim(regexp_replace(array_to_string((string_to_array(b.address, ','::text))[GREATEST(1, (COALESCE(array_length(string_to_array(b.address, ','::text), 1), 1) - 1)):COALESCE(array_length(string_to_array(b.address, ','::text), 1), 1)], ','::text), '\s*,\s*'::text, ', '::text, 'g'::text)), ''::text)) AS candidate_area
           FROM base b
        )
 SELECT id,
    latitude,
    longitude,
    severity,
    waste_type,
    status,
    created_at,
        CASE
            WHEN (status = ANY (ARRAY['completed'::text, 'disposed'::text])) THEN COALESCE(stored_completed_at, updated_at)
            ELSE NULL::timestamp with time zone
        END AS completed_at,
        CASE
            WHEN (candidate_area ~ '-?[0-9]+\.[0-9]{3,}'::text) THEN NULL::text
            ELSE candidate_area
        END AS area_name,
    COALESCE(ARRAY( SELECT p.p
           FROM unnest(n.photos) p(p)
          WHERE (p.p ~~* 'https://%'::text)), ARRAY[]::text[]) AS photo_urls
   FROM named n
  WHERE ((status <> 'cancelled'::text) AND (((latitude >= (4.5)::double precision) AND (latitude <= (11.2)::double precision) AND ((longitude >= ('-3.3'::numeric)::double precision) AND (longitude <= (1.3)::double precision))) OR (td_supported_country(latitude, longitude) = 'LR'::text)));
