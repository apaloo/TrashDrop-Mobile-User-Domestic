-- ============================================================
-- SQL QUERIES TO ADD GPS COORDINATES TO PRICING ZONES
-- Run these directly in Supabase SQL Editor
-- Date: 2025-01-17
-- ============================================================

-- ============================================================
-- FIX: Update find_nearest_pricing_zone function
-- The original function had HAVING without GROUP BY
-- ============================================================

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

-- ============================================================
-- GREATER ACCRA REGION
-- ---------------------

-- East Legon (Ayawaso West) - Two entries
UPDATE public.pricing_zones 
SET latitude = 5.6350, longitude = -0.1570
WHERE suburb = 'East Legon' AND region = 'Greater Accra';

-- Dansoman (Ablekuma South) - Two entries
UPDATE public.pricing_zones 
SET latitude = 5.5480, longitude = -0.2580
WHERE suburb = 'Dansoman' AND region = 'Greater Accra';

-- James Town (Ashiedu Keteke) - Two entries
UPDATE public.pricing_zones 
SET latitude = 5.5340, longitude = -0.2130
WHERE suburb = 'James Town' AND region = 'Greater Accra';

-- Spintex (Ledzokuku/Teshie)
UPDATE public.pricing_zones 
SET latitude = 5.6350, longitude = -0.1050
WHERE suburb = 'Spintex' AND region = 'Greater Accra';

-- Madina (La-Nkwantanang)
UPDATE public.pricing_zones 
SET latitude = 5.6720, longitude = -0.1680
WHERE suburb = 'Madina' AND region = 'Greater Accra';

-- Adenta (Adentan Mun.)
UPDATE public.pricing_zones 
SET latitude = 5.7100, longitude = -0.1620
WHERE suburb = 'Adenta' AND region = 'Greater Accra';

-- Lapaz (Okaikwei North) - THE KEY ONE FOR YOUR TEST
UPDATE public.pricing_zones 
SET latitude = 5.6037, longitude = -0.2479
WHERE suburb = 'Lapaz' AND region = 'Greater Accra';

-- Ashaiman (Ashaiman Mun.)
UPDATE public.pricing_zones 
SET latitude = 5.6940, longitude = -0.0390
WHERE suburb = 'Ashaiman' AND region = 'Greater Accra';

-- Ashaiman Central
UPDATE public.pricing_zones 
SET latitude = 5.6920, longitude = -0.0420
WHERE suburb = 'Ashaiman Central' AND region = 'Greater Accra';

-- Airport Residential (Ayawaso West)
UPDATE public.pricing_zones 
SET latitude = 5.6050, longitude = -0.1780
WHERE suburb = 'Airport Resid.' AND region = 'Greater Accra';

-- West Legon (Ayawaso West)
UPDATE public.pricing_zones 
SET latitude = 5.6420, longitude = -0.2100
WHERE suburb = 'West Legon' AND region = 'Greater Accra';

-- Cantonments (La Dade-Kotopon)
UPDATE public.pricing_zones 
SET latitude = 5.5770, longitude = -0.1780
WHERE suburb = 'Cantonments' AND region = 'Greater Accra';

-- Labone (La Dade-Kotopon)
UPDATE public.pricing_zones 
SET latitude = 5.5680, longitude = -0.1650
WHERE suburb = 'Labone' AND region = 'Greater Accra';

-- Ridge (Korle-Klottey)
UPDATE public.pricing_zones 
SET latitude = 5.5650, longitude = -0.1950
WHERE suburb = 'Ridge' AND region = 'Greater Accra';

-- Asylum Down (Korle-Klottey)
UPDATE public.pricing_zones 
SET latitude = 5.5600, longitude = -0.2050
WHERE suburb = 'Asylum Down' AND region = 'Greater Accra';

-- Tesano (Okaikwei South)
UPDATE public.pricing_zones 
SET latitude = 5.5900, longitude = -0.2280
WHERE suburb = 'Tesano' AND region = 'Greater Accra';

-- Dzorwulu (Ayawaso Central)
UPDATE public.pricing_zones 
SET latitude = 5.5950, longitude = -0.1920
WHERE suburb = 'Dzorwulu' AND region = 'Greater Accra';

-- Nima (Ayawaso East)
UPDATE public.pricing_zones 
SET latitude = 5.5780, longitude = -0.2050
WHERE suburb = 'Nima' AND region = 'Greater Accra';

-- Mamobi (Ayawaso North)
UPDATE public.pricing_zones 
SET latitude = 5.5820, longitude = -0.2100
WHERE suburb = 'Mamobi' AND region = 'Greater Accra';

