-- Table public.messages
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

create table public.messages (
  id uuid not null default gen_random_uuid(),
  sender_id uuid,
  recipient_id uuid,
  subject text,
  content text not null,
  read boolean default false,
  created_at timestamp with time zone default now()
);
alter table public.messages add constraint messages_pkey PRIMARY KEY (id);
alter table public.messages add constraint messages_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.messages add constraint messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Row level security: on
-- anon: DELETE,INSERT,SELECT,UPDATE
-- authenticated: DELETE,INSERT,SELECT,UPDATE
-- service_role: DELETE,INSERT,SELECT,UPDATE

-- Policies
create policy "messages_read_own" on public.messages as permissive for select to authenticated
  using (((sender_id = auth.uid()) OR (recipient_id = auth.uid()) OR td_is_staff()));
create policy "messages_recipient_update" on public.messages as permissive for update to authenticated
  using ((recipient_id = auth.uid()))
  with check ((recipient_id = auth.uid()));
create policy "messages_send_own" on public.messages as permissive for insert to authenticated
  with check ((sender_id = auth.uid()));
