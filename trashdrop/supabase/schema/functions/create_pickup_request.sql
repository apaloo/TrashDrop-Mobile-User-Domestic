-- Function public.create_pickup_request
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- create_pickup_request(p_id text, p_user_id uuid, p_status text, p_bag_count integer, p_waste_type text, p_special_instructions text, p_longitude double precision, p_latitude double precision, p_address text): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.create_pickup_request(p_id text, p_user_id uuid, p_status text, p_bag_count integer, p_waste_type text, p_special_instructions text, p_longitude double precision, p_latitude double precision, p_address text DEFAULT NULL::text)
 RETURNS TABLE(id text, user_id uuid, status text, waste_type text, special_instructions text, location text, coordinates geography, fee integer, estimated_volume numeric, address text, batch_id uuid, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_location             TEXT;
  v_coordinates          GEOGRAPHY;
  v_fee                  INTEGER;
  v_unit_price           NUMERIC;
  v_batch_id             UUID;
  v_total_available      BIGINT;
  -- RETURNING INTO locals (avoids column name ambiguity with RETURNS TABLE)
  v_id                   TEXT;
  v_user_id              UUID;
  v_status               TEXT;
  v_waste_type           TEXT;
  v_special_instructions TEXT;
  v_location_out         TEXT;
  v_coordinates_out      GEOGRAPHY;
  v_fee_out              INTEGER;
  v_estimated_volume     NUMERIC;
  v_address_out          TEXT;
  v_batch_id_out         UUID;
  v_created_at           TIMESTAMPTZ;
BEGIN
  PERFORM public.td_assert_self_or_staff(p_user_id);
  -- Build WKT location string and PostGIS geography
  v_location    := 'POINT(' || p_longitude || ' ' || p_latitude || ')';
  v_coordinates := ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::geography;

  -- Validate: user must have at least p_bag_count active bags
  SELECT COUNT(bg.id)
  INTO   v_total_available
  FROM   bags bg
  WHERE  bg.user_id = p_user_id
    AND  bg.status  = 'active';

  IF COALESCE(v_total_available, 0) < p_bag_count THEN
    RAISE EXCEPTION 'Insufficient active bags: % available, % requested',
      COALESCE(v_total_available, 0), p_bag_count;
  END IF;

  -- FIFO fee resolution: oldest active batch's unit_price
  -- Rationale: users deplete oldest bags first; oldest batch price is
  -- the most accurate incentive for the collector.
  SELECT b.unit_price, b.id
  INTO   v_unit_price, v_batch_id
  FROM   bags bg
  JOIN   batches b ON bg.batch_id = b.id
  WHERE  bg.user_id    = p_user_id
    AND  bg.status     = 'active'
    AND  b.unit_price  IS NOT NULL
    AND  b.unit_price  > 0
  ORDER BY b.created_at ASC
  LIMIT 1;

  v_fee := COALESCE(v_unit_price, 0)::INTEGER;

  -- Insert with bag_id = NULL (assigned at collection time by collector scan)
  INSERT INTO pickup_requests (
    id,
    user_id,
    status,
    waste_type,
    special_instructions,
    location,
    coordinates,
    fee,
    estimated_volume,
    address,
    batch_id,
    bag_id,
    created_at,
    updated_at
  )
  VALUES (
    p_id,
    p_user_id,
    p_status,
    p_waste_type,
    p_special_instructions,
    v_location,
    v_coordinates,
    v_fee,
    p_bag_count::NUMERIC,
    p_address,
    v_batch_id,
    NULL,
    NOW(),
    NOW()
  )
  RETURNING
    pickup_requests.id,
    pickup_requests.user_id,
    pickup_requests.status,
    pickup_requests.waste_type,
    pickup_requests.special_instructions,
    pickup_requests.location,
    pickup_requests.coordinates,
    pickup_requests.fee,
    pickup_requests.estimated_volume,
    pickup_requests.address,
    pickup_requests.batch_id,
    pickup_requests.created_at
  INTO
    v_id, v_user_id, v_status, v_waste_type, v_special_instructions,
    v_location_out, v_coordinates_out, v_fee_out, v_estimated_volume,
    v_address_out, v_batch_id_out, v_created_at;

  -- Assign RETURNS TABLE columns from local vars (no ambiguity)
  id                   := v_id;
  user_id              := v_user_id;
  status               := v_status;
  waste_type           := v_waste_type;
  special_instructions := v_special_instructions;
  location             := v_location_out;
  coordinates          := v_coordinates_out;
  fee                  := v_fee_out;
  estimated_volume     := v_estimated_volume;
  address              := v_address_out;
  batch_id             := v_batch_id_out;
  created_at           := v_created_at;
  RETURN NEXT;
END;
$function$;
