-- Table public.assignment_photos
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

create table public.assignment_photos (
  id uuid not null default uuid_generate_v4(),
  assignment_id text,
  photo_url text not null,
  created_at timestamp with time zone default now()
);
alter table public.assignment_photos add constraint assignment_photos_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES authority_assignments(id) ON DELETE CASCADE;
alter table public.assignment_photos add constraint assignment_photos_pkey PRIMARY KEY (id);

-- Row level security: on
-- anon: DELETE,INSERT,SELECT,UPDATE
-- authenticated: DELETE,INSERT,SELECT,UPDATE
-- service_role: DELETE,INSERT,SELECT,UPDATE

-- Policies
create policy "Anyone can view assignment photos" on public.assignment_photos as permissive for select to public
  using ((assignment_id IN ( SELECT authority_assignments.id
   FROM authority_assignments
  WHERE (authority_assignments.status = 'completed'::text))));
create policy "Collectors can insert photos for their assignments" on public.assignment_photos as permissive for insert to public
  with check ((assignment_id IN ( SELECT authority_assignments.id
   FROM authority_assignments
  WHERE (authority_assignments.collector_id = auth.uid()))));
