-- Table public.rewards_redemption
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

create table public.rewards_redemption (
  id uuid not null default uuid_generate_v4(),
  user_id uuid not null,
  reward_id uuid not null,
  points_spent integer not null,
  status text not null default 'pending'::text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  fulfilled_at timestamp with time zone,
  phone_number text,
  network text,
  sent_at timestamp with time zone,
  handled_by uuid,
  staff_note text
);
alter table public.rewards_redemption add constraint rewards_redemption_pkey PRIMARY KEY (id);
alter table public.rewards_redemption add constraint rewards_redemption_points_positive CHECK ((points_spent > 0));
alter table public.rewards_redemption add constraint rewards_redemption_reward_id_fkey FOREIGN KEY (reward_id) REFERENCES rewards(id);
alter table public.rewards_redemption add constraint rewards_redemption_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX idx_rewards_redemption_user_spent ON public.rewards_redemption USING btree (user_id, points_spent);

-- Row level security: on
-- anon: DELETE,SELECT,UPDATE
-- authenticated: DELETE,SELECT,UPDATE
-- service_role: DELETE,INSERT,SELECT,UPDATE

-- Policies
create policy "Users can view their own redemptions" on public.rewards_redemption as permissive for select to public
  using ((auth.uid() = user_id));

-- Triggers (run in name order)
CREATE TRIGGER update_rewards_redemption_updated_at BEFORE UPDATE ON public.rewards_redemption FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
