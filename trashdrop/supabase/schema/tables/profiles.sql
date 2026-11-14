-- Table public.profiles
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

create table public.profiles (
  id uuid not null,
  email text not null,
  first_name text,
  last_name text,
  phone text,
  address text,
  avatar_url text,
  dark_mode boolean default false,
  language text default 'en'::text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  points integer default 0,
  level text default 'Eco Starter'::text,
  phone_verified boolean default false,
  notification_preferences jsonb default '{"push": true, "email": true}'::jsonb,
  role text default 'user'::text
);
alter table public.profiles add constraint profiles_email_key UNIQUE (email);
alter table public.profiles add constraint profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id);
alter table public.profiles add constraint profiles_pkey PRIMARY KEY (id);

-- Row level security: on
-- anon: SELECT
-- authenticated: INSERT,SELECT,UPDATE
-- service_role: DELETE,INSERT,SELECT,UPDATE

-- Policies
create policy "Enable read access for authenticated users" on public.profiles as permissive for select to authenticated
  using (true);
create policy "Users create their own profile" on public.profiles as permissive for insert to authenticated
  with check ((id = ( SELECT auth.uid() AS uid)));
create policy "Users update their own profile" on public.profiles as permissive for update to authenticated
  using ((id = ( SELECT auth.uid() AS uid)))
  with check ((id = ( SELECT auth.uid() AS uid)));

-- Triggers (run in name order)
CREATE TRIGGER td_guard_profile_columns BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION td_guard_profile_columns();
CREATE TRIGGER trg_link_whatsapp_on_profile AFTER INSERT OR UPDATE OF phone ON public.profiles FOR EACH ROW EXECUTE FUNCTION link_whatsapp_user_on_profile_update();
CREATE TRIGGER update_profiles_timestamp BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION update_profile_timestamp();
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
