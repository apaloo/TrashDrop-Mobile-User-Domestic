-- Table public.illegal_dumping_history
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

create table public.illegal_dumping_history (
  id uuid not null default gen_random_uuid(),
  report_id uuid,
  previous_status text,
  new_status text,
  changed_by uuid,
  notes text,
  created_at timestamp with time zone default now()
);
alter table public.illegal_dumping_history add constraint illegal_dumping_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES auth.users(id);
alter table public.illegal_dumping_history add constraint illegal_dumping_history_pkey PRIMARY KEY (id);
alter table public.illegal_dumping_history add constraint illegal_dumping_history_report_id_fkey FOREIGN KEY (report_id) REFERENCES illegal_dumping(id) ON DELETE CASCADE;

-- Row level security: on
-- anon: DELETE,INSERT,SELECT,UPDATE
-- authenticated: DELETE,INSERT,SELECT,UPDATE
-- service_role: DELETE,INSERT,SELECT,UPDATE

-- Policies
create policy "Illegal dumping history is viewable by authenticated users" on public.illegal_dumping_history as permissive for select to authenticated
  using (true);
