-- Table public.disposal_centers
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

create table public.disposal_centers (
  id text not null,
  name text not null,
  coordinates geography(Point,4326) not null,
  address text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  waste_type text,
  latitude geometry,
  longitude geometry,
  center_type text,
  region character varying(100),
  district character varying(150),
  operating_hours character varying(100),
  phone character varying(100),
  rating numeric(2,1) default 4.0,
  capacity_notes text,
  status character varying(50) default 'active'::character varying
);
alter table public.disposal_centers add constraint disposal_centers_pkey PRIMARY KEY (id);
CREATE UNIQUE INDEX disposal_centers_unique_name_address ON public.disposal_centers USING btree (lower(btrim(name)), lower(btrim(COALESCE(address, ''::text))));
CREATE INDEX idx_disposal_centers_center_type ON public.disposal_centers USING btree (center_type);
CREATE INDEX idx_disposal_centers_coordinates ON public.disposal_centers USING gist (coordinates);
CREATE INDEX idx_disposal_centers_region ON public.disposal_centers USING btree (region);
CREATE INDEX idx_disposal_centers_status ON public.disposal_centers USING btree (status);
CREATE INDEX idx_disposal_centers_waste_type ON public.disposal_centers USING btree (waste_type);

-- Row level security: on
-- anon: DELETE,INSERT,SELECT,UPDATE
-- authenticated: DELETE,INSERT,SELECT,UPDATE
-- service_role: DELETE,INSERT,SELECT,UPDATE

-- Policies
create policy "Anyone can view disposal centers" on public.disposal_centers as permissive for select to authenticated
  using (true);

-- Triggers (run in name order)
CREATE TRIGGER update_disposal_centers_timestamp BEFORE UPDATE ON public.disposal_centers FOR EACH ROW EXECUTE FUNCTION update_disposal_center_timestamp();
CREATE TRIGGER update_disposal_centers_updated_at BEFORE UPDATE ON public.disposal_centers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
