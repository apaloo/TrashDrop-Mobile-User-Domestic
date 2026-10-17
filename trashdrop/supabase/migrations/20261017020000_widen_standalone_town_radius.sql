-- Widen the service radius of standalone-town zones to 10 km.
--
-- Policy: zones in the six city areas keep the 5 km default. That includes
-- the municipal districts that form part of those cities (the Greater Accra
-- municipalities around Accra and Tema, Kwadaso in Kumasi,
-- Effia-Kwesimintsim in Sekondi-Takoradi, Sagnrigu in Tamale). Their zone
-- centres sit a kilometre or two apart, so 5 km already overlaps.
-- Standalone towns have one to three zones each and collectors who
-- travel further, so they get 10 km.
--
-- Matched by district so a zone added later in one of these districts can be
-- given the same radius by re-running this statement.

UPDATE public.pricing_zones
SET service_radius_km = 10,
    updated_at = now()
WHERE district IN (
  'Ahafo',            -- Kenyasi No.1
  'Bono East',        -- Techiman (no coordinates yet, see below)
  'Awutu Senya E.',   -- Kasoa, Millennium City, Galilee
  'New Juaben S.',    -- Koforidua: Betom, Effiduase
  'East Mamprusi',    -- Gambaga
  'Krachi East',      -- Dambai
  'West Gonja',       -- Damongo
  'Bolgatanga Mun.',  -- Soe
  'Wa Municipal',     -- Wa Central
  'Ho Municipal',     -- Ho Bankoe, Ho Housing
  'Tarkwa Nsuaem',    -- Tarkwa Central, Ahwetesso
  'Sefwi Wiawso'      -- Wiawso Central
);

-- Techiman has no latitude/longitude, so no radius can make it cover
-- anyone. Once its centre point is confirmed, set it, for example:
--   UPDATE public.pricing_zones SET latitude = 7.5833, longitude = -1.9333
--   WHERE suburb = 'Techiman' AND district = 'Bono East';
