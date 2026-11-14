-- Table public.collector_loyalty_tiers
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

create table public.collector_loyalty_tiers (
  id uuid not null default gen_random_uuid(),
  collector_id uuid not null,
  month date not null,
  tier character varying(20) not null default 'Silver'::character varying,
  cashback_rate numeric(4,3) not null default 0.01,
  monthly_cap numeric(10,2) not null default 100,
  cashback_earned numeric(10,2) not null default 0,
  total_jobs_this_month integer not null default 0,
  created_at timestamp without time zone default now(),
  updated_at timestamp without time zone default now()
);
alter table public.collector_loyalty_tiers add constraint collector_loyalty_tiers_collector_id_fkey FOREIGN KEY (collector_id) REFERENCES auth.users(id);
alter table public.collector_loyalty_tiers add constraint collector_loyalty_tiers_collector_id_month_key UNIQUE (collector_id, month);
alter table public.collector_loyalty_tiers add constraint collector_loyalty_tiers_pkey PRIMARY KEY (id);

-- Row level security: on
-- anon: DELETE,INSERT,SELECT,UPDATE
-- authenticated: DELETE,INSERT,SELECT,UPDATE
-- service_role: DELETE,INSERT,SELECT,UPDATE

-- Policies
create policy "view_own_loyalty_tier" on public.collector_loyalty_tiers as permissive for select to authenticated
  using ((collector_id = auth.uid()));
