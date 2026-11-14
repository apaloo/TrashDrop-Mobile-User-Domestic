-- Table public.staff_admins
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

create table public.staff_admins (
  user_id uuid not null,
  added_by uuid,
  added_at timestamp with time zone not null default now(),
  note text
);
alter table public.staff_admins add constraint staff_admins_added_by_fkey FOREIGN KEY (added_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.staff_admins add constraint staff_admins_pkey PRIMARY KEY (user_id);
alter table public.staff_admins add constraint staff_admins_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Row level security: on
-- anon: no access
-- authenticated: SELECT
-- service_role: DELETE,INSERT,SELECT,UPDATE

-- Policies
create policy "staff_admins_read" on public.staff_admins as permissive for select to authenticated
  using (td_is_staff());
