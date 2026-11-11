-- Batch activation: signed-in callers, for their own account only.
--
-- activate_batch_for_user(p_batch_id, p_user_id) marks a printed batch as
-- used and gives its bags to p_user_id. The household app calls it after a
-- QR scan with the signed-in user's own id (batchService.activateBatchForUser).
-- From now on:
--   * the caller must be signed in, and p_user_id must be the caller
--     (service_role, used by server code, is exempt)
--   * signed-out callers (anon) can no longer execute it
--   * search_path is fixed, as for every SECURITY DEFINER function
-- Everything else (atomic claim of an active batch, bag rows, user_stats)
-- is unchanged.

CREATE OR REPLACE FUNCTION public.activate_batch_for_user(p_batch_id uuid, p_user_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
DECLARE
  v_batch        record;
  v_bags_created integer := 0;
  v_bag_id       uuid;
  i              integer;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role'
     AND (auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid()) THEN
    RETURN json_build_object(
      'error',   true,
      'message', 'Sign in to activate a batch for your own account',
      'code',    'NOT_ALLOWED'
    );
  END IF;

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
        v_batch.unit_price,
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
$function$;

REVOKE ALL ON FUNCTION public.activate_batch_for_user(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activate_batch_for_user(uuid, uuid) TO authenticated, service_role;
