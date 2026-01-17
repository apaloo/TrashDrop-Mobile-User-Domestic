-- Migration: Add GPS coordinates to Greater Accra pricing zones
-- Date: 2025-01-17
-- Purpose: Enable GPS-based pricing lookup by adding latitude/longitude to existing zones

-- Greater Accra Region coordinates
-- Coordinates sourced from Google Maps for zone center points

-- East Legon (Ayawaso West)
UPDATE public.pricing_zones 
SET latitude = 5.6350, longitude = -0.1570
WHERE suburb = 'East Legon' AND district = 'Accra Metro' AND community = 'Ayawaso West'
AND latitude IS NULL;

-- Dansoman (Ablekuma South)
UPDATE public.pricing_zones 
SET latitude = 5.5480, longitude = -0.2580
WHERE suburb = 'Dansoman' AND district = 'Accra Metro' AND community = 'Ablekuma South'
AND latitude IS NULL;

-- James Town (Ashiedu Keteke)
UPDATE public.pricing_zones 
SET latitude = 5.5340, longitude = -0.2130
WHERE suburb = 'James Town' AND district = 'Accra Metro' AND community = 'Ashiedu Keteke'
AND latitude IS NULL;

-- Spintex (Ledzokuku/Teshie)
UPDATE public.pricing_zones 
SET latitude = 5.6350, longitude = -0.1050
WHERE suburb = 'Spintex' AND district = 'Ledzokuku' AND community = 'Teshie'
AND latitude IS NULL;

-- Madina (La-Nkwantanang)
UPDATE public.pricing_zones 
SET latitude = 5.6720, longitude = -0.1680
WHERE suburb = 'Madina' AND district = 'La-Nkwantanang' AND community = 'Madina'
AND latitude IS NULL;

-- Adenta (Adentan Mun.)
UPDATE public.pricing_zones 
SET latitude = 5.7100, longitude = -0.1620
WHERE suburb = 'Adenta' AND district = 'Adentan Mun.' AND community = 'Adenta'
AND latitude IS NULL;

-- Lapaz (Okaikwei North)
UPDATE public.pricing_zones 
SET latitude = 5.6037, longitude = -0.2479
WHERE suburb = 'Lapaz' AND district = 'Okaikwei North' AND community = 'Lapaz'
AND latitude IS NULL;

-- Ashaiman (Ashaiman Mun.)
UPDATE public.pricing_zones 
SET latitude = 5.6940, longitude = -0.0390
WHERE suburb = 'Ashaiman' AND district = 'Ashaiman Mun.' AND community = 'Ashaiman'
AND latitude IS NULL;

-- Airport Residential (Ayawaso West)
UPDATE public.pricing_zones 
SET latitude = 5.6050, longitude = -0.1780
WHERE suburb = 'Airport Resid.' AND district = 'Accra Metro' AND community = 'Ayawaso West'
AND latitude IS NULL;

-- West Legon (Ayawaso West)
UPDATE public.pricing_zones 
SET latitude = 5.6420, longitude = -0.2100
WHERE suburb = 'West Legon' AND district = 'Accra Metro' AND community = 'Ayawaso West'
AND latitude IS NULL;

-- Cantonments (La Dade-Kotopon)
UPDATE public.pricing_zones 
SET latitude = 5.5770, longitude = -0.1780
WHERE suburb = 'Cantonments' AND district = 'Accra Metro' AND community = 'La Dade-Kotopon'
AND latitude IS NULL;

-- Labone (La Dade-Kotopon)
UPDATE public.pricing_zones 
SET latitude = 5.5680, longitude = -0.1650
WHERE suburb = 'Labone' AND district = 'Accra Metro' AND community = 'La Dade-Kotopon'
AND latitude IS NULL;

-- Ridge (Korle-Klottey)
UPDATE public.pricing_zones 
SET latitude = 5.5650, longitude = -0.1950
WHERE suburb = 'Ridge' AND district = 'Accra Metro' AND community = 'Korle-Klottey'
AND latitude IS NULL;

-- Asylum Down (Korle-Klottey)
UPDATE public.pricing_zones 
SET latitude = 5.5600, longitude = -0.2050
WHERE suburb = 'Asylum Down' AND district = 'Accra Metro' AND community = 'Korle-Klottey'
AND latitude IS NULL;

