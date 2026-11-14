-- Table public.job_ratings
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

create table public.job_ratings (
  id uuid not null default gen_random_uuid(),
  job_source text not null,
  job_id text not null,
  household_id uuid not null,
  collector_id uuid not null,
  stars smallint not null,
  comment text,
  created_at timestamp with time zone not null default now()
);
alter table public.job_ratings add constraint job_ratings_comment_check CHECK (((comment IS NULL) OR (char_length(comment) <= 500)));
alter table public.job_ratings add constraint job_ratings_household_id_fkey FOREIGN KEY (household_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.job_ratings add constraint job_ratings_job_source_check CHECK ((job_source = ANY (ARRAY['pickup_requests'::text, 'digital_bins'::text])));
alter table public.job_ratings add constraint job_ratings_job_source_job_id_key UNIQUE (job_source, job_id);
alter table public.job_ratings add constraint job_ratings_pkey PRIMARY KEY (id);
alter table public.job_ratings add constraint job_ratings_stars_check CHECK (((stars >= 1) AND (stars <= 5)));
CREATE INDEX job_ratings_collector_idx ON public.job_ratings USING btree (collector_id);
CREATE INDEX job_ratings_household_idx ON public.job_ratings USING btree (household_id);

-- Row level security: on
-- anon: no access
-- authenticated: SELECT
-- service_role: DELETE,INSERT,SELECT,UPDATE

-- Policies
create policy "job_ratings_read_own" on public.job_ratings as permissive for select to authenticated
  using ((household_id = auth.uid()));
create policy "job_ratings_read_staff" on public.job_ratings as permissive for select to authenticated
  using (td_is_staff());
