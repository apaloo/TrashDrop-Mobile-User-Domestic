-- Table public.pickup_requests
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

create table public.pickup_requests (
  id text not null,
  location text not null,
  coordinates geography(Point,4326) not null,
  fee integer not null,
  status text not null,
  collector_id uuid,
  accepted_at timestamp with time zone,
  picked_up_at timestamp with time zone,
  disposed_at timestamp with time zone,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  waste_type text,
  bag_count bigint not null,
  special_instructions text,
  scheduled_date timestamp with time zone,
  preferred_time text,
  points_earned integer not null,
  payment_method_id uuid,
  payment_type text,
  priority text,
  reserved_by uuid,
  reserved_at timestamp with time zone,
  reserved_until timestamp with time zone,
  exclusion_until timestamp with time zone,
  assignment_expires_at timestamp with time zone,
  filter_criteria jsonb,
  last_pool_entry timestamp with time zone default now(),
  reservation_expires_at timestamp with time zone,
  estimated_volume numeric(10,2),
  assigned_to uuid,
  service_area_id uuid,
  user_id uuid,
  address text,
  bag_id uuid,
  batch_id uuid,
  collector_core_payout numeric(10,2) default NULL::numeric,
  collector_urgent_payout numeric(10,2) default NULL::numeric,
  collector_distance_payout numeric(10,2) default NULL::numeric,
  collector_surge_payout numeric(10,2) default NULL::numeric,
  collector_tips numeric(10,2) default NULL::numeric,
  collector_recyclables_payout numeric(10,2) default NULL::numeric,
  collector_loyalty_cashback numeric(10,2) default NULL::numeric,
  collector_total_payout numeric(10,2) default NULL::numeric,
  platform_share numeric(10,2) default NULL::numeric,
  payout_breakdown jsonb,
  cancelled_at timestamp with time zone,
  cancelled_by uuid,
  cancellation_reason text,
  region text,
  district text,
  disposal_site text,
  disposal_timestamp timestamp with time zone
);
alter table public.pickup_requests add constraint pickup_requests_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES collector_profiles(id) ON DELETE SET NULL;
alter table public.pickup_requests add constraint pickup_requests_assigned_to_profiles_fkey FOREIGN KEY (assigned_to) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.pickup_requests add constraint pickup_requests_bag_id_fkey FOREIGN KEY (bag_id) REFERENCES bags(id);
alter table public.pickup_requests add constraint pickup_requests_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES batches(id);
alter table public.pickup_requests add constraint pickup_requests_payment_method_fkey FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id);
alter table public.pickup_requests add constraint pickup_requests_payment_type_check CHECK ((payment_type = ANY (ARRAY['prepaid'::text, 'postpaid'::text])));
alter table public.pickup_requests add constraint pickup_requests_pkey PRIMARY KEY (id);
alter table public.pickup_requests add constraint pickup_requests_reserved_by_fkey FOREIGN KEY (reserved_by) REFERENCES auth.users(id);
alter table public.pickup_requests add constraint pickup_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'available'::text, 'accepted'::text, 'en_route'::text, 'arrived'::text, 'collecting'::text, 'completed'::text, 'disposed'::text, 'cancelled'::text, 'canceled'::text, 'expired'::text])));
alter table public.pickup_requests add constraint pickup_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id);
alter table public.pickup_requests add constraint valid_location_check CHECK (((location IS NULL) OR (location ~ '^POINT\(\-?\d+(\.\d+)? \-?\d+(\.\d+)?\)$'::text)));
CREATE INDEX idx_pickup_requests_assignment_expires_at ON public.pickup_requests USING btree (assignment_expires_at);
CREATE INDEX idx_pickup_requests_created_at ON public.pickup_requests USING btree (created_at);
CREATE INDEX idx_pickup_requests_disposed_payout ON public.pickup_requests USING btree (collector_id, collector_total_payout) WHERE (status = 'disposed'::text);
CREATE INDEX idx_pickup_requests_en_route ON public.pickup_requests USING btree (collector_id) WHERE (status = ANY (ARRAY['accepted'::text, 'en_route'::text, 'arrived'::text]));
CREATE INDEX idx_pickup_requests_exclusion_until ON public.pickup_requests USING btree (exclusion_until);
CREATE INDEX idx_pickup_requests_fee ON public.pickup_requests USING btree (fee);
CREATE INDEX idx_pickup_requests_priority ON public.pickup_requests USING btree (priority);
CREATE INDEX idx_pickup_requests_reserved_by ON public.pickup_requests USING btree (reserved_by);
CREATE INDEX idx_pickup_requests_reserved_until ON public.pickup_requests USING btree (reserved_until);
CREATE INDEX idx_pickup_requests_status ON public.pickup_requests USING btree (status);
CREATE INDEX idx_pickup_requests_user_id ON public.pickup_requests USING btree (user_id);
CREATE INDEX idx_pickup_requests_user_status_points ON public.pickup_requests USING btree (user_id, status, points_earned);
CREATE INDEX idx_pickup_requests_user_status_updated ON public.pickup_requests USING btree (user_id, status, updated_at DESC);
CREATE INDEX idx_pickup_requests_waste_type ON public.pickup_requests USING btree (waste_type);
CREATE INDEX pickup_requests_district_idx ON public.pickup_requests USING btree (district);
CREATE INDEX pickup_requests_region_idx ON public.pickup_requests USING btree (region);