-- Tesano (Okaikwei South)
UPDATE public.pricing_zones 
SET latitude = 5.5900, longitude = -0.2280
WHERE suburb = 'Tesano' AND district = 'Accra Metro' AND community = 'Okaikwei South'
AND latitude IS NULL;

-- Dzorwulu (Ayawaso Central)
UPDATE public.pricing_zones 
SET latitude = 5.5950, longitude = -0.1920
WHERE suburb = 'Dzorwulu' AND district = 'Accra Metro' AND community = 'Ayawaso Central'
AND latitude IS NULL;

-- Nima (Ayawaso East)
UPDATE public.pricing_zones 
SET latitude = 5.5780, longitude = -0.2050
WHERE suburb = 'Nima' AND district = 'Accra Metro' AND community = 'Ayawaso East'
AND latitude IS NULL;

-- Mamobi (Ayawaso North)
UPDATE public.pricing_zones 
SET latitude = 5.5820, longitude = -0.2100
WHERE suburb = 'Mamobi' AND district = 'Accra Metro' AND community = 'Ayawaso North'
AND latitude IS NULL;

-- Gbawe (Ablekuma West)
UPDATE public.pricing_zones 
SET latitude = 5.5650, longitude = -0.3050
WHERE suburb = 'Gbawe' AND district = 'Accra Metro' AND community = 'Ablekuma West'
AND latitude IS NULL;

-- Abossey Okai (Ablekuma Central)
UPDATE public.pricing_zones 
SET latitude = 5.5550, longitude = -0.2350
WHERE suburb = 'Abossey Okai' AND district = 'Accra Metro' AND community = 'Ablekuma Central'
AND latitude IS NULL;

-- Korle Gonno (Ashiedu Keteke)
UPDATE public.pricing_zones 
SET latitude = 5.5280, longitude = -0.2250
WHERE suburb = 'Korle Gonno' AND district = 'Accra Metro' AND community = 'Ashiedu Keteke'
AND latitude IS NULL;

-- Amasaman (Ga West Mun.)
UPDATE public.pricing_zones 
SET latitude = 5.7020, longitude = -0.3050
WHERE suburb = 'Amasaman' AND district = 'Ga West Mun.' AND community = 'Amasaman'
AND latitude IS NULL;

-- Pokuase (Ga West Mun.)
UPDATE public.pricing_zones 
SET latitude = 5.6950, longitude = -0.2850
WHERE suburb = 'Pokuase' AND district = 'Ga West Mun.' AND community = 'Amasaman'
AND latitude IS NULL;

-- Dome (Ga East Mun.)
UPDATE public.pricing_zones 
SET latitude = 5.6550, longitude = -0.2350
WHERE suburb = 'Dome' AND district = 'Ga East Mun.' AND community = 'Abokobi'
AND latitude IS NULL;

-- Kwabenya (Ga East Mun.)
UPDATE public.pricing_zones 
SET latitude = 5.6850, longitude = -0.2280
WHERE suburb = 'Kwabenya' AND district = 'Ga East Mun.' AND community = 'Abokobi'
AND latitude IS NULL;

-- Haatso (Ga East Mun.)
UPDATE public.pricing_zones 
SET latitude = 5.6650, longitude = -0.2100
WHERE suburb = 'Haatso' AND district = 'Ga East Mun.' AND community = 'Abokobi'
AND latitude IS NULL;

-- Adenta Housing (Adentan Mun.)
UPDATE public.pricing_zones 
SET latitude = 5.7150, longitude = -0.1580
WHERE suburb = 'Adenta Housing' AND district = 'Adentan Mun.' AND community = 'Adenta'
AND latitude IS NULL;

-- Frafraha (Adentan Mun.)
UPDATE public.pricing_zones 
SET latitude = 5.7250, longitude = -0.1450
WHERE suburb = 'Frafraha' AND district = 'Adentan Mun.' AND community = 'Adenta'
AND latitude IS NULL;

-- Oyarifa (Adentan Mun.)
UPDATE public.pricing_zones 
SET latitude = 5.7350, longitude = -0.1380
WHERE suburb = 'Oyarifa' AND district = 'Adentan Mun.' AND community = 'Adenta'
AND latitude IS NULL;

