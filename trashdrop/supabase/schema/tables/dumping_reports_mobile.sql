-- Table public.dumping_reports_mobile
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

create table public.dumping_reports_mobile (
  id uuid not null default uuid_generate_v4(),
  dumping_id uuid not null,
  estimated_volume text,
  hazardous_materials boolean default false,
  accessibility_notes text,
  created_at timestamp with time zone default now()
);
alter table public.dumping_reports_mobile add constraint dumping_reports_mobile_dumping_id_fkey FOREIGN KEY (dumping_id) REFERENCES illegal_dumping_mobile(id);
alter table public.dumping_reports_mobile add constraint dumping_reports_mobile_pkey PRIMARY KEY (id);

-- Row level security: on
-- anon: DELETE,INSERT,SELECT,UPDATE
-- authenticated: DELETE,INSERT,SELECT,UPDATE
-- service_role: DELETE,INSERT,SELECT,UPDATE

-- Policies
create policy "dumping_reports_mobile_insert_own" on public.dumping_reports_mobile as permissive for insert to authenticated
  with check ((td_can_manage_requests() OR (EXISTS ( SELECT 1
   FROM illegal_dumping_mobile d
  WHERE ((d.id = dumping_reports_mobile.dumping_id) AND (d.reported_by = auth.uid()))))));
create policy "Users can view dumping reports mobile" on public.dumping_reports_mobile as permissive for select to public
  using (true);