-- Gbawe (Ablekuma West)
UPDATE public.pricing_zones 
SET latitude = 5.5650, longitude = -0.3050
WHERE suburb = 'Gbawe' AND region = 'Greater Accra';

-- Abossey Okai (Ablekuma Central)
UPDATE public.pricing_zones 
SET latitude = 5.5550, longitude = -0.2350
WHERE suburb = 'Abossey Okai' AND region = 'Greater Accra';

-- Korle Gonno (Ashiedu Keteke)
UPDATE public.pricing_zones 
SET latitude = 5.5280, longitude = -0.2250
WHERE suburb = 'Korle Gonno' AND region = 'Greater Accra';

-- Amasaman (Ga West Mun.)
UPDATE public.pricing_zones 
SET latitude = 5.7020, longitude = -0.3050
WHERE suburb = 'Amasaman' AND region = 'Greater Accra';

-- Pokuase (Ga West Mun.)
UPDATE public.pricing_zones 
SET latitude = 5.6950, longitude = -0.2850
WHERE suburb = 'Pokuase' AND region = 'Greater Accra';

-- Dome (Ga East Mun.)
UPDATE public.pricing_zones 
SET latitude = 5.6550, longitude = -0.2350
WHERE suburb = 'Dome' AND region = 'Greater Accra';

-- Kwabenya (Ga East Mun.)
UPDATE public.pricing_zones 
SET latitude = 5.6850, longitude = -0.2280
WHERE suburb = 'Kwabenya' AND region = 'Greater Accra';

-- Haatso (Ga East Mun.)
UPDATE public.pricing_zones 
SET latitude = 5.6650, longitude = -0.2100
WHERE suburb = 'Haatso' AND region = 'Greater Accra';

-- Adenta Housing (Adentan Mun.)
UPDATE public.pricing_zones 
SET latitude = 5.7150, longitude = -0.1580
WHERE suburb = 'Adenta Housing' AND region = 'Greater Accra';

-- Frafraha (Adentan Mun.)
UPDATE public.pricing_zones 
SET latitude = 5.7250, longitude = -0.1450
WHERE suburb = 'Frafraha' AND region = 'Greater Accra';

-- Oyarifa (Adentan Mun.)
UPDATE public.pricing_zones 
SET latitude = 5.7350, longitude = -0.1380
WHERE suburb = 'Oyarifa' AND region = 'Greater Accra';

-- Spintex Road (Ledzokuku Mun.)
UPDATE public.pricing_zones 
SET latitude = 5.6300, longitude = -0.1100
WHERE suburb = 'Spintex Road' AND region = 'Greater Accra';

-- Teshie Nungua (Ledzokuku Mun.)
UPDATE public.pricing_zones 
SET latitude = 5.5800, longitude = -0.0850
WHERE suburb = 'Teshie Nungua' AND region = 'Greater Accra';

-- Tema Community 1
UPDATE public.pricing_zones 
SET latitude = 5.6700, longitude = -0.0150
WHERE suburb = 'Comm. 1' AND region = 'Greater Accra';

-- Tema Community 6
UPDATE public.pricing_zones 
SET latitude = 5.6800, longitude = 0.0050
WHERE suburb = 'Comm. 6' AND region = 'Greater Accra';

-- Tema Community 10
UPDATE public.pricing_zones 
SET latitude = 5.6650, longitude = 0.0150
WHERE suburb = 'Comm. 10' AND region = 'Greater Accra';

-- Nungua (Krowor Mun.)
UPDATE public.pricing_zones 
SET latitude = 5.5750, longitude = -0.0750
WHERE suburb = 'Nungua' AND region = 'Greater Accra';

-- ============================================================
-- ASHANTI REGION
-- ============================================================

-- Kenyasi No.1 (Ahafo)
UPDATE public.pricing_zones 
SET latitude = 7.0650, longitude = -2.3750
WHERE suburb = 'Kenyasi No.1' AND region = 'Ashanti';

-- Nhyiaeso (Kumasi Metro - Asokwa)
UPDATE public.pricing_zones 
SET latitude = 6.6700, longitude = -1.6200
WHERE suburb = 'Nhyiaeso' AND region = 'Ashanti' AND community = 'Asokwa';

-- Kwadaso (Kumasi Metro - Bantama)
UPDATE public.pricing_zones 
SET latitude = 6.6950, longitude = -1.6550
WHERE suburb = 'Kwadaso' AND region = 'Ashanti' AND community = 'Bantama';

