-- Table public.bags
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

create table public.bags (
  id uuid not null default gen_random_uuid(),
  batch_id uuid,
  qr_code text not null,
  status text default 'active'::text,
  scanned boolean default false,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  user_id uuid,
  collector_id uuid,
  unit_price numeric(10,2),
  scanned_at timestamp with time zone,
  disposed_at timestamp with time zone,
  is_verified boolean default false,
  collector_credited_at timestamp with time zone,
  collector_unlocked_at timestamp with time zone,
  deadhead_km numeric(10,2),
  collector_base_earnings numeric(10,2),
  is_recyclable boolean default false,
  recycler_gross numeric(10,2),
  recycler_collector_share numeric(10,2),
  recycler_user_share numeric(10,2),
  recycler_platform_share numeric(10,2),
  collector_total_earnings numeric(10,2),
  user_total_earnings numeric(10,2),
  platform_total_earnings numeric(10,2),
  pickup_request_id text
);
alter table public.bags add constraint bags_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES batches(id) ON DELETE CASCADE;
alter table public.bags add constraint bags_pkey PRIMARY KEY (id);
CREATE UNIQUE INDEX bags_qr_code_unique ON public.bags USING btree (qr_code) WHERE (qr_code IS NOT NULL);
CREATE INDEX idx_bags_pickup_request_id ON public.bags USING btree (pickup_request_id) WHERE (pickup_request_id IS NOT NULL);

-- Row level security: on
-- anon: DELETE,INSERT,SELECT,UPDATE
-- authenticated: DELETE,INSERT,SELECT,UPDATE
-- service_role: DELETE,INSERT,SELECT,UPDATE

-- Policies
create policy "bags_staff_insert" on public.bags as permissive for insert to authenticated
  with check (td_is_staff());
create policy "bags_staff_update" on public.bags as permissive for update to authenticated
  using (td_is_staff())
  with check (td_is_staff());
create policy "Enable read access for authenticated users" on public.bags as permissive for select to authenticated
  using (true);

-- Triggers (run in name order)
CREATE TRIGGER trg_bag_disposed_settlement BEFORE UPDATE ON public.bags FOR EACH ROW EXECUTE FUNCTION on_bag_disposed_settlement();
CREATE TRIGGER trg_bag_scanned_credit BEFORE UPDATE ON public.bags FOR EACH ROW EXECUTE FUNCTION on_bag_scanned_credit();
CREATE TRIGGER update_bags_updated_at BEFORE UPDATE ON public.bags FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
