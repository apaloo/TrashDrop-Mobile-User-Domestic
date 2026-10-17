-- Require an active collector for coverage (service coverage, Phase 3).
--
-- NOT APPLIED TO PRODUCTION. Run the preview at the bottom first: every zone
-- it lists with has_collector = false stops taking bookings once this is
-- applied.
--
-- A pin is covered only when it is inside an active zone's service_radius_km
-- AND a collector has been seen within that radius in the last 14 days. "Seen"
-- comes from what the collector app already maintains on collector_profiles:
-- current_location, with last_active and location_updated_at kept fresh by the
-- profile's sync triggers. check_service_coverage keeps its signature, so the
-- app, WhatsApp, the pricing lookup, the digital_bins trigger and the waitlist
-- functions all pick the rule up as is.
--
-- Limitation: collector_profiles holds only each collector's latest location.
-- A collector who last went offline outside the zone they work in does not
-- count towards it.

-- Active-collector rule ---------------------------------------------------

CREATE OR REPLACE FUNCTION public.check_service_coverage(
  p_latitude DOUBLE PRECISION,
  p_longitude DOUBLE PRECISION
)
RETURNS TABLE (
  is_covered BOOLEAN,
  zone_id UUID,
  region VARCHAR,
  district VARCHAR,
  community VARCHAR,
  suburb VARCHAR,
  distance_km NUMERIC,
  service_radius_km NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH distances AS (
    SELECT
      pz.id,
      pz.region,
      pz.district,
      pz.community,
      pz.suburb,
      pz.latitude,
      pz.longitude,
      pz.service_radius_km,
      6371 * acos(LEAST(1.0, GREATEST(-1.0,
        cos(radians(p_latitude)) * cos(radians(pz.latitude)) *
        cos(radians(pz.longitude) - radians(p_longitude)) +
        sin(radians(p_latitude)) * sin(radians(pz.latitude))
      ))) AS dist
    FROM public.pricing_zones pz
    WHERE pz.is_active = true
      AND pz.latitude IS NOT NULL
      AND pz.longitude IS NOT NULL
      AND p_latitude BETWEEN -90 AND 90
      AND p_longitude BETWEEN -180 AND 180
  ),
  staffed AS (
    SELECT
      d.*,
      EXISTS (
        SELECT 1
        FROM public.collector_profiles cp
        WHERE cp.current_location IS NOT NULL
          AND GREATEST(cp.last_active, cp.location_updated_at) >= now() - interval '14 days'
          AND ST_DWithin(
            cp.current_location::geography,
            ST_SetSRID(ST_MakePoint(d.longitude, d.latitude), 4326)::geography,
            d.service_radius_km * 1000
          )
      ) AS has_collector
    FROM distances d
  )
  SELECT
    s.dist <= s.service_radius_km AND s.has_collector,
    -- An unstaffed zone is never presented as "the nearest area we serve"
    CASE WHEN s.has_collector THEN s.id END,
    CASE WHEN s.has_collector THEN s.region END,
    CASE WHEN s.has_collector THEN s.district END,
    CASE WHEN s.has_collector THEN s.community END,
    CASE WHEN s.has_collector THEN s.suburb END,
    CASE WHEN s.has_collector THEN round(s.dist::NUMERIC, 2) END,
    s.service_radius_km
  FROM staffed s
  ORDER BY (s.dist <= s.service_radius_km AND s.has_collector) DESC,
           s.has_collector DESC,
           s.dist ASC
  LIMIT 1;
$$;

-- CREATE OR REPLACE keeps the existing grants (authenticated, service_role)

NOTIFY pgrst, 'reload schema';

-- PREVIEW: run this on its own BEFORE applying this migration. It lists every
-- active zone with coordinates and whether a collector has been seen inside
-- its radius in the last 14 days. Zones with has_collector = false will stop
-- taking bookings once this migration is applied.
--
-- SELECT pz.region, pz.district, pz.suburb, pz.service_radius_km,
--        EXISTS (
--          SELECT 1 FROM public.collector_profiles cp
--          WHERE cp.current_location IS NOT NULL
--            AND GREATEST(cp.last_active, cp.location_updated_at) >= now() - interval '14 days'
--            AND ST_DWithin(cp.current_location::geography,
--                           ST_SetSRID(ST_MakePoint(pz.longitude, pz.latitude), 4326)::geography,
--                           pz.service_radius_km * 1000)
--        ) AS has_collector
-- FROM public.pricing_zones pz
-- WHERE pz.is_active AND pz.latitude IS NOT NULL
-- ORDER BY has_collector, pz.region, pz.district, pz.suburb;
