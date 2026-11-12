-- TD10, last step: admins come only from the staff_admins table (managed on
-- the admin site's Account approvals page, every change logged). The
-- hard-coded email list td_admin_emails() is retired. Both addresses on that
-- list were copied into staff_admins on 2026-11-12 (20261112133434), so the
-- existing admins keep their access; admins added on the page since then now
-- also get alert notifications, are recorded as "admin" in the activity log,
-- and appear in the staff list.

create or replace function public.td_is_staff()
returns boolean language sql stable security definer
set search_path to 'public', 'extensions', 'pg_temp' as $$
  select auth.uid() is not null
     and exists (select 1 from public.staff_admins s where s.user_id = auth.uid())
$$;

create or replace function public.td_staff_users()
returns table(id uuid, email text, name text) language plpgsql stable security definer
set search_path to 'public', 'auth' as $$
begin
  if not public.td_is_staff() then return; end if;
  return query
    select u.id, u.email::text,
           coalesce(nullif(btrim(concat_ws(' ', u.raw_user_meta_data ->> 'firstName', u.raw_user_meta_data ->> 'lastName')), ''),
                    u.raw_user_meta_data ->> 'full_name', split_part(u.email, '@', 1))::text
      from auth.users u
      join public.staff_admins s on s.user_id = u.id
     order by 3;
end $$;

create or replace function public.td_audit_actor()
returns table(actor_id uuid, actor_name text, actor_role text) language plpgsql stable security definer
set search_path to 'public', 'auth' as $$
declare
  rule text := nullif(current_setting('app.alert_actor', true), '');
  uid uuid;
begin
  if rule is not null then
    return query select null::uuid, rule, 'rule'::text; return;
  end if;
  begin uid := auth.uid(); exception when others then uid := null; end;
  if uid is null then
    return query select null::uuid, 'System'::text, 'system'::text; return;
  end if;
  return query
    select uid,
           coalesce(nullif(btrim(concat_ws(' ', u.raw_user_meta_data ->> 'firstName', u.raw_user_meta_data ->> 'lastName')), ''),
                    u.raw_user_meta_data ->> 'full_name', u.email, uid::text)::text,
           (case when exists (select 1 from public.staff_admins s where s.user_id = uid) then 'admin'
                 when exists (select 1 from public.collector_profiles c where c.user_id = uid) then 'collector'
                 else 'customer' end)::text
      from auth.users u where u.id = uid;
  if not found then
    return query select uid, uid::text, 'customer'::text;
  end if;
end $$;

create or replace function public.td_alert_notify()
returns trigger language plpgsql security definer
set search_path to 'public', 'auth' as $$
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
end $$;

drop function public.td_admin_emails();
