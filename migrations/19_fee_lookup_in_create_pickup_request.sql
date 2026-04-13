-- Migration 19: Look up fee from bags.unit_price inside create_pickup_request
--
-- Problem: create_pickup_request accepted p_fee from the caller and the JS
-- always passed p_fee: 0.  The bag's unit_price (already populated from
-- batches.unit_price by migration 20) was never used.
--
-- Fix: add p_bag_id parameter; inside the function look up bags.unit_price
-- and use that as the fee.  p_fee is kept as a fallback (used only when no
-- bag_id is supplied or the bag has no unit_price).
--
-- Signature change:
--   OLD: create_pickup_request(..., p_fee INTEGER DEFAULT 0, p_address TEXT DEFAULT NULL)
--   NEW: create_pickup_request(..., p_fee INTEGER DEFAULT 0, p_address TEXT DEFAULT NULL,
--                                   p_bag_id UUID DEFAULT NULL)
--
-- The JS caller already passes p_bag_id so no client change is needed.

-- Drop all known previous signatures so the CREATE OR REPLACE applies cleanly
DROP FUNCTION IF EXISTS create_pickup_request(text,uuid,text,integer,text,text,double precision,double precision,integer);
DROP FUNCTION IF EXISTS create_pickup_request(text,uuid,text,integer,text,text,double precision,double precision,integer,text);
DROP FUNCTION IF EXISTS create_pickup_request(text,uuid,text,integer,text,text,double precision,double precision,integer,text,uuid);

CREATE OR REPLACE FUNCTION create_pickup_request(
  p_id                  TEXT,
  p_user_id             UUID,
  p_status              TEXT,
  p_bag_count           INTEGER,
  p_waste_type          TEXT,
  p_special_instructions TEXT,
  p_longitude           FLOAT,
  p_latitude            FLOAT,
  p_fee                 INTEGER  DEFAULT 0,
  p_address             TEXT     DEFAULT NULL,
  p_bag_id              UUID     DEFAULT NULL
)
RETURNS TABLE (
  id                   TEXT,
  user_id              UUID,
  status               TEXT,
  waste_type           TEXT,
  special_instructions TEXT,
  location             TEXT,
  coordinates          GEOGRAPHY,
  fee                  INTEGER,
  estimated_volume     NUMERIC,
  address              TEXT,
  created_at           TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_location    TEXT;
  v_coordinates GEOGRAPHY;
  v_fee         INTEGER;
  v_unit_price  NUMERIC;
BEGIN
  -- Build WKT location string
  v_location := 'POINT(' || p_longitude || ' ' || p_latitude || ')';

  -- Build geography value
  v_coordinates := ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::geography;

  -- ── Fee resolution ──────────────────────────────────────────────────────────
  -- Priority: bags.unit_price (via p_bag_id) > caller-supplied p_fee > 0
  v_fee := p_fee;  -- start with caller value as fallback

  IF p_bag_id IS NOT NULL THEN
    SELECT unit_price INTO v_unit_price
    FROM   bags
    WHERE  id = p_bag_id;

    IF v_unit_price IS NOT NULL AND v_unit_price > 0 THEN
      v_fee := v_unit_price::INTEGER;
    END IF;
  END IF;
  -- ────────────────────────────────────────────────────────────────────────────

  RETURN QUERY
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
    pickup_requests.created_at;
END;
$$;

GRANT EXECUTE ON FUNCTION create_pickup_request TO authenticated;

COMMENT ON FUNCTION create_pickup_request IS
'Creates a pickup request. Fee is resolved from bags.unit_price (via p_bag_id)
with p_fee as fallback. Bypasses buggy WKT parsing in standardize_pickup_coordinates trigger.
Usage: SELECT * FROM create_pickup_request(id, user_id, status, bag_count, waste_type,
         instructions, longitude, latitude, fee, address, bag_id);';
