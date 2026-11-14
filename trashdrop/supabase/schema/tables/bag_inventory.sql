-- Table public.bag_inventory
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

create table public.bag_inventory (
  id uuid not null default uuid_generate_v4(),
  user_id uuid not null,
  batch_code text not null,
  bag_type text not null,
  status text not null default 'available'::text,
  scan_date timestamp with time zone not null default now(),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  batch_id uuid
);
alter table public.bag_inventory add constraint bag_inventory_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES bag_orders(id);
alter table public.bag_inventory add constraint bag_inventory_pkey PRIMARY KEY (id);
alter table public.bag_inventory add constraint bag_inventory_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);

-- Row level security: on
-- anon: DELETE,INSERT,SELECT,UPDATE
-- authenticated: DELETE,INSERT,SELECT,UPDATE
-- service_role: DELETE,INSERT,SELECT,UPDATE

-- Policies
create policy "Users can manage their own bag inventory" on public.bag_inventory as permissive for all to public
  using ((auth.uid() = user_id));

-- Triggers (run in name order)
CREATE TRIGGER update_bag_inventory_updated_at BEFORE UPDATE ON public.bag_inventory FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
