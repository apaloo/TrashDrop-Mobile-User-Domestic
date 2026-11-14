-- Table public.alerts
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

create table public.alerts (
  id uuid not null default gen_random_uuid(),
  title text not null,
  description text,
  type text default 'info'::text,
  severity text default 'medium'::text,
  entity_type text,
  entity_id uuid,
  created_by uuid,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  creator uuid,
  status text not null default 'open'::text,
  rule_key text,
  entity_source text,
  entity_ref text,
  assigned_to uuid,
  metadata jsonb not null default '{}'::jsonb,
  location_lat double precision,
  location_lng double precision,
  location_address text,
  acknowledged_at timestamp with time zone,
  resolved_at timestamp with time zone,
  closed_at timestamp with time zone,
  resolution_note text,
  resolved_by uuid,
  auto_resolved boolean not null default false,
  last_seen_at timestamp with time zone
);
alter table public.alerts add constraint alerts_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.alerts add constraint alerts_created_by_profiles_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.alerts add constraint alerts_creator_fkey FOREIGN KEY (creator) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.alerts add constraint alerts_pkey PRIMARY KEY (id);
CREATE UNIQUE INDEX alerts_one_open_per_rule ON public.alerts USING btree (rule_key, entity_ref) WHERE ((rule_key IS NOT NULL) AND (status = ANY (ARRAY['open'::text, 'acknowledged'::text, 'in_progress'::text])));
CREATE INDEX alerts_status_idx ON public.alerts USING btree (status, severity, created_at DESC);

-- Row level security: on
-- anon: DELETE,INSERT,SELECT,UPDATE
-- authenticated: DELETE,INSERT,SELECT,UPDATE
-- service_role: DELETE,INSERT,SELECT,UPDATE

-- Policies
create policy "alerts: admins create" on public.alerts as permissive for insert to authenticated
  with check (td_is_staff());
create policy "alerts: admins read" on public.alerts as permissive for select to authenticated
  using (td_is_staff());
create policy "alerts: admins update" on public.alerts as permissive for update to authenticated
  using (td_is_staff())
  with check (td_is_staff());

-- Triggers (run in name order)
CREATE TRIGGER td_alert_normalise BEFORE INSERT OR UPDATE ON public.alerts FOR EACH ROW EXECUTE FUNCTION td_alert_normalise();
CREATE TRIGGER td_alert_notify AFTER INSERT OR UPDATE OF severity, assigned_to ON public.alerts FOR EACH ROW EXECUTE FUNCTION td_alert_notify();
CREATE TRIGGER td_alert_track AFTER INSERT OR UPDATE ON public.alerts FOR EACH ROW EXECUTE FUNCTION td_alert_track();
CREATE TRIGGER update_alerts_updated_at BEFORE UPDATE ON public.alerts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
