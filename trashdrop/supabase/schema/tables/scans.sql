-- Table public.scans
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

create table public.scans (
  id uuid not null default gen_random_uuid(),
  bag_id uuid,
  collector_id uuid,
  location geometry(Point,4326),
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  batch_id uuid,
  scanned_by uuid,
  scanned_at timestamp with time zone default now(),
  status text
);
alter table public.scans add constraint scans_bag_id_fkey FOREIGN KEY (bag_id) REFERENCES bags(id) ON DELETE CASCADE;
alter table public.scans add constraint scans_collector_id_fkey FOREIGN KEY (collector_id) REFERENCES collector_profiles(id) ON DELETE SET NULL;
alter table public.scans add constraint scans_pkey PRIMARY KEY (id);
CREATE INDEX scans_bag_idx ON public.scans USING btree (bag_id);
CREATE INDEX scans_batch_idx ON public.scans USING btree (batch_id, scanned_at DESC);

-- Row level security: on
-- anon: DELETE,INSERT,SELECT,UPDATE
-- authenticated: DELETE,INSERT,SELECT,UPDATE
-- service_role: DELETE,INSERT,SELECT,UPDATE

-- Policies
create policy "Enable read access for authenticated users" on public.scans as permissive for select to authenticated
  using (true);
create policy "scans_staff_insert" on public.scans as permissive for insert to authenticated
  with check (td_is_staff());
create policy "scans_staff_update" on public.scans as permissive for update to authenticated
  using (td_is_staff())
  with check (td_is_staff());

-- Triggers (run in name order)
CREATE TRIGGER update_scans_updated_at BEFORE UPDATE ON public.scans FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