-- Spintex Road (Ledzokuku Mun.)
UPDATE public.pricing_zones 
SET latitude = 5.6300, longitude = -0.1100
WHERE suburb = 'Spintex Road' AND district = 'Ledzokuku Mun.' AND community = 'Teshie'
AND latitude IS NULL;

-- Teshie Nungua (Ledzokuku Mun.)
UPDATE public.pricing_zones 
SET latitude = 5.5800, longitude = -0.0850
WHERE suburb = 'Teshie Nungua' AND district = 'Ledzokuku Mun.' AND community = 'Teshie'
AND latitude IS NULL;

-- Tema Community 1 (Tema Metro)
UPDATE public.pricing_zones 
SET latitude = 5.6700, longitude = -0.0150
WHERE suburb = 'Comm. 1' AND district = 'Tema Metro' AND community = 'Tema'
AND latitude IS NULL;

-- Tema Community 6 (Tema Metro)
UPDATE public.pricing_zones 
SET latitude = 5.6800, longitude = 0.0050
WHERE suburb = 'Comm. 6' AND district = 'Tema Metro' AND community = 'Tema'
AND latitude IS NULL;

-- Tema Community 10 (Tema Metro)
UPDATE public.pricing_zones 
SET latitude = 5.6650, longitude = 0.0150
WHERE suburb = 'Comm. 10' AND district = 'Tema Metro' AND community = 'Tema'
AND latitude IS NULL;

-- Nungua (Krowor Mun.)
UPDATE public.pricing_zones 
SET latitude = 5.5750, longitude = -0.0750
WHERE suburb = 'Nungua' AND district = 'Krowor Mun.' AND community = 'Nungua'
AND latitude IS NULL;

-- Ashaiman Central (Ashaiman Mun.)
UPDATE public.pricing_zones 
SET latitude = 5.6920, longitude = -0.0420
WHERE suburb = 'Ashaiman Central' AND district = 'Ashaiman Mun.' AND community = 'Ashaiman'
AND latitude IS NULL;

-- ============================================================
-- ASHANTI REGION
-- ============================================================

-- Kenyasi No.1 (Ahafo)
UPDATE public.pricing_zones 
SET latitude = 7.0650, longitude = -2.3750
WHERE suburb = 'Kenyasi No.1' AND region = 'Ashanti' AND latitude IS NULL;

-- Nhyiaeso (Kumasi Metro - Asokwa)
UPDATE public.pricing_zones 
SET latitude = 6.6700, longitude = -1.6200
WHERE suburb = 'Nhyiaeso' AND region = 'Ashanti' AND community = 'Asokwa' AND latitude IS NULL;

-- Kwadaso (Kumasi Metro - Bantama)
UPDATE public.pricing_zones 
SET latitude = 6.6950, longitude = -1.6550
WHERE suburb = 'Kwadaso' AND region = 'Ashanti' AND community = 'Bantama' AND latitude IS NULL;

-- Tafo (Kumasi Metro - Suame)
UPDATE public.pricing_zones 
SET latitude = 6.7200, longitude = -1.5950
WHERE suburb = 'Tafo' AND region = 'Ashanti' AND community = 'Suame' AND latitude IS NULL;

-- Ahodwo (Kumasi Metro - Ahwiaa)
UPDATE public.pricing_zones 
SET latitude = 6.6650, longitude = -1.6350
WHERE suburb = 'Ahodwo' AND region = 'Ashanti' AND latitude IS NULL;

-- Santasi (Kumasi Metro)
UPDATE public.pricing_zones 
SET latitude = 6.6800, longitude = -1.6450
WHERE suburb = 'Santasi' AND region = 'Ashanti' AND latitude IS NULL;

-- Nsuom (Kwadaso Mun.)
UPDATE public.pricing_zones 
SET latitude = 6.7050, longitude = -1.6700
WHERE suburb = 'Nsuom' AND region = 'Ashanti' AND latitude IS NULL;

-- Nhyiaeso (Kumasi Metro - Nhyiaeso community)
UPDATE public.pricing_zones 
SET latitude = 6.6680, longitude = -1.6180
WHERE suburb = 'Nhyiaeso' AND region = 'Ashanti' AND community = 'Nhyiaeso' AND latitude IS NULL;

-- Asokwa (Kumasi Metro)
UPDATE public.pricing_zones 
SET latitude = 6.6750, longitude = -1.6100
WHERE suburb = 'Asokwa' AND region = 'Ashanti' AND latitude IS NULL;

