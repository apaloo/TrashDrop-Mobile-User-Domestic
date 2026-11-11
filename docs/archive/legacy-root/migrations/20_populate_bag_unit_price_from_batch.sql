-- Migration: Populate bags.unit_price from batches.unit_price
--
-- Fixes three places where bags are created/backfilled without carrying
-- unit_price from their parent batch:
--   1. activate_batch_for_user       — live bag creation on batch activation
--   2. backfill_bags_for_used_batches  — backfill for 'used' batches
--   3. backfill_bags_for_active_batches — backfill for 'active' batches
--
-- Also runs an immediate UPDATE to fix any existing bags that already have
-- a batch_id but a NULL unit_price.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Fix activate_batch_for_user
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.activate_batch_for_user(uuid, uuid);

CREATE OR REPLACE FUNCTION public.activate_batch_for_user(
  p_batch_id uuid,
  p_user_id  uuid
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_batch        record;
  v_bags_created integer := 0;
  v_bag_id       uuid;
  i              integer;
BEGIN
  -- Lock and update the batch to 'used' atomically
  UPDATE batches
  SET    status     = 'used',
         created_by = p_user_id,
         updated_at = now()
  WHERE  id     = p_batch_id
    AND  status = 'active'
  RETURNING * INTO v_batch;

  IF NOT FOUND THEN
    SELECT * INTO v_batch FROM batches WHERE id = p_batch_id;
    IF NOT FOUND THEN
      RETURN json_build_object(
        'error',   true,
        'message', 'Batch not found',
        'code',    'BATCH_NOT_FOUND'
      );
    ELSE
      RETURN json_build_object(
        'error',          true,
        'message',        'Batch is not active',
        'code',           'BATCH_NOT_ACTIVE',
        'current_status', v_batch.status
      );
    END IF;
  END IF;

  -- Create individual bag records, carrying unit_price from the batch
  BEGIN
    FOR i IN 1..COALESCE(v_batch.bag_count, 0) LOOP
      INSERT INTO bags (
        batch_id,
        user_id,
        qr_code,
        status,
        unit_price,
        created_at,
        updated_at
      ) VALUES (
        p_batch_id,
        p_user_id,
        'BAG-' || p_batch_id::text || '-' || i || '-' || floor(random() * 1000000)::int,
        'active',
        v_batch.unit_price,   -- ← looked up from batches
        NOW(),
        NOW()
      )
      ON CONFLICT DO NOTHING
      RETURNING id INTO v_bag_id;

      IF v_bag_id IS NOT NULL THEN
        v_bags_created := v_bags_created + 1;
      END IF;
    END LOOP;

    RAISE NOTICE 'Created % bags (unit_price=%) for batch % / user %',
      v_bags_created, v_batch.unit_price, p_batch_id, p_user_id;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Failed to create bags for user %: %', p_user_id, SQLERRM;
    v_bags_created := 0;
  END;

  -- Recalculate user stats
  BEGIN
    INSERT INTO user_stats (user_id, total_batches, total_bags, created_at)
    SELECT
      p_user_id,
      COUNT(*),
      SUM(COALESCE(bag_count, 0)),
      now()
    FROM batches
    WHERE created_by = p_user_id
      AND status     = 'used'
    ON CONFLICT (user_id) DO UPDATE
    SET total_batches = EXCLUDED.total_batches,
        total_bags    = EXCLUDED.total_bags,
        updated_at    = now();
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Failed to update user_stats for user %: %', p_user_id, SQLERRM;
  END;

  RETURN json_build_object(
    'error',        false,
    'activated',    true,
    'batch_id',     v_batch.id,
    'batch_number', v_batch.batch_number,
    'bag_count',    v_batch.bag_count,
    'bags_created', v_bags_created,
    'unit_price',   v_batch.unit_price,
    'status',       'used',
    'activated_at', v_batch.updated_at,
    'created_at',   v_batch.created_at,
    'created_by',   v_batch.created_by
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.activate_batch_for_user(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.activate_batch_for_user IS
'Activates a batch for a user, creates individual bag records (with unit_price
copied from batches.unit_price), and updates user stats.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Fix backfill_bags_for_used_batches
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.backfill_bags_for_used_batches()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_batch        record;
  v_bags_created integer := 0;
  v_total_batches integer := 0;
  v_bag_id       uuid;
  i              integer;
BEGIN
  FOR v_batch IN
    SELECT b.id, b.created_by, b.bag_count, b.unit_price
    FROM   batches b
    WHERE  b.status     = 'used'
      AND  b.created_by IS NOT NULL
      AND  NOT EXISTS (SELECT 1 FROM bags WHERE batch_id = b.id)
  LOOP
    v_total_batches := v_total_batches + 1;

    FOR i IN 1..COALESCE(v_batch.bag_count, 0) LOOP
      INSERT INTO bags (
        batch_id,
        user_id,
        qr_code,
        status,
        unit_price,
        created_at,
        updated_at
      ) VALUES (
        v_batch.id,
        v_batch.created_by,
        'BAG-' || v_batch.id::text || '-' || i || '-' || floor(random() * 1000000)::int,
        'active',
        v_batch.unit_price,   -- ← looked up from batches
        NOW(),
        NOW()
      )
      ON CONFLICT DO NOTHING
      RETURNING id INTO v_bag_id;

      IF v_bag_id IS NOT NULL THEN
        v_bags_created := v_bags_created + 1;
      END IF;
    END LOOP;
  END LOOP;

  RETURN json_build_object(
    'success',           true,
    'batches_processed', v_total_batches,
    'bags_created',      v_bags_created,
    'message',           format('Processed %s batches, created %s bag records', v_total_batches, v_bags_created)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.backfill_bags_for_used_batches() TO authenticated;

COMMENT ON FUNCTION public.backfill_bags_for_used_batches IS
'Backfills bag records (with unit_price from batches) for all used batches that have no bags.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Fix backfill_bags_for_active_batches
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.backfill_bags_for_active_batches()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_batch         record;
  v_bags_created  integer := 0;
  v_total_batches integer := 0;
  v_bag_id        uuid;
  i               integer;
BEGIN
  FOR v_batch IN
    SELECT b.id, b.created_by, b.bag_count, b.unit_price
    FROM   batches b
    WHERE  b.status     = 'active'
      AND  b.created_by IS NOT NULL
      AND  NOT EXISTS (SELECT 1 FROM bags WHERE batch_id = b.id)
  LOOP
    v_total_batches := v_total_batches + 1;

    FOR i IN 1..COALESCE(v_batch.bag_count, 0) LOOP
      INSERT INTO bags (
        batch_id,
        user_id,
        qr_code,
        status,
        unit_price,
        created_at,
        updated_at
      ) VALUES (
        v_batch.id,
        v_batch.created_by,
        'BAG-' || v_batch.id::text || '-' || i || '-' || floor(random() * 1000000)::int,
        'active',
        v_batch.unit_price,   -- ← looked up from batches
        NOW(),
        NOW()
      )
      ON CONFLICT DO NOTHING
      RETURNING id INTO v_bag_id;

      IF v_bag_id IS NOT NULL THEN
        v_bags_created := v_bags_created + 1;
      END IF;
    END LOOP;
  END LOOP;

  RETURN json_build_object(
    'success',           true,
    'batches_processed', v_total_batches,
    'bags_created',      v_bags_created,
    'message',           format('Processed %s active batches, created %s bag records', v_total_batches, v_bags_created)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.backfill_bags_for_active_batches() TO authenticated;

COMMENT ON FUNCTION public.backfill_bags_for_active_batches IS
'Creates bag records (with unit_price from batches) for active batches that have created_by set but no bags yet.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Immediate backfill: sync unit_price for existing bags that are NULL
--    but whose batch has a non-NULL unit_price
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE bags b
SET    unit_price = bt.unit_price,
       updated_at = now()
FROM   batches bt
WHERE  b.batch_id         = bt.id
  AND  b.unit_price       IS NULL
  AND  bt.unit_price      IS NOT NULL
  AND  bt.unit_price      > 0;

-- Report how many rows were updated
DO $$
DECLARE
  v_count integer;
BEGIN
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'Backfilled unit_price for % existing bags from their batch', v_count;
END;
$$;
