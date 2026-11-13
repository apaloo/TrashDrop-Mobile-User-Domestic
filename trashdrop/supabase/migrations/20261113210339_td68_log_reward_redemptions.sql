-- TD68 (owner's decision 2026-11-13: "log it"): reward redemptions appear in
-- the household's activity list.
--
-- The Rewards page used to insert the activity row itself, with columns
-- user_activity doesn't have (status, points, details), so every insert was
-- refused and nothing was logged (7 redemptions, no activity rows). The
-- server now writes it, in the same transaction as the redemption, so the
-- figures are the server's. The activity list is display only: the balance
-- comes from user_stats_dashboard, which doesn't read user_activity.
--
-- Protected points rules (docs/POINTS.md): no rule changes. Redemptions still
-- go only through td_redeem_reward, which checks cost and balance as before.

-- 1. td_redeem_reward: unchanged except the activity row after the redemption
create or replace function public.td_redeem_reward(p_reward_id uuid, p_phone text default null::text, p_network text default null::text)
 returns json
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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

-- 2. admin_set_redemption_status: a rejected redemption gives its points back
-- (docs/POINTS.md), so the activity list shows them returned
create or replace function public.admin_set_redemption_status(p_id text, p_status text, p_note text default null::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
DECLARE
  done jsonb;
BEGIN
  IF NOT public.can_do('rewards.manage') THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_status NOT IN ('sent', 'rejected') THEN
    RAISE EXCEPTION 'Status must be sent or rejected';
  END IF;
  IF p_status = 'rejected' AND nullif(btrim(coalesce(p_note, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Give a reason for rejecting it';
  END IF;
  -- Pending only, so two staff can't both send the same one
  UPDATE public.rewards_redemption rr
     SET status = p_status,
         sent_at = CASE WHEN p_status = 'sent' THEN now() ELSE rr.sent_at END,
         handled_by = auth.uid(),
         staff_note = nullif(btrim(coalesce(p_note, '')), '')
   WHERE rr.id::text = p_id AND coalesce(rr.status, 'pending') = 'pending'
  RETURNING jsonb_build_object('id', rr.id::text, 'status', rr.status, 'points_spent', rr.points_spent,
                               'phone_number', rr.phone_number, 'network', rr.network, 'user_id', rr.user_id)
    INTO done;
  IF done IS NULL THEN
    RAISE EXCEPTION 'This redemption was already handled, or no longer exists';
  END IF;
  -- Shown in the household's activity list (TD68); display only
  IF p_status = 'rejected' THEN
    INSERT INTO public.user_activity (user_id, activity_type, description, related_id, points_impact)
    SELECT rr.user_id, 'reward_redemption', 'Points returned: ' || coalesce(r.name, 'reward') || ' was not sent',
           rr.id, rr.points_spent
      FROM public.rewards_redemption rr
      LEFT JOIN public.rewards r ON r.id = rr.reward_id
     WHERE rr.id::text = p_id;
  END IF;
  PERFORM public.td_write_log('info', 'admin',
    CASE WHEN p_status = 'sent' THEN 'reward.sent' ELSE 'reward.rejected' END,
    'reward_redemption', p_id,
    CASE WHEN p_status = 'sent'
         THEN format('Reward sent to %s (%s)', done ->> 'phone_number', done ->> 'network')
         ELSE format('Reward rejected, %s points returned: %s', done ->> 'points_spent', btrim(p_note)) END,
    jsonb_build_object('status', 'pending'), done);
  RETURN done;
END $function$;

-- 3. The redemptions made before this (none was logged), dated when they were
-- made; run again it adds nothing
insert into public.user_activity (user_id, activity_type, description, related_id, points_impact, created_at)
select rr.user_id, 'reward_redemption', 'Redeemed ' || coalesce(r.name, 'a reward'), rr.id, -rr.points_spent, rr.created_at
  from public.rewards_redemption rr
  left join public.rewards r on r.id = rr.reward_id
 where not exists (select 1 from public.user_activity ua
                    where ua.related_id = rr.id and ua.activity_type = 'reward_redemption' and ua.points_impact < 0);

insert into public.user_activity (user_id, activity_type, description, related_id, points_impact, created_at)
select rr.user_id, 'reward_redemption', 'Points returned: ' || coalesce(r.name, 'reward') || ' was not sent', rr.id, rr.points_spent,
       coalesce(rr.updated_at, rr.created_at)
  from public.rewards_redemption rr
  left join public.rewards r on r.id = rr.reward_id
 where rr.status = 'rejected'
   and not exists (select 1 from public.user_activity ua
                    where ua.related_id = rr.id and ua.activity_type = 'reward_redemption' and ua.points_impact > 0);