-- Kwadaso Estate (Kumasi Metro)
UPDATE public.pricing_zones 
SET latitude = 6.6980, longitude = -1.6600
WHERE suburb = 'Kwadaso Estate' AND region = 'Ashanti' AND latitude IS NULL;

-- Bantama (Kumasi Metro)
UPDATE public.pricing_zones 
SET latitude = 6.7000, longitude = -1.6300
WHERE suburb = 'Bantama' AND region = 'Ashanti' AND latitude IS NULL;

-- Adum (Kumasi Metro - Subin)
UPDATE public.pricing_zones 
SET latitude = 6.6900, longitude = -1.6200
WHERE suburb = 'Adum' AND region = 'Ashanti' AND latitude IS NULL;

-- Dichemso (Kumasi Metro - Manhyia)
UPDATE public.pricing_zones 
SET latitude = 6.7100, longitude = -1.6100
WHERE suburb = 'Dichemso' AND region = 'Ashanti' AND latitude IS NULL;

-- Bomso (Kumasi Metro - Oforikrom)
UPDATE public.pricing_zones 
SET latitude = 6.6850, longitude = -1.5700
WHERE suburb = 'Bomso' AND region = 'Ashanti' AND latitude IS NULL;

-- Ayigya (Kumasi Metro - Oforikrom)
UPDATE public.pricing_zones 
SET latitude = 6.6780, longitude = -1.5650
WHERE suburb = 'Ayigya' AND region = 'Ashanti' AND latitude IS NULL;

-- Suame Magazine (Kumasi Metro - Suame)
UPDATE public.pricing_zones 
SET latitude = 6.7150, longitude = -1.6050
WHERE suburb = 'Suame Magazine' AND region = 'Ashanti' AND latitude IS NULL;

-- Tafo Pankrono (Kumasi Metro - Tafo)
UPDATE public.pricing_zones 
SET latitude = 6.7250, longitude = -1.5900
WHERE suburb = 'Tafo Pankrono' AND region = 'Ashanti' AND latitude IS NULL;

-- Asokore (Kumasi Metro - Asokore Mampong)
UPDATE public.pricing_zones 
SET latitude = 6.7300, longitude = -1.5750
WHERE suburb = 'Asokore' AND region = 'Ashanti' AND latitude IS NULL;

-- Santasi Anyinam (Kumasi Metro)
UPDATE public.pricing_zones 
SET latitude = 6.6820, longitude = -1.6500
WHERE suburb = 'Santasi Anyinam' AND region = 'Ashanti' AND latitude IS NULL;

-- Tanoso (Kumasi Metro)
UPDATE public.pricing_zones 
SET latitude = 6.7400, longitude = -1.6650
WHERE suburb = 'Tanoso' AND region = 'Ashanti' AND latitude IS NULL;

-- Abuakwa (Kumasi Metro)
UPDATE public.pricing_zones 
SET latitude = 6.7350, longitude = -1.6400
WHERE suburb = 'Abuakwa' AND region = 'Ashanti' AND latitude IS NULL;

-- Kronum (Kumasi Metro)
UPDATE public.pricing_zones 
SET latitude = 6.7450, longitude = -1.6250
WHERE suburb = 'Kronum' AND region = 'Ashanti' AND latitude IS NULL;

-- Mamponteng (Kumasi Metro)
UPDATE public.pricing_zones 
SET latitude = 6.7600, longitude = -1.5800
WHERE suburb = 'Mamponteng' AND region = 'Ashanti' AND latitude IS NULL;

-- ============================================================
-- BONO REGION
-- ============================================================

-- Sunyani Central (Sunyani Metro)
UPDATE public.pricing_zones 
SET latitude = 7.3350, longitude = -2.3300
WHERE suburb = 'Sunyani Central' AND region = 'Bono' AND latitude IS NULL;

-- Berlin Top (Sunyani Metro)
UPDATE public.pricing_zones 
SET latitude = 7.3450, longitude = -2.3200
WHERE suburb = 'Berlin Top' AND region = 'Bono' AND latitude IS NULL;

-- Krobo (Techiman Mun.)
UPDATE public.pricing_zones 
SET latitude = 7.5850, longitude = -1.9350
WHERE suburb = 'Krobo' AND region = 'Bono' AND latitude IS NULL;

