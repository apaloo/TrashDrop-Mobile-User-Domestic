-- Table public.notifications
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

create table public.notifications (
  id uuid not null default gen_random_uuid(),
  user_id uuid,
  title text not null,
  message text,
  type text default 'info'::text,
  read boolean default false,
  created_at timestamp with time zone default now()
);
alter table public.notifications add constraint notifications_pkey PRIMARY KEY (id);
alter table public.notifications add constraint notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Row level security: on
-- anon: no access
-- authenticated: DELETE,INSERT,SELECT,UPDATE
-- service_role: DELETE,INSERT,SELECT,UPDATE

-- Policies
create policy "notifications_delete_own" on public.notifications as permissive for delete to authenticated
  using ((user_id = ( SELECT auth.uid() AS uid)));
create policy "notifications_insert_self_staff_or_collector" on public.notifications as permissive for insert to authenticated
  with check (((user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT td_is_staff() AS td_is_staff) OR td_collector_serves_household(user_id)));
create policy "notifications_read_own" on public.notifications as permissive for select to authenticated
  using ((user_id = ( SELECT auth.uid() AS uid)));
create policy "notifications_read_staff" on public.notifications as permissive for select to authenticated
  using (( SELECT td_is_staff() AS td_is_staff));
create policy "notifications_update_own" on public.notifications as permissive for update to authenticated
  using ((user_id = ( SELECT auth.uid() AS uid)))
  with check ((user_id = ( SELECT auth.uid() AS uid)));
