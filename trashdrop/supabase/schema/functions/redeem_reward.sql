-- Function public.redeem_reward
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- redeem_reward(p_user_id uuid, p_reward_id uuid): execute: service_role
CREATE OR REPLACE FUNCTION public.redeem_reward(p_user_id uuid, p_reward_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_points_cost integer;
  v_total_points integer;
BEGIN
  -- Get reward cost
  SELECT points_cost INTO v_points_cost FROM rewards WHERE id = p_reward_id AND active = true;
  IF v_points_cost IS NULL THEN
    RAISE EXCEPTION 'Reward not found or inactive';
  END IF;

  -- Calculate user total points
  SELECT COALESCE(sum(points),0) INTO v_total_points FROM fee_points WHERE user_id = p_user_id;
  IF v_total_points < v_points_cost THEN
    RAISE EXCEPTION 'Not enough points';
  END IF;

  -- Insert redemption record
  INSERT INTO reward_redemptions (user_id, reward_id, points_used, status)
  VALUES (p_user_id, p_reward_id, v_points_cost, 'completed');

  -- Deduct points by inserting negative transaction
  INSERT INTO fee_points (id, points, user_id, request_id)
  VALUES (uuid_generate_v4(), -v_points_cost, p_user_id, NULL);
END;
$function$;
