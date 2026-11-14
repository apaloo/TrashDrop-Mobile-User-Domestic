-- Function public.td_redeem_reward
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_redeem_reward(p_reward_id uuid, p_phone text, p_network text): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.td_redeem_reward(p_reward_id uuid, p_phone text DEFAULT NULL::text, p_network text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_cost integer;
  v_name text;
  v_balance bigint;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Sign in to redeem a reward' using errcode = '42501';
  end if;
  select points_cost, name into v_cost, v_name from public.rewards where id = p_reward_id and active;
  if v_cost is null or v_cost <= 0 then
    raise exception 'This reward is not available' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtext('td_redeem_reward:' || v_uid::text));
  select coalesce(total_points, 0) into v_balance from public.user_stats_dashboard where user_id = v_uid;
  if coalesce(v_balance, 0) < v_cost then
    raise exception 'Not enough points for this reward' using errcode = 'P0001';
  end if;
  insert into public.rewards_redemption (user_id, reward_id, points_spent, status, phone_number, network)
  values (v_uid, p_reward_id, v_cost, 'pending', nullif(btrim(coalesce(p_phone, '')), ''), nullif(upper(btrim(coalesce(p_network, ''))), ''))
  returning id into v_id;
  -- Shown in the activity list (TD68); display only, not part of the balance
  insert into public.user_activity (user_id, activity_type, description, related_id, points_impact)
  values (v_uid, 'reward_redemption', 'Redeemed ' || v_name, v_id, -v_cost);
  return json_build_object('id', v_id, 'reward', v_name, 'points_spent', v_cost, 'balance_after', v_balance - v_cost);
end $function$;
