-- Table public.locations
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

create table public.locations (
  id uuid not null default uuid_generate_v4(),
  user_id uuid not null,
  location_name text not null,
  address text not null,
  latitude numeric not null,
  longitude numeric not null,
  is_default boolean default false,
  location_type text default 'home'::text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);
alter table public.locations add constraint locations_pkey PRIMARY KEY (id);
alter table public.locations add constraint locations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);

-- Row level security: on
-- anon: DELETE,INSERT,SELECT,UPDATE
-- authenticated: DELETE,INSERT,SELECT,UPDATE
-- service_role: DELETE,INSERT,SELECT,UPDATE

-- Policies
create policy "Users can manage their own locations" on public.locations as permissive for all to public
  using ((auth.uid() = user_id));

-- Triggers (run in name order)
CREATE TRIGGER ghana_location_latitude BEFORE INSERT OR UPDATE OF latitude, longitude ON public.locations FOR EACH ROW EXECUTE FUNCTION reject_location_outside_ghana('latlng', 'latitude', 'longitude');
CREATE TRIGGER trigger_sync_pickups_on_location_change_v2 AFTER UPDATE ON public.locations FOR EACH ROW WHEN (((old.latitude IS DISTINCT FROM new.latitude) OR (old.longitude IS DISTINCT FROM new.longitude))) EXECUTE FUNCTION resync_user_pickup_locations();
CREATE TRIGGER update_locations_updated_at BEFORE UPDATE ON public.locations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
