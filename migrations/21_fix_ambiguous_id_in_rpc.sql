-- Migration 21: Fix "column reference id is ambiguous" in create_pickup_request
--
-- Root cause: The RETURNS TABLE declares a column named "id", and the
-- INSERT...RETURNING clause also references "id" from pickup_requests.
-- PostgreSQL cannot resolve which "id" is meant → 42702 ambiguous reference.
--
-- The table-qualified RETURNING (pickup_requests.id) fixes it, but only if
-- the correct version is actually deployed. Previous DROP statements may have
-- missed some overloaded signatures, leaving the buggy version active.
--
-- This migration drops EVERY known overload and recreates the function once.

-- Drop every known overload (order: most params → fewest)
DROP FUNCTION IF EXISTS create_pickup_request(text,uuid,text,integer,text,text,double precision,double precision,integer,text,uuid);
DROP FUNCTION IF EXISTS create_pickup_request(text,uuid,text,integer,text,text,double precision,double precision,integer,text);
DROP FUNCTION IF EXISTS create_pickup_request(text,uuid,text,integer,text,text,double precision,double precision,integer);
DROP FUNCTION IF EXISTS create_pickup_request(text,uuid,text,integer,text,text,float8,float8,integer,text,uuid);
DROP FUNCTION IF EXISTS create_pickup_request(text,uuid,text,integer,text,text,float8,float8,integer,text);
DROP FUNCTION IF EXISTS create_pickup_request(text,uuid,text,integer,text,text,float8,float8,integer);
DROP FUNCTION IF EXISTS create_pickup_request(text,uuid,text,int4,text,text,float8,float8,int4,text,uuid);
DROP FUNCTION IF EXISTS create_pickup_request(text,uuid,text,int4,text,text,float8,float8,int4,text);
DROP FUNCTION IF EXISTS create_pickup_request(text,uuid,text,int4,text,text,float8,float8,int4);

CREATE FUNCTION create_pickup_request(
  p_id                   TEXT,
  p_user_id              UUID,
  p_status               TEXT,
  p_bag_count            INTEGER,
  p_waste_type           TEXT,
  p_special_instructions TEXT,
  p_longitude            FLOAT,
  p_latitude             FLOAT,
  p_fee                  INTEGER DEFAULT 0,
  p_address              TEXT    DEFAULT NULL,
  p_bag_id               UUID    DEFAULT NULL
)
RETURNS TABLE (
  id                     TEXT,
  user_id                UUID,
  status                 TEXT,
  waste_type             TEXT,
  special_instructions   TEXT,
  location               TEXT,
  coordinates            GEOGRAPHY,
  fee                    INTEGER,
  estimated_volume       NUMERIC,
  address                TEXT,
  created_at             TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_location    TEXT;
  v_coordinates GEOGRAPHY;
  v_fee         INTEGER;
  v_unit_price  NUMERIC;
  v_id          TEXT;
  v_user_id     UUID;
  v_status      TEXT;
  v_waste_type  TEXT;
  v_special_instructions TEXT;
  v_location_out TEXT;
  v_coordinates_out GEOGRAPHY;
  v_fee_out     INTEGER;
  v_estimated_volume NUMERIC;
  v_address_out TEXT;
  v_created_at  TIMESTAMPTZ;
BEGIN
  v_location    := 'POINT(' || p_longitude || ' ' || p_latitude || ')';
  v_coordinates := ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::geography;

  -- Fee resolution: bags.unit_price > caller p_fee > 0
  v_fee := p_fee;
  IF p_bag_id IS NOT NULL THEN
    SELECT b.unit_price INTO v_unit_price
    FROM   bags b
    WHERE  b.id = p_bag_id;

    IF v_unit_price IS NOT NULL AND v_unit_price > 0 THEN
      v_fee := v_unit_price::INTEGER;
    END IF;
  END IF;

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
    p_bag_id,
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
    pickup_requests.created_at
  INTO
    v_id, v_user_id, v_status, v_waste_type, v_special_instructions,
    v_location_out, v_coordinates_out, v_fee_out, v_estimated_volume,
    v_address_out, v_created_at;

  -- Return using local variables — no column name ambiguity
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
  created_at           := v_created_at;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION create_pickup_request TO authenticated;

COMMENT ON FUNCTION create_pickup_request IS
'Creates a pickup request. Uses INSERT...RETURNING INTO local vars then RETURN NEXT to avoid column name ambiguity. Fee resolved from bags.unit_price via p_bag_id, falling back to p_fee.';
