-- Function public.td_alert_notify
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_alert_notify(): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.td_alert_notify()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  recipients uuid[];
  label text := initcap(new.severity);
begin
  begin
    -- Assigned to someone: tell them
    if tg_op = 'UPDATE' and new.assigned_to is not null and new.assigned_to is distinct from old.assigned_to then
      insert into public.notifications (user_id, title, message, type, read)
      values (new.assigned_to, 'Alert assigned to you', format('[%s] %s', label, new.title), 'alert_assigned', false);
    end if;
    -- New (or newly escalated) High / Critical alert: assignee, or every admin
    if new.severity in ('high', 'critical') and new.status in ('open', 'acknowledged', 'in_progress')
       and (tg_op = 'INSERT' or new.severity is distinct from old.severity) then
      if new.assigned_to is not null then
        recipients := array[new.assigned_to];
      else
        select array_agg(s.user_id) into recipients from public.staff_admins s;
      end if;
      insert into public.notifications (user_id, title, message, type, read)
      select rid, format('%s alert', label), new.title, 'alert_' || new.severity, false
        from unnest(coalesce(recipients, array[]::uuid[])) rid;
    end if;
  exception when others then null; -- a notification problem never blocks the alert
  end;
  return new;
end $function$;
