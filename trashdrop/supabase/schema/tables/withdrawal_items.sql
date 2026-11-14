-- Table public.withdrawal_items
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

create table public.withdrawal_items (
  id uuid not null default gen_random_uuid(),
  withdrawal_id uuid not null,
  item_type text not null,
  item_id text not null,
  amount numeric not null,
  created_at timestamp with time zone not null default now()
);
alter table public.withdrawal_items add constraint withdrawal_items_amount_check CHECK ((amount >= (0)::numeric));
alter table public.withdrawal_items add constraint withdrawal_items_item_type_check CHECK ((item_type = ANY (ARRAY['digital_bin'::text, 'pickup_request'::text, 'dumping_cleanup'::text, 'promo_subsidy'::text])));
alter table public.withdrawal_items add constraint withdrawal_items_pkey PRIMARY KEY (id);
alter table public.withdrawal_items add constraint withdrawal_items_withdrawal_fkey FOREIGN KEY (withdrawal_id) REFERENCES withdrawals(id) ON DELETE CASCADE;
CREATE INDEX idx_withdrawal_items_item ON public.withdrawal_items USING btree (item_type, item_id);
CREATE INDEX idx_withdrawal_items_withdrawal ON public.withdrawal_items USING btree (withdrawal_id);

-- Row level security: on
-- anon: SELECT
-- authenticated: SELECT
-- service_role: DELETE,INSERT,SELECT,UPDATE

-- Policies
create policy "withdrawal_items_view_own" on public.withdrawal_items as permissive for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM withdrawals w
  WHERE ((w.id = withdrawal_items.withdrawal_id) AND (w.collector_id = auth.uid())))));