-- Row level security: on
-- anon: DELETE,INSERT,SELECT,UPDATE
-- authenticated: DELETE,INSERT,SELECT,UPDATE
-- service_role: DELETE,INSERT,SELECT,UPDATE

-- Policies
create policy "td_request_insert" on public.pickup_requests as permissive for insert to authenticated
  with check (((user_id = auth.uid()) OR td_can_manage_requests()));
create policy "td_request_read" on public.pickup_requests as permissive for select to authenticated
  using (((user_id = auth.uid()) OR ((collector_id)::text = (auth.uid())::text) OR td_can_manage_requests() OR (td_is_active_collector() AND (((lower(status) = ANY (ARRAY['pending'::text, 'available'::text])) AND (collector_id IS NULL)) OR ((lower(status) = ANY (ARRAY['accepted'::text, 'en_route'::text, 'arrived'::text])) AND (assignment_expires_at < now()))))));
create policy "td_request_update" on public.pickup_requests as permissive for update to authenticated
  using (((user_id = auth.uid()) OR ((collector_id)::text = (auth.uid())::text) OR td_can_manage_requests() OR (td_is_active_collector() AND (((lower(status) = ANY (ARRAY['pending'::text, 'available'::text])) AND (collector_id IS NULL)) OR ((lower(status) = ANY (ARRAY['accepted'::text, 'en_route'::text, 'arrived'::text])) AND (assignment_expires_at < now()))))))
  with check (((user_id = auth.uid()) OR ((collector_id)::text = (auth.uid())::text) OR td_can_manage_requests() OR (td_is_active_collector() AND (collector_id IS NULL) AND (lower(status) = ANY (ARRAY['pending'::text, 'available'::text])))));

-- Triggers (run in name order)
CREATE TRIGGER aa_td_guard_write BEFORE INSERT OR UPDATE ON public.pickup_requests FOR EACH ROW EXECUTE FUNCTION td_guard_request_write();
CREATE TRIGGER ab_td_manager_assign BEFORE INSERT OR UPDATE ON public.pickup_requests FOR EACH ROW EXECUTE FUNCTION td_guard_manager_assign();
CREATE TRIGGER enforce_pickup_status_flow BEFORE UPDATE OF status, collector_id ON public.pickup_requests FOR EACH ROW EXECUTE FUNCTION enforce_pickup_status_flow();
CREATE TRIGGER ghana_location_coordinates BEFORE INSERT OR UPDATE OF coordinates ON public.pickup_requests FOR EACH ROW EXECUTE FUNCTION reject_location_outside_ghana('point', 'coordinates');
CREATE TRIGGER ghana_location_location BEFORE INSERT OR UPDATE OF location ON public.pickup_requests FOR EACH ROW EXECUTE FUNCTION reject_location_outside_ghana('point', 'location');
CREATE TRIGGER require_active_collector_claim BEFORE INSERT OR UPDATE OF collector_id ON public.pickup_requests FOR EACH ROW EXECUTE FUNCTION enforce_active_collector_claim();
CREATE TRIGGER td_audit_request AFTER INSERT OR UPDATE ON public.pickup_requests FOR EACH ROW EXECUTE FUNCTION td_audit_request();
CREATE TRIGGER td_notify_household_on_status AFTER UPDATE OF status ON public.pickup_requests FOR EACH ROW WHEN ((new.status IS DISTINCT FROM old.status)) EXECUTE FUNCTION td_notify_household_on_status();
CREATE TRIGGER td_tag_area BEFORE INSERT OR UPDATE ON public.pickup_requests FOR EACH ROW EXECUTE FUNCTION td_tag_area();
CREATE TRIGGER trigger_pickup_completed AFTER UPDATE ON public.pickup_requests FOR EACH ROW EXECUTE FUNCTION trigger_increment_on_pickup_completed();
CREATE TRIGGER validate_pickup_request_status BEFORE UPDATE OF status ON public.pickup_requests FOR EACH ROW EXECUTE FUNCTION validate_pickup_request_status_transition();
