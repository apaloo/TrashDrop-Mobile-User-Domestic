-- Table public.contacts
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

create table public.contacts (
  id uuid not null default gen_random_uuid(),
  user_id uuid,
  name text not null,
  email text,
  phone text,
  contact_type text default 'personal'::text,
  relationship text,
  primary_contact boolean default false,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);
alter table public.contacts add constraint contacts_pkey PRIMARY KEY (id);
alter table public.contacts add constraint contacts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);

-- Row level security: on
-- anon: DELETE,INSERT,SELECT,UPDATE
-- authenticated: DELETE,INSERT,SELECT,UPDATE
-- service_role: DELETE,INSERT,SELECT,UPDATE

-- Policies
create policy "Allow users to delete their own contacts" on public.contacts as permissive for delete to authenticated
  using ((NOT (auth.uid() IS DISTINCT FROM user_id)));
create policy "Allow users to insert their own contacts" on public.contacts as permissive for insert to authenticated
  with check ((NOT (auth.uid() IS DISTINCT FROM user_id)));
create policy "Allow users to update their own contacts" on public.contacts as permissive for update to authenticated
  using ((NOT (auth.uid() IS DISTINCT FROM user_id)));
create policy "Allow users to view their own contacts" on public.contacts as permissive for select to authenticated
  using ((NOT (auth.uid() IS DISTINCT FROM user_id)));

-- Triggers (run in name order)
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();