-- ============================================================
-- CENTRAL REGION
-- ============================================================

-- Kasoa (Awutu Senya E.)
UPDATE public.pricing_zones 
SET latitude = 5.5350, longitude = -0.4250
WHERE suburb = 'Kasoa' AND region = 'Central' AND latitude IS NULL;

-- Abura (Cape Coast Metro)
UPDATE public.pricing_zones 
SET latitude = 5.1150, longitude = -1.2450
WHERE suburb = 'Abura' AND region = 'Central' AND latitude IS NULL;

-- Pedu (Cape Coast Metro)
UPDATE public.pricing_zones 
SET latitude = 5.1250, longitude = -1.2550
WHERE suburb = 'Pedu' AND region = 'Central' AND latitude IS NULL;

-- University Area (Cape Coast Metro)
UPDATE public.pricing_zones 
SET latitude = 5.1100, longitude = -1.2900
WHERE suburb = 'University Area' AND region = 'Central' AND latitude IS NULL;

-- Galilee (Awutu Senya E.)
UPDATE public.pricing_zones 
SET latitude = 5.5400, longitude = -0.4300
WHERE suburb = 'Galilee' AND region = 'Central' AND latitude IS NULL;

-- Millennium City (Awutu Senya E.)
UPDATE public.pricing_zones 
SET latitude = 5.5500, longitude = -0.4150
WHERE suburb = 'Millennium City' AND region = 'Central' AND latitude IS NULL;

-- Betom (New Juaben S.)
UPDATE public.pricing_zones 
SET latitude = 6.0900, longitude = -0.2650
WHERE suburb = 'Betom' AND region = 'Central' AND latitude IS NULL;

-- ============================================================
-- EASTERN REGION
-- ============================================================

-- Effiduase (New Juaben S.)
UPDATE public.pricing_zones 
SET latitude = 6.0850, longitude = -0.2700
WHERE suburb = 'Effiduase' AND region = 'Eastern' AND latitude IS NULL;

-- ============================================================
-- NORTHERN REGION
-- ============================================================

-- Rice City (Tamale Metro)
UPDATE public.pricing_zones 
SET latitude = 9.4050, longitude = -0.8450
WHERE suburb = 'Rice City' AND region = 'Northern' AND latitude IS NULL;

-- Sagnarigu (Sagnrigu Mun.)
UPDATE public.pricing_zones 
SET latitude = 9.4350, longitude = -0.8650
WHERE suburb = 'Sagnarigu' AND region = 'Northern' AND latitude IS NULL;

-- Kalpohin (Tamale Metro)
UPDATE public.pricing_zones 
SET latitude = 9.3950, longitude = -0.8550
WHERE suburb = 'Kalpohin' AND region = 'Northern' AND latitude IS NULL;

-- Lamashegu (Tamale Metro)
UPDATE public.pricing_zones 
SET latitude = 9.4100, longitude = -0.8500
WHERE suburb = 'Lamashegu' AND region = 'Northern' AND latitude IS NULL;

-- Jisonayili (Sagnrigu Mun.)
UPDATE public.pricing_zones 
SET latitude = 9.4400, longitude = -0.8700
WHERE suburb = 'Jisonayili' AND region = 'Northern' AND latitude IS NULL;

-- ============================================================
-- NORTH EAST REGION
-- ============================================================

-- Gambaga (East Mamprusi)
UPDATE public.pricing_zones 
SET latitude = 10.5200, longitude = -0.4450
WHERE suburb = 'Gambaga' AND region = 'North East' AND latitude IS NULL;

-- ============================================================
-- OTI REGION
-- ============================================================

-- Dambai Central (Krachi East)
UPDATE public.pricing_zones 
SET latitude = 8.0700, longitude = 0.1800
WHERE suburb = 'Dambai Central' AND region = 'Oti' AND latitude IS NULL;

-- ============================================================
-- SAVANNAH REGION
-- ============================================================

-- Damongo (West Gonja)
UPDATE public.pricing_zones 
SET latitude = 9.0850, longitude = -1.8200
WHERE suburb = 'Damongo' AND region = 'Savannah' AND latitude IS NULL;

-- ============================================================
-- UPPER EAST REGION
-- ============================================================

-- Soe (Bolgatanga Mun.)
UPDATE public.pricing_zones 
SET latitude = 10.7850, longitude = -0.8550
WHERE suburb = 'Soe' AND region = 'Upper East' AND latitude IS NULL;

