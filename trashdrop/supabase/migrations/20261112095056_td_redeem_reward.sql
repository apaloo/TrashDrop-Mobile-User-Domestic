-- Applied on production 2026-11-12 (owner's approval). Redeeming a reward on the
-- server: the cost comes from rewards, the balance from user_stats_dashboard
-- (earned minus redemptions not rejected), one redemption at a time per user.
-- The household Rewards page calls it; direct inserts into rewards_redemption
-- are closed in a later migration, once this app version is live.
create or replace function public.td_redeem_reward(p_reward_id uuid, p_phone text default null, p_network text default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
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
  -- One redemption at a time per user, so two at once can't both pass the check
  perform pg_advisory_xact_lock(hashtext('td_redeem_reward:' || v_uid::text));
  -- The same balance the dashboard shows: earned minus redemptions not rejected
  select coalesce(total_points, 0) into v_balance from public.user_stats_dashboard where user_id = v_uid;
  if coalesce(v_balance, 0) < v_cost then
    raise exception 'Not enough points for this reward' using errcode = 'P0001';
  end if;
  insert into public.rewards_redemption (user_id, reward_id, points_spent, status, phone_number, network)
  values (v_uid, p_reward_id, v_cost, 'pending', nullif(btrim(coalesce(p_phone, '')), ''), nullif(upper(btrim(coalesce(p_network, ''))), ''))
  returning id into v_id;
  return json_build_object('id', v_id, 'reward', v_name, 'points_spent', v_cost, 'balance_after', v_balance - v_cost);
end $$;

revoke execute on function public.td_redeem_reward(uuid, text, text) from public, anon;
grant execute on function public.td_redeem_reward(uuid, text, text) to authenticated, service_role;
