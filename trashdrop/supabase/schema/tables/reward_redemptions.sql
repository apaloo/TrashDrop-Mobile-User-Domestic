-- Table public.reward_redemptions
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

create table public.reward_redemptions (
  id uuid not null default uuid_generate_v4(),
  user_id uuid not null,
  reward_id uuid not null,
  points_used integer not null,
  status text not null default 'pending'::text,
  redemption_date timestamp with time zone not null default now(),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);
alter table public.reward_redemptions add constraint reward_redemptions_pkey PRIMARY KEY (id);
alter table public.reward_redemptions add constraint reward_redemptions_reward_id_fkey FOREIGN KEY (reward_id) REFERENCES rewards(id) ON DELETE CASCADE;
alter table public.reward_redemptions add constraint reward_redemptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Row level security: on
-- anon: DELETE,INSERT,SELECT,UPDATE
-- authenticated: DELETE,INSERT,SELECT,UPDATE
-- service_role: DELETE,INSERT,SELECT,UPDATE

-- Policies
create policy "reward_redemptions_insert" on public.reward_redemptions as permissive for insert to public
  with check ((auth.uid() = user_id));
create policy "reward_redemptions_select" on public.reward_redemptions as permissive for select to public
  using ((auth.uid() = user_id));

-- Triggers (run in name order)
CREATE TRIGGER update_reward_redemptions_updated_at BEFORE UPDATE ON public.reward_redemptions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