-- Tafo (Kumasi Metro - Suame)
UPDATE public.pricing_zones 
SET latitude = 6.7200, longitude = -1.5950
WHERE suburb = 'Tafo' AND region = 'Ashanti' AND community = 'Suame';

-- Ahodwo (Kumasi Metro - Ahwiaa)
UPDATE public.pricing_zones 
SET latitude = 6.6650, longitude = -1.6350
WHERE suburb = 'Ahodwo' AND region = 'Ashanti';

-- Santasi (Kumasi Metro)
UPDATE public.pricing_zones 
SET latitude = 6.6800, longitude = -1.6450
WHERE suburb = 'Santasi' AND region = 'Ashanti';

-- Nsuom (Kwadaso Mun.)
UPDATE public.pricing_zones 
SET latitude = 6.7050, longitude = -1.6700
WHERE suburb = 'Nsuom' AND region = 'Ashanti';

-- Nhyiaeso (Kumasi Metro - Nhyiaeso community)
UPDATE public.pricing_zones 
SET latitude = 6.6680, longitude = -1.6180
WHERE suburb = 'Nhyiaeso' AND region = 'Ashanti' AND community = 'Nhyiaeso';

-- Asokwa (Kumasi Metro)
UPDATE public.pricing_zones 
SET latitude = 6.6750, longitude = -1.6100
WHERE suburb = 'Asokwa' AND region = 'Ashanti';

-- Kwadaso Estate (Kumasi Metro)
UPDATE public.pricing_zones 
SET latitude = 6.6980, longitude = -1.6600
WHERE suburb = 'Kwadaso Estate' AND region = 'Ashanti';

-- Bantama (Kumasi Metro)
UPDATE public.pricing_zones 
SET latitude = 6.7000, longitude = -1.6300
WHERE suburb = 'Bantama' AND region = 'Ashanti';

-- Adum (Kumasi Metro - Subin)
UPDATE public.pricing_zones 
SET latitude = 6.6900, longitude = -1.6200
WHERE suburb = 'Adum' AND region = 'Ashanti';

-- Dichemso (Kumasi Metro - Manhyia)
UPDATE public.pricing_zones 
SET latitude = 6.7100, longitude = -1.6100
WHERE suburb = 'Dichemso' AND region = 'Ashanti';

-- Bomso (Kumasi Metro - Oforikrom)
UPDATE public.pricing_zones 
SET latitude = 6.6850, longitude = -1.5700
WHERE suburb = 'Bomso' AND region = 'Ashanti';

-- Ayigya (Kumasi Metro - Oforikrom)
UPDATE public.pricing_zones 
SET latitude = 6.6780, longitude = -1.5650
WHERE suburb = 'Ayigya' AND region = 'Ashanti';

-- Suame Magazine (Kumasi Metro - Suame)
UPDATE public.pricing_zones 
SET latitude = 6.7150, longitude = -1.6050
WHERE suburb = 'Suame Magazine' AND region = 'Ashanti';

-- Tafo Pankrono (Kumasi Metro - Tafo)
UPDATE public.pricing_zones 
SET latitude = 6.7250, longitude = -1.5900
WHERE suburb = 'Tafo Pankrono' AND region = 'Ashanti';

-- Asokore (Kumasi Metro - Asokore Mampong)
UPDATE public.pricing_zones 
SET latitude = 6.7300, longitude = -1.5750
WHERE suburb = 'Asokore' AND region = 'Ashanti';

-- Santasi Anyinam (Kumasi Metro)
UPDATE public.pricing_zones 
SET latitude = 6.6820, longitude = -1.6500
WHERE suburb = 'Santasi Anyinam' AND region = 'Ashanti';

-- Tanoso (Kumasi Metro)
UPDATE public.pricing_zones 
SET latitude = 6.7400, longitude = -1.6650
WHERE suburb = 'Tanoso' AND region = 'Ashanti';

-- Abuakwa (Kumasi Metro)
UPDATE public.pricing_zones 
SET latitude = 6.7350, longitude = -1.6400
WHERE suburb = 'Abuakwa' AND region = 'Ashanti';

-- Kronum (Kumasi Metro)
UPDATE public.pricing_zones 
SET latitude = 6.7450, longitude = -1.6250
WHERE suburb = 'Kronum' AND region = 'Ashanti';

-- Mamponteng (Kumasi Metro)
UPDATE public.pricing_zones 
SET latitude = 6.7600, longitude = -1.5800
WHERE suburb = 'Mamponteng' AND region = 'Ashanti';

-- ============================================================
-- BONO REGION
-- ============================================================

