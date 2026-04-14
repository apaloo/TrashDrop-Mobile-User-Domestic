-- Migration 22: Add batch_id to pickup_requests + FIFO fee resolution
--
-- Problem: The previous create_pickup_request RPC randomly picked ONE bag from
-- the user's inventory to resolve the fee and pre-assign bag_id.  This caused
-- two issues:
--   1. Random bag selection → non-deterministic fee when user has multiple
--      batches with different unit prices.
--   2. Pre-assigned bag_id does not match the physical bag the user actually
--      fills with trash → collector arrives, scans a different bag, and the
--      system rejects it.
--
-- Fix:
--   1. Add batch_id (UUID) to pickup_requests to record which batch's pricing
--      was used — audit trail for fee decisions.
--   2. Rewrite create_pickup_request:
--      - Remove p_fee and p_bag_id parameters (both resolved server-side).
--      - Fee resolved via FIFO: oldest active batch's unit_price is used.
--        Oldest = first batch the user received; FIFO mirrors natural bag usage.
--      - bag_id is stored as NULL; the collector assigns it at scan time by
--        validating bag.user_id == pickup_request.user_id.
--      - Server-side validation: raises if user has fewer active bags than requested.
--
-- Caller changes (PickupRequest.js):
--   - Client-side bag fetch block removed.
--   - RPC call drops p_fee and p_bag_id parameters.
--   - All other callers are unaffected (pickupService.createPickupRequest
--     uses a direct INSERT path and is unchanged).

-- ── Step 1: Add batch_id column ─────────────────────────────────────────────
ALTER TABLE pickup_requests
  ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES batches(id);

-- ── Step 2: Drop ALL known create_pickup_request overloads ──────────────────
-- 11-param (migration 21 — current live version)
DROP FUNCTION IF EXISTS create_pickup_request(text,uuid,text,integer,text,text,double precision,double precision,integer,text,uuid);
DROP FUNCTION IF EXISTS create_pickup_request(text,uuid,text,integer,text,text,float8,float8,integer,text,uuid);
DROP FUNCTION IF EXISTS create_pickup_request(text,uuid,text,int4,text,text,float8,float8,int4,text,uuid);
-- 10-param (migration 19)
DROP FUNCTION IF EXISTS create_pickup_request(text,uuid,text,integer,text,text,double precision,double precision,integer,text);
DROP FUNCTION IF EXISTS create_pickup_request(text,uuid,text,integer,text,text,float8,float8,integer,text);
DROP FUNCTION IF EXISTS create_pickup_request(text,uuid,text,int4,text,text,float8,float8,int4,text);
-- 9-param (original)
DROP FUNCTION IF EXISTS create_pickup_request(text,uuid,text,integer,text,text,double precision,double precision,integer);
DROP FUNCTION IF EXISTS create_pickup_request(text,uuid,text,integer,text,text,float8,float8,integer);
DROP FUNCTION IF EXISTS create_pickup_request(text,uuid,text,int4,text,text,float8,float8,int4);
-- 9-param new signature (idempotency: drop before re-create)
DROP FUNCTION IF EXISTS create_pickup_request(text,uuid,text,integer,text,text,double precision,double precision,text);
DROP FUNCTION IF EXISTS create_pickup_request(text,uuid,text,int4,text,text,float8,float8,text);

-- ── Step 3: Create new function ──────────────────────────────────────────────
CREATE FUNCTION create_pickup_request(
  p_id                   TEXT,
  p_user_id              UUID,
  p_status               TEXT,
  p_bag_count            INTEGER,
  p_waste_type           TEXT,
  p_special_instructions TEXT,
  p_longitude            FLOAT,
  p_latitude             FLOAT,
  p_address              TEXT DEFAULT NULL
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
  batch_id               UUID,
  created_at             TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
$$;

GRANT EXECUTE ON FUNCTION create_pickup_request TO authenticated;

COMMENT ON FUNCTION create_pickup_request IS
'Creates a pickup request.
Fee: resolved via FIFO from oldest active batch (bags JOIN batches ORDER BY batches.created_at ASC).
batch_id: stored for fee audit trail.
bag_id: NULL — linked at collection time when collector scans the physical bag.
Validation: raises exception if user has fewer active bags than p_bag_count.
p_fee and p_bag_id removed from signature; fee is fully server-side.';
