-- Table public.dumping_reports
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

create table public.dumping_reports (
  id uuid not null default uuid_generate_v4(),
  user_id uuid not null,
  latitude numeric not null,
  longitude numeric not null,
  address text,
  waste_type text not null,
  approximate_size text not null,
  images text[],
  status text not null default 'reported'::text,
  is_anonymous boolean default false,
  points_earned integer default 0,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  location_address text
);
alter table public.dumping_reports add constraint dumping_reports_pkey PRIMARY KEY (id);
alter table public.dumping_reports add constraint dumping_reports_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
alter table public.dumping_reports add constraint dumping_reports_waste_type_check CHECK ((waste_type = ANY (ARRAY['plastic'::text, 'paper'::text, 'metal'::text, 'glass'::text, 'organic'::text, 'general'::text, 'recycling'::text])));
CREATE INDEX dumping_reports_created_at_idx ON public.dumping_reports USING btree (created_at);
CREATE INDEX dumping_reports_status_idx ON public.dumping_reports USING btree (status);

-- Row level security: on
-- anon: DELETE,INSERT,SELECT,UPDATE
-- authenticated: DELETE,INSERT,SELECT,UPDATE
-- service_role: DELETE,INSERT,SELECT,UPDATE

-- Policies
create policy "dumping_reports_insert_own" on public.dumping_reports as permissive for insert to authenticated
  with check ((user_id = auth.uid()));
create policy "Users can view dumping reports" on public.dumping_reports as permissive for select to public
  using (true);
create policy "Users can view non-anonymous reports" on public.dumping_reports as permissive for select to public
  using ((is_anonymous = false));
create policy "Users can view their own reports" on public.dumping_reports as permissive for all to public
  using ((auth.uid() = user_id));

-- Triggers (run in name order)
CREATE TRIGGER update_dumping_reports_updated_at BEFORE UPDATE ON public.dumping_reports FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
