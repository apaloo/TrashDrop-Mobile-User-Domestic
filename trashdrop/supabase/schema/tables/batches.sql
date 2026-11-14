-- Table public.batches
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

create table public.batches (
  id uuid not null default gen_random_uuid(),
  batch_number text,
  bag_count integer not null default 0,
  status text default 'active'::text,
  notes text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  created_by uuid,
  batch_name text,
  total_batch_price numeric(12,2),
  unit_price numeric(10,2),
  is_locked boolean default false,
  type text,
  size text,
  qr_prefix text,
  generated_by uuid,
  archived boolean default false,
  archived_at timestamp with time zone,
  archived_by uuid
);
alter table public.batches add constraint batches_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
alter table public.batches add constraint batches_pkey PRIMARY KEY (id);
CREATE INDEX idx_batches_created_by ON public.batches USING btree (created_by);
CREATE INDEX idx_batches_created_by_updated ON public.batches USING btree (created_by, updated_at DESC);
CREATE INDEX idx_batches_status ON public.batches USING btree (status);

-- Row level security: on
-- anon: DELETE,INSERT,SELECT,UPDATE
-- authenticated: DELETE,INSERT,SELECT,UPDATE
-- service_role: DELETE,INSERT,SELECT,UPDATE

-- Policies
create policy "batches_staff_insert" on public.batches as permissive for insert to authenticated
  with check (td_is_staff());
create policy "batches_staff_update" on public.batches as permissive for update to authenticated
  using (td_is_staff())
  with check (td_is_staff());
create policy "Enable read access for authenticated users" on public.batches as permissive for select to authenticated
  using (true);

-- Triggers (run in name order)
CREATE TRIGGER td_audit_batch AFTER INSERT OR UPDATE ON public.batches FOR EACH ROW EXECUTE FUNCTION td_audit_batch();
CREATE TRIGGER td_batches_fill_details BEFORE INSERT ON public.batches FOR EACH ROW EXECUTE FUNCTION td_batches_fill_details();
CREATE TRIGGER trg_lock_batch_pricing BEFORE UPDATE ON public.batches FOR EACH ROW EXECUTE FUNCTION lock_batch_pricing();
CREATE TRIGGER trg_propagate_unit_price AFTER UPDATE OF unit_price ON public.batches FOR EACH ROW EXECUTE FUNCTION propagate_unit_price_to_bags();
CREATE TRIGGER update_batches_updated_at BEFORE UPDATE ON public.batches FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
