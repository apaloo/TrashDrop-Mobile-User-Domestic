-- Migration: Create GPS-based pricing zones table
-- Date: 2025-01-13
-- Purpose: Location-specific pricing based on GPS coordinates for waste collection services

-- Create pricing_zones table
CREATE TABLE IF NOT EXISTS public.pricing_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country VARCHAR(100) NOT NULL DEFAULT 'Ghana',
  region VARCHAR(100) NOT NULL,
  district VARCHAR(100) NOT NULL,
  community VARCHAR(100) NOT NULL,
  suburb VARCHAR(100) NOT NULL,
  
  -- Coordinates for the zone (center point)
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  
  -- Pricing by bin size (in GHS - Ghana Cedis)
  price_50l DECIMAL(10, 2) NOT NULL,
  price_60l DECIMAL(10, 2) NOT NULL,
  price_80l DECIMAL(10, 2) NOT NULL,
  price_90l DECIMAL(10, 2) NOT NULL,
  price_100l DECIMAL(10, 2) NOT NULL,
  price_120l DECIMAL(10, 2) NOT NULL,
  price_240l DECIMAL(10, 2) NOT NULL,
  price_260l DECIMAL(10, 2) NOT NULL,
  price_320l DECIMAL(10, 2) NOT NULL,
  price_360l DECIMAL(10, 2) NOT NULL,
  
  -- Metadata
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_pricing_zones_region ON public.pricing_zones(region);
CREATE INDEX IF NOT EXISTS idx_pricing_zones_district ON public.pricing_zones(district);
CREATE INDEX IF NOT EXISTS idx_pricing_zones_community ON public.pricing_zones(community);
CREATE INDEX IF NOT EXISTS idx_pricing_zones_suburb ON public.pricing_zones(suburb);
CREATE INDEX IF NOT EXISTS idx_pricing_zones_coords ON public.pricing_zones(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_pricing_zones_active ON public.pricing_zones(is_active) WHERE is_active = true;

-- Add comments for documentation
COMMENT ON TABLE public.pricing_zones IS 'GPS-based pricing zones for waste collection services. Each zone has specific pricing based on location.';
COMMENT ON COLUMN public.pricing_zones.price_50l IS 'Price in GHS for 50 liter bin collection';
COMMENT ON COLUMN public.pricing_zones.price_360l IS 'Price in GHS for 360 liter bin collection';

-- Enable Row Level Security
ALTER TABLE public.pricing_zones ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Allow all authenticated users to read pricing zones
CREATE POLICY "Allow read access to pricing zones"
  ON public.pricing_zones
  FOR SELECT
  TO authenticated
  USING (is_active = true);

-- RLS Policy: Allow anonymous users to read pricing zones (for price preview)
CREATE POLICY "Allow anonymous read access to pricing zones"
  ON public.pricing_zones
  FOR SELECT
  TO anon
  USING (is_active = true);

-- Function to find nearest pricing zone by coordinates
CREATE OR REPLACE FUNCTION public.find_nearest_pricing_zone(
  p_latitude DECIMAL,
  p_longitude DECIMAL,
  p_max_distance_km DECIMAL DEFAULT 10
)
RETURNS TABLE (
  zone_id UUID,
  region VARCHAR,
  district VARCHAR,
  community VARCHAR,
  suburb VARCHAR,
  distance_km DECIMAL,
  price_50l DECIMAL,
  price_60l DECIMAL,
  price_80l DECIMAL,
  price_90l DECIMAL,
  price_100l DECIMAL,
  price_120l DECIMAL,
  price_240l DECIMAL,
  price_260l DECIMAL,
  price_320l DECIMAL,
  price_360l DECIMAL
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM (
    SELECT 
      pz.id AS zone_id,
      pz.region,
      pz.district,
      pz.community,
      pz.suburb,
      -- Haversine formula for distance calculation (in km)
      (6371 * acos(
        cos(radians(p_latitude)) * cos(radians(pz.latitude)) *
        cos(radians(pz.longitude) - radians(p_longitude)) +
        sin(radians(p_latitude)) * sin(radians(pz.latitude))
      ))::DECIMAL AS distance_km,
      pz.price_50l,
      pz.price_60l,
      pz.price_80l,
      pz.price_90l,
      pz.price_100l,
      pz.price_120l,
      pz.price_240l,
      pz.price_260l,
      pz.price_320l,
      pz.price_360l
    FROM public.pricing_zones pz
    WHERE pz.is_active = true
      AND pz.latitude IS NOT NULL
      AND pz.longitude IS NOT NULL
  ) AS zones_with_distance
  WHERE zones_with_distance.distance_km <= p_max_distance_km
  ORDER BY zones_with_distance.distance_km ASC
  LIMIT 1;
END;
$$;

-- Function to get price for specific bin size at location
CREATE OR REPLACE FUNCTION public.get_location_price(
  p_latitude DECIMAL,
  p_longitude DECIMAL,
  p_bin_size INTEGER
)
RETURNS DECIMAL
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_price DECIMAL;
  v_zone RECORD;
BEGIN
  -- Find nearest zone within 10km
  SELECT * INTO v_zone
  FROM public.find_nearest_pricing_zone(p_latitude, p_longitude, 10)
  LIMIT 1;
  
  -- If no zone found, return NULL (caller will use fallback)
  IF v_zone IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Return price based on bin size
  CASE p_bin_size
    WHEN 50 THEN v_price := v_zone.price_50l;
    WHEN 60 THEN v_price := v_zone.price_60l;
    WHEN 80 THEN v_price := v_zone.price_80l;
    WHEN 90 THEN v_price := v_zone.price_90l;
    WHEN 100 THEN v_price := v_zone.price_100l;
    WHEN 120 THEN v_price := v_zone.price_120l;
    WHEN 240 THEN v_price := v_zone.price_240l;
    WHEN 260 THEN v_price := v_zone.price_260l;
    WHEN 320 THEN v_price := v_zone.price_320l;
    WHEN 360 THEN v_price := v_zone.price_360l;
    ELSE v_price := NULL;
  END CASE;
  
  RETURN v_price;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.find_nearest_pricing_zone TO authenticated;
GRANT EXECUTE ON FUNCTION public.find_nearest_pricing_zone TO anon;
GRANT EXECUTE ON FUNCTION public.get_location_price TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_location_price TO anon;

-- Insert pricing data from TrashDrop GPS Pricing Table
-- Ghana pricing zones (approximately 100 zones)

INSERT INTO public.pricing_zones (country, region, district, community, suburb, price_50l, price_60l, price_80l, price_90l, price_100l, price_120l, price_240l, price_260l, price_320l, price_360l) VALUES
-- Ashanti Region
('Ghana', 'Ashanti', 'Ahafo', 'Kentya', 'Kenyasi No.1', 7, 9, 11, 13, 15, 18, 30, 45, 75, 90),
('Ghana', 'Ashanti', 'Kumasi Metro', 'Asokwa', 'Nhyiaeso', 18, 22, 28, 32, 38, 45, 65, 75, 90, 105),
('Ghana', 'Ashanti', 'Kumasi Metro', 'Bantama', 'Kwadaso', 12, 15, 18, 20, 22, 25, 30, 35, 40, 50),
('Ghana', 'Ashanti', 'Kumasi Metro', 'Suame', 'Tafo', 8, 10, 12, 14, 15, 18, 25, 28, 32, 40),
('Ghana', 'Ashanti', 'Kumasi Metro', 'Ahwiaa', 'Ahodwo', 18, 22, 28, 32, 38, 45, 65, 75, 90, 105),
('Ghana', 'Ashanti', 'Kumasi Metro', 'Santasi', 'Santasi', 12, 15, 18, 20, 22, 25, 40, 45, 55, 70),
('Ghana', 'Ashanti', 'Kwadaso Mun.', 'Kwadaso', 'Nsuom', 8, 10, 12, 15, 18, 20, 35, 40, 50, 60),
('Ghana', 'Ashanti', 'Kumasi Metro', 'Nhyiaeso', 'Nhyiaeso', 20, 25, 30, 35, 40, 45, 65, 75, 95, 110),
('Ghana', 'Ashanti', 'Kumasi Metro', 'Asokwa', 'Asokwa', 15, 18, 22, 25, 28, 35, 50, 55, 70, 85),
('Ghana', 'Ashanti', 'Kumasi Metro', 'Kwadaso', 'Kwadaso Estate', 12, 15, 18, 20, 25, 30, 45, 50, 60, 80),
('Ghana', 'Ashanti', 'Kumasi Metro', 'Bantama', 'Bantama', 12, 15, 18, 20, 25, 30, 45, 50, 65, 80),
('Ghana', 'Ashanti', 'Kumasi Metro', 'Subin', 'Adum', 15, 18, 22, 25, 30, 35, 55, 65, 80, 95),
('Ghana', 'Ashanti', 'Kumasi Metro', 'Manhyia', 'Dichemso', 10, 12, 15, 18, 20, 25, 35, 40, 55, 65),
('Ghana', 'Ashanti', 'Kumasi Metro', 'Oforikrom', 'Bomso', 10, 12, 15, 18, 20, 25, 35, 40, 55, 65),
('Ghana', 'Ashanti', 'Kumasi Metro', 'Oforikrom', 'Ayigya', 8, 10, 12, 14, 16, 20, 30, 35, 45, 60),
('Ghana', 'Ashanti', 'Kumasi Metro', 'Suame', 'Suame Magazine', 10, 12, 14, 16, 18, 22, 35, 40, 50, 60),
('Ghana', 'Ashanti', 'Kumasi Metro', 'Tafo', 'Tafo Pankrono', 8, 10, 12, 14, 15, 18, 25, 30, 40, 50),
('Ghana', 'Ashanti', 'Kumasi Metro', 'Asokore Mampong', 'Asokore', 5, 8, 10, 12, 15, 18, 25, 30, 40, 50),
('Ghana', 'Ashanti', 'Kumasi Metro', 'Santasi', 'Santasi Anyinam', 12, 15, 18, 20, 25, 30, 45, 50, 65, 80),
('Ghana', 'Ashanti', 'Kumasi Metro', 'Tanoso', 'Tanoso', 10, 12, 15, 18, 20, 25, 35, 40, 50, 65),
('Ghana', 'Ashanti', 'Kumasi Metro', 'Abuakwa', 'Abuakwa', 8, 10, 12, 15, 18, 22, 35, 40, 50, 60),
('Ghana', 'Ashanti', 'Kumasi Metro', 'Kronum', 'Kronum', 8, 10, 12, 15, 18, 22, 35, 40, 50, 60),
('Ghana', 'Ashanti', 'Kumasi Metro', 'Mamponteng', 'Mamponteng', 6, 8, 10, 12, 15, 18, 30, 35, 45, 55),
('Ghana', 'Bono', 'Sunyani Metro', 'Sunyani', 'Sunyani Central', 10, 12, 15, 18, 20, 25, 40, 45, 55, 70),
('Ghana', 'Bono', 'Sunyani Metro', 'Sunyani', 'Berlin Top', 12, 15, 18, 20, 25, 30, 45, 50, 65, 80),
('Ghana', 'Bono', 'Bono East', 'Techiman Mun.', 'Techiman', 'Krobo', 8, 10, 12, 14, 16, 20, 30, 35, 45, 55),
-- Central Region
('Ghana', 'Central', 'Awutu Senya E.', 'Kasoa', 'Kasoa', 5, 8, 10, 12, 15, 20, 35, 40, 50, 60),
('Ghana', 'Central', 'Cape Coast Metro', 'Abura', 'Abura', 6, 8, 10, 12, 15, 18, 30, 35, 45, 55),
('Ghana', 'Central', 'Cape Coast Metro', 'Cape Coast', 'Abura', 8, 10, 12, 14, 16, 20, 30, 35, 45, 55),
('Ghana', 'Central', 'Cape Coast Metro', 'Cape Coast', 'Pedu', 10, 12, 14, 16, 18, 22, 35, 40, 50, 65),
('Ghana', 'Central', 'Cape Coast Metro', 'Cape Coast', 'University Area', 12, 15, 18, 20, 25, 30, 45, 50, 65, 80),
('Ghana', 'Central', 'Awutu Senya E.', 'Kasoa', 'Galilee', 6, 8, 10, 12, 15, 18, 30, 35, 45, 55),
('Ghana', 'Central', 'Awutu Senya E.', 'Kasoa', 'Millennium City', 12, 15, 18, 20, 25, 30, 45, 50, 65, 80),
('Ghana', 'Central', 'New Juaben S.', 'Koforidua', 'Betom', 8, 10, 12, 14, 16, 20, 30, 35, 45, 55),
('Ghana', 'Eastern', 'New Juaben S.', 'Koforidua', 'Effiduase', 8, 10, 12, 14, 16, 20, 30, 35, 45, 55),
-- Greater Accra Region
('Ghana', 'Greater Accra', 'Accra Metro', 'Ayawaso West', 'East Legon', 25, 30, 35, 40, 50, 70, 85, 90, 95, 110),
('Ghana', 'Greater Accra', 'Accra Metro', 'Ablekuma South', 'Dansoman', 12, 15, 18, 20, 22, 25, 30, 35, 40, 50),
('Ghana', 'Greater Accra', 'Accra Metro', 'Ashiedu Keteke', 'James Town', 8, 10, 12, 14, 15, 18, 23, 28, 32, 40),
('Ghana', 'Greater Accra', 'Ledzokuku', 'Teshie', 'Spintex', 18, 18, 22, 25, 30, 40, 60, 70, 85, 95),
('Ghana', 'Greater Accra', 'La-Nkwantanang', 'Madina', 'Madina', 10, 12, 15, 18, 20, 25, 40, 45, 55, 70),
('Ghana', 'Greater Accra', 'Adentan Mun.', 'Adenta', 'Adenta', 12, 15, 18, 20, 25, 30, 45, 50, 65, 80),
('Ghana', 'Greater Accra', 'Okaikwei North', 'Lapaz', 'Lapaz', 8, 10, 12, 15, 18, 20, 35, 40, 50, 60),
('Ghana', 'Greater Accra', 'Ashaiman Mun.', 'Ashaiman', 'Ashaiman', 5, 7, 10, 12, 15, 18, 24, 30, 35, 55),
('Ghana', 'Greater Accra', 'Accra Metro', 'Ayawaso West', 'Airport Resid.', 25, 30, 35, 40, 45, 55, 80, 90, 110, 130),
('Ghana', 'Greater Accra', 'Accra Metro', 'Ayawaso West', 'East Legon', 20, 25, 30, 35, 40, 50, 70, 80, 100, 115),
('Ghana', 'Greater Accra', 'Accra Metro', 'Ayawaso West', 'West Legon', 20, 25, 30, 35, 40, 50, 70, 80, 90, 110),
('Ghana', 'Greater Accra', 'Accra Metro', 'La Dade-Kotopon', 'Cantonments', 25, 30, 35, 40, 45, 55, 80, 90, 100, 115),
('Ghana', 'Greater Accra', 'Accra Metro', 'La Dade-Kotopon', 'Labone', 20, 25, 30, 35, 40, 50, 75, 85, 100, 115),
('Ghana', 'Greater Accra', 'Accra Metro', 'Korle-Klottey', 'Ridge', 25, 30, 35, 40, 45, 55, 80, 90, 110, 130),
('Ghana', 'Greater Accra', 'Accra Metro', 'Korle-Klottey', 'Asylum Down', 15, 18, 22, 25, 28, 35, 50, 55, 70, 85),
('Ghana', 'Greater Accra', 'Accra Metro', 'Okaikwei South', 'Tesano', 18, 22, 25, 28, 32, 40, 60, 70, 85, 100),
('Ghana', 'Greater Accra', 'Accra Metro', 'Ayawaso Central', 'Dzorwulu', 18, 22, 25, 28, 32, 40, 60, 70, 85, 100),
('Ghana', 'Greater Accra', 'Accra Metro', 'Ayawaso East', 'Nima', 8, 10, 12, 14, 16, 20, 30, 35, 45, 55),
('Ghana', 'Greater Accra', 'Accra Metro', 'Ayawaso North', 'Mamobi', 8, 10, 12, 14, 16, 20, 30, 35, 45, 55),
('Ghana', 'Greater Accra', 'Accra Metro', 'Ablekuma South', 'Dansoman', 12, 15, 18, 20, 22, 30, 40, 45, 50, 65),
('Ghana', 'Greater Accra', 'Accra Metro', 'Ablekuma West', 'Gbawe', 10, 12, 15, 18, 20, 25, 40, 45, 55, 70),
('Ghana', 'Greater Accra', 'Accra Metro', 'Ablekuma Central', 'Abossey Okai', 10, 12, 14, 16, 18, 22, 35, 40, 50, 60),
('Ghana', 'Greater Accra', 'Accra Metro', 'Ashiedu Keteke', 'James Town', 8, 10, 12, 14, 15, 18, 25, 30, 40, 50),
('Ghana', 'Greater Accra', 'Accra Metro', 'Ashiedu Keteke', 'Korle Gonno', 8, 10, 12, 14, 15, 18, 25, 30, 40, 50),
('Ghana', 'Greater Accra', 'Ga West Mun.', 'Amasaman', 'Amasaman', 10, 12, 15, 18, 20, 25, 40, 45, 55, 70),
('Ghana', 'Greater Accra', 'Ga West Mun.', 'Amasaman', 'Pokuase', 10, 12, 15, 18, 20, 25, 40, 45, 55, 70),
('Ghana', 'Greater Accra', 'Ga East Mun.', 'Abokobi', 'Dome', 12, 15, 18, 20, 25, 30, 45, 50, 65, 80),
('Ghana', 'Greater Accra', 'Ga East Mun.', 'Abokobi', 'Kwabenya', 12, 15, 18, 20, 25, 30, 45, 50, 65, 80),
('Ghana', 'Greater Accra', 'Ga East Mun.', 'Abokobi', 'Haatso', 15, 18, 22, 25, 28, 35, 50, 55, 70, 85),
('Ghana', 'Greater Accra', 'Adentan Mun.', 'Adenta', 'Adenta Housing', 15, 18, 22, 25, 28, 35, 50, 55, 70, 85),
('Ghana', 'Greater Accra', 'Adentan Mun.', 'Adenta', 'Frafraha', 12, 15, 18, 20, 25, 30, 45, 50, 65, 80),
('Ghana', 'Greater Accra', 'Adentan Mun.', 'Adenta', 'Oyarifa', 12, 15, 18, 20, 25, 30, 45, 50, 65, 80),
('Ghana', 'Greater Accra', 'Ledzokuku Mun.', 'Teshie', 'Spintex Road', 22, 25, 28, 32, 40, 60, 70, 75, 90, 105),
('Ghana', 'Greater Accra', 'Ledzokuku Mun.', 'Teshie', 'Teshie Nungua', 12, 15, 18, 20, 22, 28, 40, 45, 55, 70),
('Ghana', 'Greater Accra', 'Tema Metro', 'Tema', 'Comm. 1', 12, 13, 15, 18, 20, 22, 27, 35, 40, 50),
('Ghana', 'Greater Accra', 'Tema Metro', 'Tema', 'Comm. 6', 18, 22, 25, 28, 32, 40, 60, 70, 85, 100),
('Ghana', 'Greater Accra', 'Tema Metro', 'Tema', 'Comm. 10', 18, 22, 25, 28, 32, 40, 60, 70, 85, 100),
('Ghana', 'Greater Accra', 'Krowor Mun.', 'Nungua', 'Nungua', 10, 12, 14, 16, 18, 22, 35, 40, 50, 65),
('Ghana', 'Greater Accra', 'Ashaiman Mun.', 'Ashaiman', 'Ashaiman Central', 5, 7, 10, 12, 15, 18, 30, 35, 40, 55),
-- Northern Region
('Ghana', 'North East', 'East Mamprusi', 'Gambaga', 'Gambaga', 5, 7, 9, 11, 13, 15, 25, 30, 40, 50),
('Ghana', 'Northern', 'Tamale Metro', 'Tamale', 'Rice City', 15, 20, 25, 30, 35, 40, 55, 65, 80, 95),
('Ghana', 'Northern', 'Sagnrigu Mun.', 'Sagnarigu', 'Sagnarigu', 7, 9, 12, 14, 16, 20, 35, 40, 45, 70),
('Ghana', 'Northern', 'Tamale Metro', 'Tamale', 'Rice City', 15, 18, 22, 25, 30, 40, 55, 65, 80, 95),
('Ghana', 'Northern', 'Tamale Metro', 'Tamale', 'Kalpohin', 12, 15, 18, 20, 25, 30, 45, 50, 65, 80),
('Ghana', 'Northern', 'Tamale Metro', 'Tamale', 'Lamashegu', 8, 10, 12, 14, 16, 18, 32, 35, 45, 55),
('Ghana', 'Northern', 'Sagnrigu Mun.', 'Sagnarigu', 'Jisonayili', 10, 12, 14, 16, 18, 22, 35, 40, 50, 60),
-- Oti Region
('Ghana', 'Oti', 'Krachi East', 'Dambai', 'Dambai Central', 5, 7, 9, 11, 13, 15, 25, 30, 40, 50),
-- Savannah Region
('Ghana', 'Savannah', 'West Gonja', 'Damongo', 'Damongo', 5, 7, 9, 11, 13, 15, 25, 30, 40, 50),
-- Upper East Region
('Ghana', 'Upper East', 'Bolgatanga Mun.', 'Bolgatanga', 'Soe', 5, 8, 10, 12, 14, 18, 25, 30, 40, 50),
-- Upper West Region
('Ghana', 'Upper West', 'Wa Municipal', 'Wa', 'Wa Central', 6, 8, 10, 12, 14, 18, 25, 30, 40, 50),
-- Volta Region
('Ghana', 'Volta', 'Ho Municipal', 'Ho', 'Ho Bankoe', 8, 10, 12, 14, 18, 22, 35, 40, 55, 65),
('Ghana', 'Volta', 'Ho Municipal', 'Ho', 'Ho Bankoe', 8, 10, 12, 14, 16, 20, 30, 35, 45, 55),
('Ghana', 'Volta', 'Ho Municipal', 'Ho', 'Ho Housing', 10, 12, 15, 18, 20, 25, 40, 45, 55, 70),
-- Western Region
('Ghana', 'Western', 'Sekondi-Takoradi', 'Takoradi', 'Beach Road', 18, 22, 28, 32, 38, 45, 65, 75, 90, 105),
('Ghana', 'Western', 'Sekondi-Takoradi', 'Effia', 'Effiakuma', 12, 15, 18, 22, 25, 30, 55, 65, 80, 95),
('Ghana', 'Western', 'Effia Kwesimintsim', 'Anaji', 'Anaji', 15, 18, 22, 25, 30, 35, 55, 65, 80, 95),
('Ghana', 'Western', 'Sekondi-Takoradi', 'Takoradi', 'Beach Road', 20, 25, 30, 35, 40, 45, 65, 70, 78, 100),
('Ghana', 'Western', 'Sekondi-Takoradi', 'Takoradi', 'Anaji Choice', 18, 22, 25, 28, 32, 40, 60, 70, 85, 100),
('Ghana', 'Western', 'Sekondi-Takoradi', 'Takoradi', 'Effiakuma', 10, 12, 15, 18, 20, 25, 35, 40, 55, 65),
('Ghana', 'Western', 'Sekondi-Takoradi', 'Takoradi', 'Kwesimintsim', 10, 12, 15, 18, 20, 25, 35, 40, 55, 65),
('Ghana', 'Western', 'Sekondi-Takoradi', 'Takoradi', 'Takoradi Market', 15, 18, 20, 25, 30, 35, 55, 65, 80, 95),
('Ghana', 'Western', 'Sekondi-Takoradi', 'Sekondi', 'Sekondi Central', 12, 15, 18, 20, 25, 35, 45, 50, 65, 85),
('Ghana', 'Western', 'Sekondi-Takoradi', 'Sekondi', 'Essikado', 10, 12, 15, 18, 20, 25, 35, 40, 50, 65),
('Ghana', 'Western', 'Tarkwa Nsuaem', 'Tarkwa', 'Tarkwa Central', 12, 15, 18, 20, 25, 30, 45, 50, 65, 80),
('Ghana', 'Western', 'Tarkwa Nsuaem', 'Tarkwa', 'Ahwetesso', 10, 12, 15, 18, 20, 25, 40, 45, 55, 70),
('Ghana', 'Western North', 'Sefwi Wiawso', 'Wiawso', 'Wiawso Central', 8, 10, 11, 14, 15, 18, 25, 30, 40, 50);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_pricing_zones_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_pricing_zones_timestamp
  BEFORE UPDATE ON public.pricing_zones
  FOR EACH ROW
  EXECUTE FUNCTION update_pricing_zones_timestamp();

-- Rollback instructions
/*
DROP TRIGGER IF EXISTS trigger_update_pricing_zones_timestamp ON public.pricing_zones;
DROP FUNCTION IF EXISTS update_pricing_zones_timestamp();
DROP FUNCTION IF EXISTS public.get_location_price;
DROP FUNCTION IF EXISTS public.find_nearest_pricing_zone;
DROP TABLE IF EXISTS public.pricing_zones;
*/
