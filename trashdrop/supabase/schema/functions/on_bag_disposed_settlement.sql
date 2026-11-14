-- Function public.on_bag_disposed_settlement
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- on_bag_disposed_settlement(): execute: anon, authenticated, service_role
CREATE OR REPLACE FUNCTION public.on_bag_disposed_settlement()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  collector_pct numeric := 0.85;
BEGIN

  IF NEW.status = 'disposed' AND OLD.status IS DISTINCT FROM 'disposed' THEN

    -- SOP §5.1: distance-based payout using bag.deadhead_km
    IF NEW.deadhead_km IS NULL THEN
      RAISE EXCEPTION 'deadhead_km must be set before disposal';
    END IF;

    IF NEW.deadhead_km <= 5 THEN
      collector_pct := 0.85;
    ELSE
      collector_pct := 0.85 + ((LEAST(NEW.deadhead_km,10) - 5) / 5) * (0.92 - 0.85);
    END IF;

    -- Clamp safety
    collector_pct := LEAST(GREATEST(collector_pct, 0.85), 0.92);

    -- Base earnings
    NEW.collector_base_earnings = NEW.unit_price * collector_pct;

    -- Platform base
    NEW.platform_total_earnings = NEW.unit_price - NEW.collector_base_earnings;

    -- Recyclables (ONLY shared component)
    IF NEW.is_recyclable = true AND NEW.recycler_gross IS NOT NULL THEN
      NEW.recycler_collector_share = NEW.recycler_gross * 0.60;
      NEW.recycler_user_share = NEW.recycler_gross * 0.25;
      NEW.recycler_platform_share = NEW.recycler_gross * 0.15;
    ELSE
      NEW.recycler_collector_share = 0;
      NEW.recycler_user_share = 0;
      NEW.recycler_platform_share = 0;
    END IF;

    -- Final totals
    NEW.collector_total_earnings =
      COALESCE(NEW.collector_base_earnings,0)
      + COALESCE(NEW.recycler_collector_share,0);

    NEW.user_total_earnings =
      COALESCE(NEW.recycler_user_share,0);

    NEW.platform_total_earnings =
      COALESCE(NEW.platform_total_earnings,0)
      + COALESCE(NEW.recycler_platform_share,0);

    -- Move funds: pending → withdrawable
    UPDATE collector_profiles
    SET 
      pending_balance = pending_balance - NEW.unit_price,
      withdrawable_balance = withdrawable_balance + NEW.collector_total_earnings
    WHERE id = NEW.collector_id;

    NEW.collector_unlocked_at = now();

  END IF;

  RETURN NEW;
END;
$function$;
