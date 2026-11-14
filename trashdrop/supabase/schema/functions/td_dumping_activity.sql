-- Function public.td_dumping_activity
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_dumping_activity(): execute: service_role
CREATE OR REPLACE FUNCTION public.td_dumping_activity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  actor uuid := auth.uid();
  n jsonb := to_jsonb(NEW);
  o jsonb;
  v_id text := NEW.id::text;
  reg text := n ->> 'region';
  dist text := n ->> 'district';
  s_old text;
  s_new text := lower(btrim(coalesce(n ->> 'status', 'pending')));
  new_team uuid;
  old_team uuid;
  team_user uuid;
  old_team_user uuid;
  v_assigned_at timestamptz;
  overdue boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.td_record_activity(nullif(n ->> 'reported_by', '')::uuid, 'report.created', v_id, reg, dist,
      NULL, '{}'::jsonb, true);
    RETURN NULL;
  END IF;

  o := to_jsonb(OLD);
  s_old := lower(btrim(coalesce(o ->> 'status', 'pending')));
  new_team := nullif(n ->> 'assigned_to', '')::uuid;
  old_team := nullif(o ->> 'assigned_to', '')::uuid;
  team_user := public.td_team_user(new_team);

  -- verified
  IF s_old = 'pending' AND s_new = 'verified' THEN
    PERFORM public.td_record_activity(actor, 'report.verified', v_id, reg, dist, NULL, '{}'::jsonb, true);
  END IF;

  -- a claim given back or run out (before the new assignment, if any)
  IF old_team IS NOT NULL AND new_team IS DISTINCT FROM old_team AND o ->> 'assigned_via' = 'claim' THEN
    old_team_user := public.td_team_user(old_team);
    v_assigned_at := (o ->> 'assigned_at')::timestamptz;
    -- Same limits as td_release_expired_claims(): 24 h to accept, 72 h to finish
    overdue := v_assigned_at IS NOT NULL AND (
      (s_old = 'verified' AND v_assigned_at < now() - interval '24 hours') OR
      (s_old = 'in_progress' AND v_assigned_at < now() - interval '72 hours'));
    PERFORM public.td_record_activity(old_team_user,
      CASE WHEN overdue THEN 'cleanup.claim_expired' ELSE 'cleanup.released' END,
      v_id, reg, dist, NULL, jsonb_build_object('team_id', old_team, 'status', s_old));
  END IF;

  -- assigned or claimed
  IF new_team IS NOT NULL AND new_team IS DISTINCT FROM old_team THEN
    IF n ->> 'assigned_via' = 'claim' THEN
      PERFORM public.td_record_activity(team_user, 'cleanup.claimed', v_id, reg, dist,
        NULL, jsonb_build_object('team_id', new_team));
    ELSE
      PERFORM public.td_record_activity(actor, 'cleanup.assigned', v_id, reg, dist,
        nullif(n ->> 'cleanup_fee', '')::numeric,
        jsonb_build_object('team_id', new_team, 'team_user', team_user));
      PERFORM public.td_record_activity(team_user, 'cleanup.received', v_id, reg, dist,
        NULL, jsonb_build_object('team_id', new_team, 'assigned_by', actor));
    END IF;
  END IF;

  -- accepted in the collector app
  IF s_old = 'verified' AND s_new = 'in_progress' THEN
    PERFORM public.td_record_activity(coalesce(team_user, actor), 'cleanup.started', v_id, reg, dist,
      NULL, jsonb_build_object('team_id', new_team));
  END IF;

  -- completed: credit the team; and whoever else marked it cleaned
  IF s_new = 'completed' AND s_old <> 'completed' THEN
    v_assigned_at := (n ->> 'assigned_at')::timestamptz;
    PERFORM public.td_record_activity(coalesce(team_user, actor), 'cleanup.completed', v_id, reg, dist,
      CASE WHEN v_assigned_at IS NOT NULL THEN round(extract(epoch FROM (now() - v_assigned_at)) / 60.0, 1) END,
      jsonb_build_object('team_id', new_team, 'marked_by', actor, 'assigned_via', n ->> 'assigned_via'), true);
    IF actor IS NOT NULL AND actor IS DISTINCT FROM team_user THEN
      PERFORM public.td_record_activity(actor, 'cleanup.marked_cleaned', v_id, reg, dist,
        NULL, jsonb_build_object('team_id', new_team), true);
    END IF;
  END IF;

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  -- Recording must never block the change itself
  RAISE WARNING 'account_activity: skipped for report %: %', v_id, SQLERRM;
  RETURN NULL;
END $function$;
