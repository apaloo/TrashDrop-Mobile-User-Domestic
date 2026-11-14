-- Table public.alert_activity
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

create table public.alert_activity (
  id bigint not null default nextval('alert_activity_id_seq'::regclass),
  alert_id uuid not null,
  kind text not null,
  from_value text,
  to_value text,
  note text,
  data jsonb not null default '{}'::jsonb,
  actor_id uuid,
  actor_name text,
  created_at timestamp with time zone not null default now()
);
alter table public.alert_activity add constraint alert_activity_alert_id_fkey FOREIGN KEY (alert_id) REFERENCES alerts(id) ON DELETE CASCADE;
alter table public.alert_activity add constraint alert_activity_kind_check CHECK ((kind = ANY (ARRAY['created'::text, 'status'::text, 'assigned'::text, 'escalated'::text, 'comment'::text, 'action'::text])));
alter table public.alert_activity add constraint alert_activity_pkey PRIMARY KEY (id);
CREATE INDEX alert_activity_alert_idx ON public.alert_activity USING btree (alert_id, created_at);

-- Row level security: on
-- anon: DELETE,INSERT,SELECT,UPDATE
-- authenticated: DELETE,INSERT,SELECT,UPDATE
-- service_role: DELETE,INSERT,SELECT,UPDATE

-- Policies
create policy "alert_activity: admins add" on public.alert_activity as permissive for insert to authenticated
  with check ((td_is_staff() AND (kind = ANY (ARRAY['comment'::text, 'action'::text]))));
create policy "alert_activity: admins read" on public.alert_activity as permissive for select to authenticated
  using (td_is_staff());

-- Triggers (run in name order)
CREATE TRIGGER td_alert_activity_to_logs BEFORE INSERT ON public.alert_activity FOR EACH ROW EXECUTE FUNCTION td_alert_activity_to_logs();
