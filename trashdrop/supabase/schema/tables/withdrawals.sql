-- Table public.withdrawals
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

create table public.withdrawals (
  id uuid not null default gen_random_uuid(),
  collector_id uuid not null,
  amount numeric(10,2) not null,
  status character varying(20) not null default 'pending'::character varying,
  payment_method character varying(50) not null default 'mobile_money'::character varying,
  payment_details jsonb default '{}'::jsonb,
  phone_number character varying(20),
  network character varying(20),
  gateway_transaction_id text,
  gateway_response jsonb,
  gateway_error text,
  requested_at timestamp with time zone default now(),
  processed_at timestamp with time zone,
  completed_at timestamp with time zone,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);
alter table public.withdrawals add constraint withdrawals_amount_check CHECK ((amount > (0)::numeric));
alter table public.withdrawals add constraint withdrawals_collector_id_fkey FOREIGN KEY (collector_id) REFERENCES auth.users(id);
alter table public.withdrawals add constraint withdrawals_network_check CHECK (((network)::text = ANY (ARRAY[('MTN'::character varying)::text, ('VODAFONE'::character varying)::text, ('AIRTELTIGO'::character varying)::text, (NULL::character varying)::text])));
alter table public.withdrawals add constraint withdrawals_payment_method_check CHECK (((payment_method)::text = ANY (ARRAY[('mobile_money'::character varying)::text, ('bank_transfer'::character varying)::text])));
alter table public.withdrawals add constraint withdrawals_pkey PRIMARY KEY (id);
alter table public.withdrawals add constraint withdrawals_status_check CHECK (((status)::text = ANY (ARRAY[('pending'::character varying)::text, ('processing'::character varying)::text, ('completed'::character varying)::text, ('failed'::character varying)::text, ('cancelled'::character varying)::text])));
CREATE INDEX idx_withdrawals_collector_id ON public.withdrawals USING btree (collector_id);
CREATE INDEX idx_withdrawals_collector_status ON public.withdrawals USING btree (collector_id, status);
CREATE INDEX idx_withdrawals_created_at ON public.withdrawals USING btree (created_at DESC);
CREATE INDEX idx_withdrawals_gateway_transaction ON public.withdrawals USING btree (gateway_transaction_id) WHERE (gateway_transaction_id IS NOT NULL);
CREATE INDEX idx_withdrawals_status ON public.withdrawals USING btree (status);

-- Row level security: on
-- anon: DELETE,INSERT,SELECT,UPDATE
-- authenticated: DELETE,INSERT,SELECT,UPDATE
-- service_role: DELETE,INSERT,SELECT,UPDATE

-- Policies
create policy "view_own_withdrawals" on public.withdrawals as permissive for select to authenticated
  using ((collector_id = auth.uid()));
create policy "withdrawals_require_active_collector" on public.withdrawals as restrictive for insert to authenticated
  with check (is_active_collector(auth.uid()));

-- Triggers (run in name order)
CREATE TRIGGER withdrawals_updated_at_trigger BEFORE UPDATE ON public.withdrawals FOR EACH ROW EXECUTE FUNCTION update_withdrawals_updated_at();