-- ============================================================
-- UPPER WEST REGION
-- ============================================================

-- Wa Central (Wa Municipal)
UPDATE public.pricing_zones 
SET latitude = 10.0600, longitude = -2.5000
WHERE suburb = 'Wa Central' AND region = 'Upper West' AND latitude IS NULL;

-- ============================================================
-- VOLTA REGION
-- ============================================================

-- Ho Bankoe (Ho Municipal)
UPDATE public.pricing_zones 
SET latitude = 6.6050, longitude = 0.4700
WHERE suburb = 'Ho Bankoe' AND region = 'Volta' AND latitude IS NULL;

-- Ho Housing (Ho Municipal)
UPDATE public.pricing_zones 
SET latitude = 6.6150, longitude = 0.4650
WHERE suburb = 'Ho Housing' AND region = 'Volta' AND latitude IS NULL;

-- ============================================================
-- WESTERN REGION
-- ============================================================

-- Beach Road (Sekondi-Takoradi)
UPDATE public.pricing_zones 
SET latitude = 4.8950, longitude = -1.7550
WHERE suburb = 'Beach Road' AND region = 'Western' AND latitude IS NULL;

-- Effiakuma (Sekondi-Takoradi / Effia)
UPDATE public.pricing_zones 
SET latitude = 4.9150, longitude = -1.7750
WHERE suburb = 'Effiakuma' AND region = 'Western' AND latitude IS NULL;

-- Anaji (Effia Kwesimintsim)
UPDATE public.pricing_zones 
SET latitude = 4.9050, longitude = -1.7650
WHERE suburb = 'Anaji' AND region = 'Western' AND latitude IS NULL;

-- Anaji Choice (Sekondi-Takoradi)
UPDATE public.pricing_zones 
SET latitude = 4.9080, longitude = -1.7680
WHERE suburb = 'Anaji Choice' AND region = 'Western' AND latitude IS NULL;

-- Kwesimintsim (Sekondi-Takoradi)
UPDATE public.pricing_zones 
SET latitude = 4.9200, longitude = -1.7800
WHERE suburb = 'Kwesimintsim' AND region = 'Western' AND latitude IS NULL;

-- Takoradi Market (Sekondi-Takoradi)
UPDATE public.pricing_zones 
SET latitude = 4.8900, longitude = -1.7500
WHERE suburb = 'Takoradi Market' AND region = 'Western' AND latitude IS NULL;

-- Sekondi Central (Sekondi-Takoradi)
UPDATE public.pricing_zones 
SET latitude = 4.9350, longitude = -1.7100
WHERE suburb = 'Sekondi Central' AND region = 'Western' AND latitude IS NULL;

-- Essikado (Sekondi-Takoradi)
UPDATE public.pricing_zones 
SET latitude = 4.9400, longitude = -1.7000
WHERE suburb = 'Essikado' AND region = 'Western' AND latitude IS NULL;

-- Tarkwa Central (Tarkwa Nsuaem)
UPDATE public.pricing_zones 
SET latitude = 5.3050, longitude = -1.9950
WHERE suburb = 'Tarkwa Central' AND region = 'Western' AND latitude IS NULL;

-- Ahwetesso (Tarkwa Nsuaem)
UPDATE public.pricing_zones 
SET latitude = 5.3100, longitude = -2.0000
WHERE suburb = 'Ahwetesso' AND region = 'Western' AND latitude IS NULL;

-- ============================================================
-- WESTERN NORTH REGION
-- ============================================================

-- Wiawso Central (Sefwi Wiawso)
UPDATE public.pricing_zones 
SET latitude = 6.2150, longitude = -2.4850
WHERE suburb = 'Wiawso Central' AND region = 'Western North' AND latitude IS NULL;

-- ============================================================
-- VERIFY ALL UPDATES
-- ============================================================

DO $$
DECLARE
    updated_count INTEGER;
    total_zones INTEGER;
BEGIN
    SELECT COUNT(*) INTO total_zones FROM public.pricing_zones;
    
    SELECT COUNT(*) INTO updated_count 
    FROM public.pricing_zones 
    WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
    
    RAISE NOTICE 'Pricing zones with coordinates: % / %', updated_count, total_zones;
END $$;
