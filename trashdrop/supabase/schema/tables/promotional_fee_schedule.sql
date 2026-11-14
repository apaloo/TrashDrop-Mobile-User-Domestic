-- Table public.promotional_fee_schedule
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

create table public.promotional_fee_schedule (
  id uuid not null default gen_random_uuid(),
  bin_size_liters integer not null,
  client_fee numeric not null,
  collector_payout numeric not null,
  platform_subsidy numeric default (collector_payout - client_fee),
  max_requests integer not null default 5,
  is_active boolean not null default true,
  created_at timestamp with time zone default now()
);
alter table public.promotional_fee_schedule add constraint promotional_fee_schedule_pkey PRIMARY KEY (id);

-- Row level security: on
-- anon: DELETE,INSERT,SELECT,UPDATE
-- authenticated: DELETE,INSERT,SELECT,UPDATE
-- service_role: DELETE,INSERT,SELECT,UPDATE

-- Policies
create policy "Allow authenticated users to read promotional fees" on public.promotional_fee_schedule as permissive for select to authenticated
  using (true);