-- Sunyani Central (Sunyani Metro)
UPDATE public.pricing_zones 
SET latitude = 7.3350, longitude = -2.3300
WHERE suburb = 'Sunyani Central' AND region = 'Bono';

-- Berlin Top (Sunyani Metro)
UPDATE public.pricing_zones 
SET latitude = 7.3450, longitude = -2.3200
WHERE suburb = 'Berlin Top' AND region = 'Bono';

-- Krobo (Techiman Mun.)
UPDATE public.pricing_zones 
SET latitude = 7.5850, longitude = -1.9350
WHERE suburb = 'Krobo' AND region = 'Bono';

-- ============================================================
-- CENTRAL REGION
-- ============================================================

-- Kasoa (Awutu Senya E.)
UPDATE public.pricing_zones 
SET latitude = 5.5350, longitude = -0.4250
WHERE suburb = 'Kasoa' AND region = 'Central';

-- Abura (Cape Coast Metro)
UPDATE public.pricing_zones 
SET latitude = 5.1150, longitude = -1.2450
WHERE suburb = 'Abura' AND region = 'Central';

-- Pedu (Cape Coast Metro)
UPDATE public.pricing_zones 
SET latitude = 5.1250, longitude = -1.2550
WHERE suburb = 'Pedu' AND region = 'Central';

-- University Area (Cape Coast Metro)
UPDATE public.pricing_zones 
SET latitude = 5.1100, longitude = -1.2900
WHERE suburb = 'University Area' AND region = 'Central';

-- Galilee (Awutu Senya E.)
UPDATE public.pricing_zones 
SET latitude = 5.5400, longitude = -0.4300
WHERE suburb = 'Galilee' AND region = 'Central';

-- Millennium City (Awutu Senya E.)
UPDATE public.pricing_zones 
SET latitude = 5.5500, longitude = -0.4150
WHERE suburb = 'Millennium City' AND region = 'Central';

-- ============================================================
-- EASTERN REGION
-- ============================================================

-- Effiduase (New Juaben S.)
UPDATE public.pricing_zones 
SET latitude = 6.0850, longitude = -0.2700
WHERE suburb = 'Effiduase' AND region = 'Eastern';

-- Betom (New Juaben S.)
UPDATE public.pricing_zones 
SET latitude = 6.0900, longitude = -0.2650
WHERE suburb = 'Betom' AND region = 'Central';


-- ============================================================
-- NORTHERN REGION
-- ============================================================

-- Rice City (Tamale Metro)
UPDATE public.pricing_zones 
SET latitude = 9.4050, longitude = -0.8450
WHERE suburb = 'Rice City' AND region = 'Northern';

-- Sagnarigu (Sagnrigu Mun.)
UPDATE public.pricing_zones 
SET latitude = 9.4350, longitude = -0.8650
WHERE suburb = 'Sagnarigu' AND region = 'Northern';

-- Kalpohin (Tamale Metro)
UPDATE public.pricing_zones 
SET latitude = 9.3950, longitude = -0.8550
WHERE suburb = 'Kalpohin' AND region = 'Northern';

-- Lamashegu (Tamale Metro)
UPDATE public.pricing_zones 
SET latitude = 9.4100, longitude = -0.8500
WHERE suburb = 'Lamashegu' AND region = 'Northern';

-- Jisonayili (Sagnrigu Mun.)
UPDATE public.pricing_zones 
SET latitude = 9.4400, longitude = -0.8700
WHERE suburb = 'Jisonayili' AND region = 'Northern';

-- ============================================================
-- NORTH EAST REGION
-- ============================================================

-- Gambaga (East Mamprusi)
UPDATE public.pricing_zones 
SET latitude = 10.5200, longitude = -0.4450
WHERE suburb = 'Gambaga' AND region = 'North East';

-- ============================================================
-- OTI REGION
-- ============================================================

-- Dambai Central (Krachi East)
UPDATE public.pricing_zones 
SET latitude = 8.0700, longitude = 0.1800
WHERE suburb = 'Dambai Central' AND region = 'Oti';

-- ============================================================
-- SAVANNAH REGION
-- ============================================================

-- Damongo (West Gonja)
UPDATE public.pricing_zones 
SET latitude = 9.0850, longitude = -1.8200
WHERE suburb = 'Damongo' AND region = 'Savannah';

-- ============================================================
-- UPPER EAST REGION
-- ============================================================

-- Soe (Bolgatanga Mun.)
UPDATE public.pricing_zones 
SET latitude = 10.7850, longitude = -0.8550
WHERE suburb = 'Soe' AND region = 'Upper East';

