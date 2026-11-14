-- Table public.bag_orders
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

create table public.bag_orders (
  id uuid not null default uuid_generate_v4(),
  user_id uuid not null,
  location_id uuid not null,
  bag_type text not null,
  quantity integer not null,
  status text not null default 'pending'::text,
  delivery_date timestamp with time zone,
  points_used integer default 0,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  batch_qr_code text not null
);
alter table public.bag_orders add constraint bag_orders_batch_qr_code_key UNIQUE (batch_qr_code);
alter table public.bag_orders add constraint bag_orders_location_id_fkey FOREIGN KEY (location_id) REFERENCES locations(id);
alter table public.bag_orders add constraint bag_orders_pkey PRIMARY KEY (id);
alter table public.bag_orders add constraint bag_orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);

-- Row level security: on
-- anon: DELETE,INSERT,SELECT,UPDATE
-- authenticated: DELETE,INSERT,SELECT,UPDATE
-- service_role: DELETE,INSERT,SELECT,UPDATE

-- Policies
create policy "Users can manage their orders" on public.bag_orders as permissive for all to public
  using ((auth.uid() = user_id));

-- Triggers (run in name order)
CREATE TRIGGER update_bag_orders_updated_at BEFORE UPDATE ON public.bag_orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
