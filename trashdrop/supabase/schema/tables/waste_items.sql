-- Table public.waste_items
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

create table public.waste_items (
  id uuid not null default gen_random_uuid(),
  type character varying(50) not null,
  weight numeric(10,2),
  volume numeric(10,2),
  unit character varying(20) default 'kg'::character varying,
  pickup_request_id text,
  batch_id uuid,
  collector_id uuid,
  location text,
  coordinates jsonb,
  status character varying(30) default 'collected'::character varying,
  notes text,
  photos jsonb,
  environmental_impact_score integer,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);
alter table public.waste_items add constraint waste_items_environmental_impact_score_check CHECK (((environmental_impact_score >= 0) AND (environmental_impact_score <= 100)));
alter table public.waste_items add constraint waste_items_pkey PRIMARY KEY (id);
alter table public.waste_items add constraint waste_items_status_check CHECK (((status)::text = ANY ((ARRAY['collected'::character varying, 'sorted'::character varying, 'disposed'::character varying, 'recycled'::character varying, 'processed'::character varying])::text[])));
alter table public.waste_items add constraint waste_items_type_check CHECK (((type)::text = ANY ((ARRAY['plastic'::character varying, 'paper'::character varying, 'glass'::character varying, 'metal'::character varying, 'organic'::character varying, 'electronic'::character varying, 'hazardous'::character varying, 'mixed'::character varying, 'recyclable'::character varying, 'general'::character varying])::text[])));
alter table public.waste_items add constraint waste_items_unit_check CHECK (((unit)::text = ANY ((ARRAY['kg'::character varying, 'lbs'::character varying, 'tons'::character varying, 'liters'::character varying, 'm3'::character varying])::text[])));
CREATE INDEX idx_waste_items_batch_id ON public.waste_items USING btree (batch_id);
CREATE INDEX idx_waste_items_collector_id ON public.waste_items USING btree (collector_id);
CREATE INDEX idx_waste_items_created_at ON public.waste_items USING btree (created_at DESC);
CREATE INDEX idx_waste_items_pickup_request_id ON public.waste_items USING btree (pickup_request_id);
CREATE INDEX idx_waste_items_type ON public.waste_items USING btree (type);

-- Row level security: on
-- anon: DELETE,INSERT,SELECT,UPDATE
-- authenticated: DELETE,INSERT,SELECT,UPDATE
-- service_role: DELETE,INSERT,SELECT,UPDATE

-- Policies
create policy "Anyone can view waste items" on public.waste_items as permissive for select to public
  using ((auth.role() = 'authenticated'::text));
create policy "Authenticated users can manage waste items" on public.waste_items as permissive for all to public
  using ((auth.role() = 'authenticated'::text));

-- Triggers (run in name order)
CREATE TRIGGER update_waste_items_updated_at BEFORE UPDATE ON public.waste_items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
