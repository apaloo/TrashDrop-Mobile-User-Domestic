-- Table public.illegal_dumping
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

create table public.illegal_dumping (
  id uuid not null default gen_random_uuid(),
  reported_by uuid,
  assigned_to uuid,
  location geometry(Point,4326),
  address text,
  description text,
  waste_type text,
  severity text default 'medium'::text,
  status text default 'Reported'::text,
  images text[],
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  estimated_volume numeric(10,2),
  latitude numeric,
  longitude numeric,
  location_address text
);
alter table public.illegal_dumping add constraint illegal_dumping_assigned_to_profiles_fkey FOREIGN KEY (assigned_to) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.illegal_dumping add constraint illegal_dumping_pkey PRIMARY KEY (id);
alter table public.illegal_dumping add constraint illegal_dumping_reported_by_profiles_fkey FOREIGN KEY (reported_by) REFERENCES profiles(id) ON DELETE SET NULL;
CREATE INDEX illegal_dumping_created_at_idx ON public.illegal_dumping USING btree (created_at);
CREATE INDEX illegal_dumping_status_idx ON public.illegal_dumping USING btree (status);

-- Row level security: on
-- anon: DELETE,INSERT,SELECT,UPDATE
-- authenticated: DELETE,INSERT,SELECT,UPDATE
-- service_role: DELETE,INSERT,SELECT,UPDATE

-- Policies
create policy "Illegal dumping reports are viewable by authenticated users" on public.illegal_dumping as permissive for select to authenticated
  using (true);
create policy "Users can create dumping reports" on public.illegal_dumping as permissive for insert to public
  with check ((reported_by = auth.uid()));
create policy "Users can view their own reports" on public.illegal_dumping as permissive for select to public
  using ((reported_by = auth.uid()));

-- Triggers (run in name order)
CREATE TRIGGER update_illegal_dumping_updated_at BEFORE UPDATE ON public.illegal_dumping FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
