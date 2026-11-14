-- Table public.bin_payments
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

create table public.bin_payments (
  id uuid not null default gen_random_uuid(),
  digital_bin_id uuid not null,
  collector_id uuid not null,
  bags_collected integer not null,
  total_bill numeric(12,2) not null,
  payment_mode text not null,
  client_momo text,
  status text not null,
  gateway_reference text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  type text not null default 'collection'::text,
  collector_share numeric,
  platform_share numeric,
  client_rswitch text,
  currency text default 'GHS'::text,
  collector_account_number text,
  collector_account_name text,
  sender_name text default 'TrashDrop'::text,
  raw_gateway_response jsonb,
  retry_count integer default 0,
  scanned_bag_ids text[] default '{}'::text[],
  gateway_transaction_id text,
  gateway_error text,
  platform_subsidy numeric(10,2) not null default 0,
  is_promotional boolean not null default false,
  confirmed_by text
);
alter table public.bin_payments add constraint bin_payments_bags_collected_check CHECK ((bags_collected >= 0));
alter table public.bin_payments add constraint bin_payments_client_momo_required_for_non_cash CHECK (((payment_mode = 'cash'::text) OR ((client_momo IS NOT NULL) AND (length(TRIM(BOTH FROM client_momo)) > 0))));
alter table public.bin_payments add constraint bin_payments_collector_id_fkey FOREIGN KEY (collector_id) REFERENCES collector_profiles(id);
alter table public.bin_payments add constraint bin_payments_collector_share_check CHECK ((collector_share >= (0)::numeric));
alter table public.bin_payments add constraint bin_payments_confirmed_by_check CHECK ((confirmed_by = ANY (ARRAY['gateway'::text, 'staff'::text, 'collector'::text])));
alter table public.bin_payments add constraint bin_payments_digital_bin_id_fkey FOREIGN KEY (digital_bin_id) REFERENCES digital_bins(id) ON DELETE CASCADE;
alter table public.bin_payments add constraint bin_payments_gateway_reference_key UNIQUE (gateway_reference);
alter table public.bin_payments add constraint bin_payments_payment_mode_check CHECK ((payment_mode = ANY (ARRAY['momo'::text, 'e_cash'::text, 'cash'::text])));
alter table public.bin_payments add constraint bin_payments_pkey PRIMARY KEY (id);
alter table public.bin_payments add constraint bin_payments_platform_share_check CHECK ((platform_share >= (0)::numeric));
alter table public.bin_payments add constraint bin_payments_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'initiated'::text, 'success'::text, 'failed'::text])));
alter table public.bin_payments add constraint bin_payments_total_bill_check CHECK ((total_bill >= (0)::numeric));
alter table public.bin_payments add constraint bin_payments_type_check CHECK ((type = ANY (ARRAY['collection'::text, 'disbursement'::text])));
CREATE INDEX idx_bin_payments_collection_mode ON public.bin_payments USING btree (digital_bin_id, payment_mode, status) WHERE ((type = 'collection'::text) AND (status <> 'failed'::text));
CREATE INDEX idx_bin_payments_collector_disbursement ON public.bin_payments USING btree (collector_id, type, status) WHERE (type = 'disbursement'::text);
CREATE INDEX idx_bin_payments_digital_bin ON public.bin_payments USING btree (digital_bin_id, type);
CREATE INDEX idx_bin_payments_disbursement ON public.bin_payments USING btree (digital_bin_id, type, status) WHERE (type = 'disbursement'::text);
CREATE INDEX idx_bin_payments_gateway_transaction ON public.bin_payments USING btree (gateway_transaction_id) WHERE (gateway_transaction_id IS NOT NULL);
CREATE INDEX idx_bin_payments_gateway_transaction_id ON public.bin_payments USING btree (gateway_transaction_id);
CREATE INDEX idx_bin_payments_is_promotional ON public.bin_payments USING btree (is_promotional) WHERE (is_promotional = true);
CREATE INDEX idx_bin_payments_type_status ON public.bin_payments USING btree (type, status);

-- Row level security: on
-- anon: DELETE,INSERT,SELECT,UPDATE
-- authenticated: DELETE,INSERT,SELECT,UPDATE
-- service_role: DELETE,INSERT,SELECT,UPDATE

-- Policies
create policy "bin_payments_insert_own" on public.bin_payments as permissive for insert to authenticated
  with check ((collector_id IN ( SELECT td_my_collector_profile_ids() AS td_my_collector_profile_ids)));
create policy "bin_payments_read_own_or_staff" on public.bin_payments as permissive for select to authenticated
  using (((collector_id IN ( SELECT td_my_collector_profile_ids() AS td_my_collector_profile_ids)) OR td_can_manage_requests()));
create policy "bin_payments_update_own_or_staff" on public.bin_payments as permissive for update to authenticated
  using (((collector_id IN ( SELECT td_my_collector_profile_ids() AS td_my_collector_profile_ids)) OR td_can_manage_requests()))
  with check (((collector_id IN ( SELECT td_my_collector_profile_ids() AS td_my_collector_profile_ids)) OR td_can_manage_requests()));

-- Triggers (run in name order)
CREATE TRIGGER aa_td_guard_bin_payment BEFORE INSERT OR UPDATE ON public.bin_payments FOR EACH ROW EXECUTE FUNCTION td_guard_bin_payment();
