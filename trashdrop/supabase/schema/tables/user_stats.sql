-- Table public.user_stats
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

create table public.user_stats (
  id bigint not null,
  user_id uuid not null,
  created_at timestamp with time zone default now(),
  total_bags integer,
  total_bags_scanned integer default 0,
  available_bags integer default 0,
  total_batches integer,
  completed_requests_count integer not null default 0
);
alter table public.user_stats add constraint chk_user_stats_completed_requests_non_negative CHECK ((completed_requests_count >= 0));
alter table public.user_stats add constraint chk_user_stats_total_bags_non_negative CHECK ((total_bags >= 0));
alter table public.user_stats add constraint user_stats_pkey PRIMARY KEY (id);
alter table public.user_stats add constraint user_stats_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
alter table public.user_stats add constraint user_stats_user_id_unique UNIQUE (user_id);
CREATE INDEX idx_user_stats_completed_requests ON public.user_stats USING btree (user_id) WHERE (completed_requests_count < 5);

-- Row level security: on
-- anon: DELETE,INSERT,SELECT,UPDATE
-- authenticated: DELETE,INSERT,SELECT,UPDATE
-- service_role: DELETE,INSERT,SELECT,UPDATE

-- Policies
create policy "Enable read access for authenticated users" on public.user_stats as permissive for select to public
  using ((auth.uid() = user_id));
create policy "Users can update their own stats" on public.user_stats as permissive for all to public
  using ((user_id = auth.uid()));
create policy "Users can view their own stats" on public.user_stats as permissive for select to public
  using ((user_id = auth.uid()));
