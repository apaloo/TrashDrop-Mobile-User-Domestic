-- Service coverage: does TrashDrop operate at this point?
--
-- Until now "coverage" only existed as a side effect of pricing: a pin with no
-- pricing zone within 10 km was quietly charged default prices and the request
-- went in anyway, even though no collector serves that area. Coverage is now an
-- explicit rule that the app and WhatsApp both check at the location step:
--
--   a pin is covered when it lies within service_radius_km of an active
--   pricing zone's centre point.
--
-- Each zone carries its own radius so a dense suburb (zone centres 2-3 km
-- apart) and a peri-urban zone can be tuned separately. 5 km is the starting
-- default; widen or narrow per zone with
--   UPDATE public.pricing_zones SET service_radius_km = 8 WHERE suburb = '...';
--
-- Zones without coordinates can never cover anything and are ignored.

ALTER TABLE public.pricing_zones
  ADD COLUMN IF NOT EXISTS service_radius_km NUMERIC(5, 2) NOT NULL DEFAULT 5
    CHECK (service_radius_km > 0 AND service_radius_km <= 50);

COMMENT ON COLUMN public.pricing_zones.service_radius_km IS
  'Radius in km around the zone centre that TrashDrop serves. Pins outside every active zone''s radius are refused at the location step.';

-- Returns exactly one row when any active zone has coordinates:
--   is_covered = true  → the covering zone (the nearest one, if several overlap)
--   is_covered = false → the nearest zone, so the customer can be told how far
--                        away the closest service area is
-- Returns no rows for invalid coordinates or when no zone has coordinates;
-- callers treat that as not covered.
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
      pz.service_radius_km,
      -- Haversine distance in km; the clamp keeps acos() in its domain when the
      -- pin sits exactly on a zone centre and rounding pushes the value past 1
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
  )
  SELECT
    d.dist <= d.service_radius_km,
    d.id,
    d.region,
    d.district,
    d.community,
    d.suburb,
    round(d.dist::NUMERIC, 2),
    d.service_radius_km
  FROM distances d
  -- A covering zone always wins over a merely nearer one: a small zone whose
  -- centre is closer can still leave the pin outside its radius
  ORDER BY (d.dist <= d.service_radius_km) DESC, d.dist ASC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.check_service_coverage(DOUBLE PRECISION, DOUBLE PRECISION) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_service_coverage(DOUBLE PRECISION, DOUBLE PRECISION)
  TO authenticated, service_role;
