-- Function public.td_audit_actor
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_audit_actor(): execute: anon, authenticated, service_role
CREATE OR REPLACE FUNCTION public.td_audit_actor()
 RETURNS TABLE(actor_id uuid, actor_name text, actor_role text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
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
end $function$;
