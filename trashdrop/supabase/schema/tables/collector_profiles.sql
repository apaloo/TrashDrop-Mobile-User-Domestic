-- Table public.collector_profiles
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

create table public.collector_profiles (
  id uuid not null default gen_random_uuid(),
  user_id uuid,
  first_name text not null,
  last_name text not null,
  phone text,
  status text not null default 'inactive'::text,
  vehicle_type text,
  vehicle_plate text,
  vehicle_capacity integer,
  current_latitude numeric(10,8),
  current_longitude numeric(11,8),
  assigned_region text,
  service_area_id uuid,
  rating numeric(3,2) default 0.00,
  total_collections integer default 0,
  completed_today integer default 0,
  active_requests integer default 0,
  is_online boolean default false,
  last_active_at timestamp with time zone,
  session_start_at timestamp with time zone,
  profile_image_url text,
  notes text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  company_name character varying,
  company_id character varying,
  id_back_photo_url character varying,
  id_front_photo_url character varying,
  id_type text,
  license_plate character varying,
  region text,
  role text,
  vehicle_color text,
  vehicle_photo_url character varying,
  email character varying,
  current_location geometry(Point,4326),
  location_updated_at timestamp with time zone,
  last_active timestamp with time zone default now(),
  pending_balance numeric(12,2) default 0,
  withdrawable_balance numeric(12,2) default 0,
  preferred_language character varying(10) default 'tw'::character varying,
  vehicle_capacity_bags integer,
  deactivation_reason text,
  deactivated_at timestamp with time zone,
  deactivated_by uuid,
  collector_type text not null default 'collector'::text,
  on_duty boolean not null default false,
  on_duty_changed_at timestamp with time zone
);
alter table public.collector_profiles add constraint collector_profiles_capacity_bags_check CHECK (((vehicle_capacity_bags IS NULL) OR ((vehicle_capacity_bags >= 1) AND (vehicle_capacity_bags <= 500)))) NOT VALID;
alter table public.collector_profiles add constraint collector_profiles_collector_type_check CHECK ((collector_type = ANY (ARRAY['collector'::text, 'volunteer'::text])));
alter table public.collector_profiles add constraint collector_profiles_pkey PRIMARY KEY (id);
alter table public.collector_profiles add constraint collector_profiles_rating_check CHECK (((rating >= (0)::numeric) AND (rating <= (5)::numeric)));
alter table public.collector_profiles add constraint collector_profiles_service_area_id_fkey FOREIGN KEY (service_area_id) REFERENCES service_areas(id) ON DELETE SET NULL;
alter table public.collector_profiles add constraint collector_profiles_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text, 'suspended'::text, 'on_break'::text])));
alter table public.collector_profiles add constraint collector_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.collector_profiles add constraint collector_profiles_vehicle_type_check CHECK (((vehicle_type IS NULL) OR (lower(vehicle_type) = ANY (ARRAY['cart'::text, 'motorcycle'::text, 'tricycle'::text, 'truck'::text, 'van'::text, 'bicycle'::text, 'other'::text])))) NOT VALID;
CREATE INDEX idx_collector_profiles_assigned_region ON public.collector_profiles USING btree (assigned_region);
CREATE INDEX idx_collector_profiles_last_active ON public.collector_profiles USING btree (last_active_at);
CREATE INDEX idx_collector_profiles_location ON public.collector_profiles USING gist (current_location);
CREATE INDEX idx_collector_profiles_location_updated ON public.collector_profiles USING btree (location_updated_at DESC);
CREATE INDEX idx_collector_profiles_online_location ON public.collector_profiles USING btree (is_online, current_latitude, current_longitude) WHERE (is_online = true);
CREATE INDEX idx_collector_profiles_service_area ON public.collector_profiles USING btree (service_area_id);
CREATE INDEX idx_collector_profiles_status ON public.collector_profiles USING btree (status);

-- Row level security: on
-- anon: DELETE,INSERT,SELECT,UPDATE
-- authenticated: DELETE,INSERT,SELECT,UPDATE
-- service_role: DELETE,INSERT,SELECT,UPDATE

-- Policies
create policy "collector_profiles_insert_own" on public.collector_profiles as permissive for insert to authenticated
  with check ((user_id = auth.uid()));
create policy "collector_profiles_read_household_on_the_way" on public.collector_profiles as permissive for select to authenticated
  using (td_household_can_follow(user_id));
create policy "collector_profiles_read_own" on public.collector_profiles as permissive for select to authenticated
  using ((user_id = auth.uid()));
create policy "collector_profiles_read_staff" on public.collector_profiles as permissive for select to authenticated
  using (td_is_staff());
create policy "collector_profiles_staff_insert" on public.collector_profiles as permissive for insert to authenticated
  with check (td_is_staff());
create policy "collector_profiles_staff_update" on public.collector_profiles as permissive for update to authenticated
  using (td_is_staff())
  with check (td_is_staff());
create policy "collector_profiles_update_own" on public.collector_profiles as permissive for update to authenticated
  using ((user_id = auth.uid()))
  with check ((user_id = auth.uid()));

-- Triggers (run in name order)
CREATE TRIGGER collector_profiles_clean_contact BEFORE INSERT OR UPDATE OF phone, email ON public.collector_profiles FOR EACH ROW EXECUTE FUNCTION collector_profiles_clean_contact();
CREATE TRIGGER protect_collector_admin_fields BEFORE UPDATE ON public.collector_profiles FOR EACH ROW EXECUTE FUNCTION protect_collector_admin_fields();
CREATE TRIGGER td_audit_collector AFTER INSERT OR UPDATE ON public.collector_profiles FOR EACH ROW EXECUTE FUNCTION td_audit_collector();
CREATE TRIGGER trigger_sync_collector_online_status BEFORE UPDATE OF last_active ON public.collector_profiles FOR EACH ROW EXECUTE FUNCTION sync_collector_online_status();
CREATE TRIGGER trigger_sync_location_from_coords BEFORE UPDATE OF current_latitude, current_longitude ON public.collector_profiles FOR EACH ROW WHEN (((new.current_latitude IS NOT NULL) AND (new.current_longitude IS NOT NULL))) EXECUTE FUNCTION sync_collector_location_from_coords();
CREATE TRIGGER trigger_sync_location_from_postgis BEFORE UPDATE OF current_location ON public.collector_profiles FOR EACH ROW WHEN ((new.current_location IS NOT NULL)) EXECUTE FUNCTION sync_collector_location_from_postgis();
CREATE TRIGGER trigger_update_collector_profiles_updated_at BEFORE UPDATE ON public.collector_profiles FOR EACH ROW EXECUTE FUNCTION update_collector_profiles_updated_at();
