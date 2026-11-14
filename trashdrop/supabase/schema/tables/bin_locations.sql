-- Table public.bin_locations
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

create table public.bin_locations (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  location_name text not null,
  address text not null,
  coordinates geometry(Point,4326) not null,
  is_default boolean default false,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);
alter table public.bin_locations add constraint bin_locations_pkey PRIMARY KEY (id);
alter table public.bin_locations add constraint bin_locations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX idx_bin_locations_user_id ON public.bin_locations USING btree (user_id);

-- Row level security: on
-- anon: no access
-- authenticated: DELETE,INSERT,SELECT,UPDATE
-- service_role: DELETE,INSERT,SELECT,UPDATE

-- Policies
create policy "bin_locations_read_collector_by_job" on public.bin_locations as permissive for select to authenticated
  using (td_collector_can_see_bin_location(id));
create policy "bin_locations_read_staff" on public.bin_locations as permissive for select to authenticated
  using (( SELECT td_is_staff() AS td_is_staff));
create policy "Users can create bin locations" on public.bin_locations as permissive for insert to public
  with check ((auth.uid() = user_id));
create policy "Users can update their own bin locations" on public.bin_locations as permissive for update to public
  using ((auth.uid() = user_id));
create policy "Users can view their own bin locations" on public.bin_locations as permissive for select to public
  using ((auth.uid() = user_id));

-- Triggers (run in name order)
CREATE TRIGGER ghana_location_coordinates BEFORE INSERT OR UPDATE OF coordinates ON public.bin_locations FOR EACH ROW EXECUTE FUNCTION reject_location_outside_ghana('point', 'coordinates');
CREATE TRIGGER update_bin_locations_updated_at BEFORE UPDATE ON public.bin_locations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
