-- Table public.service_areas
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

create table public.service_areas (
  id uuid not null default gen_random_uuid(),
  name text not null,
  description text,
  color character varying(7) default '#3B82F6'::character varying,
  coordinates jsonb,
  bounds jsonb,
  active_collectors integer default 0,
  total_collectors integer default 0,
  total_requests integer default 0,
  pending_requests integer default 0,
  completion_rate numeric(5,2) default 0.00,
  coverage_area numeric(10,2),
  population integer,
  region character varying(100),
  district character varying(100),
  is_active boolean default true,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);
alter table public.service_areas add constraint service_areas_name_key UNIQUE (name);
alter table public.service_areas add constraint service_areas_pkey PRIMARY KEY (id);
CREATE INDEX idx_service_areas_is_active ON public.service_areas USING btree (is_active);
CREATE INDEX idx_service_areas_region ON public.service_areas USING btree (region);

-- Row level security: on
-- anon: DELETE,INSERT,SELECT,UPDATE
-- authenticated: DELETE,INSERT,SELECT,UPDATE
-- service_role: DELETE,INSERT,SELECT,UPDATE

-- Policies
create policy "Enable read access for authenticated users" on public.service_areas as permissive for select to authenticated
  using (true);
create policy "service_areas_staff_insert" on public.service_areas as permissive for insert to authenticated
  with check (td_is_staff());
create policy "service_areas_staff_update" on public.service_areas as permissive for update to authenticated
  using (td_is_staff())
  with check (td_is_staff());

-- Triggers (run in name order)
CREATE TRIGGER update_service_areas_updated_at BEFORE UPDATE ON public.service_areas FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
