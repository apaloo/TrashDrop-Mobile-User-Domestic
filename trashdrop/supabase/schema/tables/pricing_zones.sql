-- Table public.pricing_zones
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

create table public.pricing_zones (
  id uuid not null default gen_random_uuid(),
  country character varying(100) not null default 'Ghana'::character varying,
  region character varying(100) not null,
  district character varying(100) not null,
  community character varying(100) not null,
  suburb character varying(100) not null,
  latitude numeric(10,8),
  longitude numeric(11,8),
  price_50l numeric(10,2) not null,
  price_60l numeric(10,2) not null,
  price_80l numeric(10,2) not null,
  price_90l numeric(10,2) not null,
  price_100l numeric(10,2) not null,
  price_120l numeric(10,2) not null,
  price_240l numeric(10,2) not null,
  price_260l numeric(10,2) not null,
  price_320l numeric(10,2) not null,
  price_340l numeric(10,2) not null,
  is_active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  price_360l numeric,
  price_660l numeric,
  price_1100l numeric,
  service_radius_km numeric(5,2) not null default 5
);
alter table public.pricing_zones add constraint pricing_zones_pkey PRIMARY KEY (id);
alter table public.pricing_zones add constraint pricing_zones_service_radius_km_check CHECK (((service_radius_km > (0)::numeric) AND (service_radius_km <= (50)::numeric)));
CREATE INDEX idx_pricing_zones_active ON public.pricing_zones USING btree (is_active) WHERE (is_active = true);
CREATE INDEX idx_pricing_zones_community ON public.pricing_zones USING btree (community);
CREATE INDEX idx_pricing_zones_coords ON public.pricing_zones USING btree (latitude, longitude);
CREATE INDEX idx_pricing_zones_district ON public.pricing_zones USING btree (district);
CREATE INDEX idx_pricing_zones_region ON public.pricing_zones USING btree (region);
CREATE INDEX idx_pricing_zones_suburb ON public.pricing_zones USING btree (suburb);

-- Row level security: on
-- anon: DELETE,INSERT,SELECT,UPDATE
-- authenticated: DELETE,INSERT,SELECT,UPDATE
-- service_role: DELETE,INSERT,SELECT,UPDATE

-- Policies
create policy "Allow anonymous read access to pricing zones" on public.pricing_zones as permissive for select to anon
  using ((is_active = true));
create policy "Allow read access to pricing zones" on public.pricing_zones as permissive for select to authenticated
  using ((is_active = true));

-- Triggers (run in name order)
CREATE TRIGGER trigger_update_pricing_zones_timestamp BEFORE UPDATE ON public.pricing_zones FOR EACH ROW EXECUTE FUNCTION update_pricing_zones_timestamp();
