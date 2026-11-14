-- Function public.admin_set_redemption_status
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- admin_set_redemption_status(p_id text, p_status text, p_note text): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.admin_set_redemption_status(p_id text, p_status text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
