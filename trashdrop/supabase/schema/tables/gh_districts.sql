-- Table public.gh_districts
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

create table public.gh_districts (
  name text not null,
  region text not null,
  geom geometry(MultiPolygon,4326) not null,
  source text not null default 'geoBoundaries gbOpen GHA ADM2 (CC BY 4.0)'::text
);
alter table public.gh_districts add constraint gh_districts_pkey PRIMARY KEY (name);
CREATE INDEX gh_districts_geom_idx ON public.gh_districts USING gist (geom);
CREATE INDEX gh_districts_region_idx ON public.gh_districts USING btree (region);

-- Row level security: on
-- anon: no access
-- authenticated: DELETE,INSERT,SELECT,UPDATE
-- service_role: DELETE,INSERT,SELECT,UPDATE

-- Policies
create policy "gh_districts_read" on public.gh_districts as permissive for select to authenticated
  using (true);
