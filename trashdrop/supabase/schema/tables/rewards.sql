-- Table public.rewards
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

create table public.rewards (
  id uuid not null default uuid_generate_v4(),
  name text not null,
  description text not null,
  points_cost integer not null,
  category text not null,
  image_url text,
  active boolean default true,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);
alter table public.rewards add constraint rewards_pkey PRIMARY KEY (id);

-- Row level security: on
-- anon: DELETE,INSERT,SELECT,UPDATE
-- authenticated: DELETE,INSERT,SELECT,UPDATE
-- service_role: DELETE,INSERT,SELECT,UPDATE

-- Policies
create policy "rewards_select" on public.rewards as permissive for select to public
  using (true);

-- Triggers (run in name order)
CREATE TRIGGER update_rewards_updated_at BEFORE UPDATE ON public.rewards FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
