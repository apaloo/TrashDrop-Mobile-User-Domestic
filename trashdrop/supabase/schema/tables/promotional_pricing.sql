-- Table public.promotional_pricing
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

create table public.promotional_pricing (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  digital_bin_id uuid,
  bin_size_liters integer not null,
  client_fee numeric not null,
  collector_payout numeric not null,
  platform_subsidy numeric not null,
  request_number integer not null,
  created_at timestamp with time zone default now()
);
alter table public.promotional_pricing add constraint promotional_pricing_digital_bin_id_fkey FOREIGN KEY (digital_bin_id) REFERENCES digital_bins(id);
alter table public.promotional_pricing add constraint promotional_pricing_pkey PRIMARY KEY (id);
alter table public.promotional_pricing add constraint promotional_pricing_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);

-- Row level security: on
-- anon: DELETE,INSERT,SELECT,UPDATE
-- authenticated: DELETE,INSERT,SELECT,UPDATE
-- service_role: DELETE,INSERT,SELECT,UPDATE
