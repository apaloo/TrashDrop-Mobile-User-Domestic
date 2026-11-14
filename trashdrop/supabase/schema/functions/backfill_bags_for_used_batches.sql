-- Function public.backfill_bags_for_used_batches
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- backfill_bags_for_used_batches(): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.backfill_bags_for_used_batches()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
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
$function$;