-- ============================================================
-- UPPER WEST REGION
-- ============================================================

-- Wa Central (Wa Municipal)
UPDATE public.pricing_zones 
SET latitude = 10.0600, longitude = -2.5000
WHERE suburb = 'Wa Central' AND region = 'Upper West';

-- ============================================================
-- VOLTA REGION
-- ============================================================

-- Ho Bankoe (Ho Municipal)
UPDATE public.pricing_zones 
SET latitude = 6.6050, longitude = 0.4700
WHERE suburb = 'Ho Bankoe' AND region = 'Volta';

-- Ho Housing (Ho Municipal)
UPDATE public.pricing_zones 
SET latitude = 6.6150, longitude = 0.4650
WHERE suburb = 'Ho Housing' AND region = 'Volta';

-- ============================================================
-- WESTERN REGION
-- ============================================================

-- Beach Road (Sekondi-Takoradi)
UPDATE public.pricing_zones 
SET latitude = 4.8950, longitude = -1.7550
WHERE suburb = 'Beach Road' AND region = 'Western';

-- Effiakuma (Sekondi-Takoradi / Effia)
UPDATE public.pricing_zones 
SET latitude = 4.9150, longitude = -1.7750
WHERE suburb = 'Effiakuma' AND region = 'Western';

-- Anaji (Effia Kwesimintsim)
UPDATE public.pricing_zones 
SET latitude = 4.9050, longitude = -1.7650
WHERE suburb = 'Anaji' AND region = 'Western';

-- Anaji Choice (Sekondi-Takoradi)
UPDATE public.pricing_zones 
SET latitude = 4.9080, longitude = -1.7680
WHERE suburb = 'Anaji Choice' AND region = 'Western';

-- Kwesimintsim (Sekondi-Takoradi)
UPDATE public.pricing_zones 
SET latitude = 4.9200, longitude = -1.7800
WHERE suburb = 'Kwesimintsim' AND region = 'Western';

-- Takoradi Market (Sekondi-Takoradi)
UPDATE public.pricing_zones 
SET latitude = 4.8900, longitude = -1.7500
WHERE suburb = 'Takoradi Market' AND region = 'Western';

-- Sekondi Central (Sekondi-Takoradi)
UPDATE public.pricing_zones 
SET latitude = 4.9350, longitude = -1.7100
WHERE suburb = 'Sekondi Central' AND region = 'Western';

-- Essikado (Sekondi-Takoradi)
UPDATE public.pricing_zones 
SET latitude = 4.9400, longitude = -1.7000
WHERE suburb = 'Essikado' AND region = 'Western';

-- Tarkwa Central (Tarkwa Nsuaem)
UPDATE public.pricing_zones 
SET latitude = 5.3050, longitude = -1.9950
WHERE suburb = 'Tarkwa Central' AND region = 'Western';

-- Ahwetesso (Tarkwa Nsuaem)
UPDATE public.pricing_zones 
SET latitude = 5.3100, longitude = -2.0000
WHERE suburb = 'Ahwetesso' AND region = 'Western';

-- ============================================================
-- WESTERN NORTH REGION
-- ============================================================

-- Wiawso Central (Sefwi Wiawso)
UPDATE public.pricing_zones 
SET latitude = 6.2150, longitude = -2.4850
WHERE suburb = 'Wiawso Central' AND region = 'Western North';

-- ============================================================
-- VERIFY ALL UPDATES
-- ============================================================

-- Check how many zones now have coordinates by region
SELECT 
    region,
    COUNT(*) FILTER (WHERE latitude IS NOT NULL AND longitude IS NOT NULL) as with_coords,
    COUNT(*) as total,
    ROUND(100.0 * COUNT(*) FILTER (WHERE latitude IS NOT NULL AND longitude IS NOT NULL) / COUNT(*), 1) as percent
FROM public.pricing_zones 
GROUP BY region
ORDER BY region;

-- Overall stats
SELECT 
    COUNT(*) FILTER (WHERE latitude IS NOT NULL AND longitude IS NOT NULL) as with_coords,
    COUNT(*) as total,
    ROUND(100.0 * COUNT(*) FILTER (WHERE latitude IS NOT NULL AND longitude IS NOT NULL) / COUNT(*), 1) as percent
FROM public.pricing_zones;

-- ============================================================
-- TEST: Find nearest zone for Lapaz coordinates
-- ============================================================

-- Test with Lapaz user coordinates (5.608, -0.249)
SELECT * FROM public.find_nearest_pricing_zone(5.608, -0.249, 10);

-- Should return Lapaz zone with price_240l = 35
