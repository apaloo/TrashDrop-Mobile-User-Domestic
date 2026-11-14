-- Table public.illegal_dumping_history_mobile
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

create table public.illegal_dumping_history_mobile (
  id uuid not null default uuid_generate_v4(),
  dumping_id uuid not null,
  status text not null,
  notes text,
  updated_by uuid not null,
  created_at timestamp with time zone default now()
);
alter table public.illegal_dumping_history_mobile add constraint illegal_dumping_history_mobile_dumping_id_fkey FOREIGN KEY (dumping_id) REFERENCES illegal_dumping_mobile(id);
alter table public.illegal_dumping_history_mobile add constraint illegal_dumping_history_mobile_pkey PRIMARY KEY (id);
alter table public.illegal_dumping_history_mobile add constraint illegal_dumping_history_mobile_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);

-- Row level security: on
-- anon: DELETE,INSERT,SELECT,UPDATE
-- authenticated: DELETE,INSERT,SELECT,UPDATE
-- service_role: DELETE,INSERT,SELECT,UPDATE

-- Policies
create policy "dumping_history_add_visible_report" on public.illegal_dumping_history_mobile as permissive for insert to authenticated
  with check ((EXISTS ( SELECT 1
   FROM illegal_dumping_mobile d
  WHERE (d.id = illegal_dumping_history_mobile.dumping_id))));
create policy "dumping_history_read_visible_report" on public.illegal_dumping_history_mobile as permissive for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM illegal_dumping_mobile d
  WHERE (d.id = illegal_dumping_history_mobile.dumping_id))));
