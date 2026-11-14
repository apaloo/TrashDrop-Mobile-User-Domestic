-- Table public.payment_methods
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

create table public.payment_methods (
  id uuid not null default uuid_generate_v4(),
  user_id uuid not null,
  type text not null,
  provider text not null,
  is_default boolean default false,
  details jsonb not null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);
alter table public.payment_methods add constraint payment_methods_pkey PRIMARY KEY (id);
alter table public.payment_methods add constraint payment_methods_type_check CHECK ((type = ANY (ARRAY['credit_card'::text, 'bank_account'::text, 'mobile_money'::text])));
alter table public.payment_methods add constraint payment_methods_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);

-- Row level security: on
-- anon: DELETE,INSERT,SELECT,UPDATE
-- authenticated: DELETE,INSERT,SELECT,UPDATE
-- service_role: DELETE,INSERT,SELECT,UPDATE

-- Policies
create policy "payment_methods_own" on public.payment_methods as permissive for all to authenticated
  using ((user_id = auth.uid()))
  with check ((user_id = auth.uid()));

-- Triggers (run in name order)
CREATE TRIGGER update_payment_methods_updated_at BEFORE UPDATE ON public.payment_methods FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
