-- Table public.digital_bins
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

create table public.digital_bins (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  location_id uuid not null,
  qr_code_url text not null,
  frequency character varying(50) not null default 'weekly'::character varying,
  waste_type character varying(50) not null default 'general'::character varying,
  bag_count integer not null default 1,
  details text,
  is_active boolean default true,
  expires_at timestamp with time zone not null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  collected_at timestamp with time zone,
  collector_id uuid,
  status text default 'pending'::text,
  bin_size_liters integer not null default 120,
  is_urgent boolean not null default false,
  fee numeric(10,2) default 0,
  collector_core_payout numeric(10,2) default 0,
  collector_urgent_payout numeric(10,2) default 0,
  collector_distance_payout numeric(10,2) default 0,
  collector_surge_payout numeric(10,2) default 0,
  collector_tips numeric(10,2) default 0,
  collector_recyclables_payout numeric(10,2) default 0,
  collector_loyalty_cashback numeric(10,2) default 0,
  collector_total_payout numeric(10,2) default 0,
  surge_multiplier numeric(4,2) default 1.0,
  deadhead_km numeric(10,2) default 0,
  disposed_at timestamp with time zone,
  disposal_site_id text,
  accepted_at timestamp with time zone,
  photo_urls text[],
  is_promotional boolean not null default false,
  promo_request_number integer,
  whatsapp_user_id uuid,
  cancelled_at timestamp with time zone,
  cancelled_by uuid,
  cancellation_reason text
);
alter table public.digital_bins add constraint check_bag_count CHECK (((bag_count >= 1) AND (bag_count <= 10)));
alter table public.digital_bins add constraint check_bin_size CHECK ((bin_size_liters = ANY (ARRAY[60, 80, 90, 100, 120, 240, 340, 360, 660, 1100])));
alter table public.digital_bins add constraint check_frequency CHECK (((frequency)::text = ANY (ARRAY[('one-time'::character varying)::text, ('weekly'::character varying)::text, ('biweekly'::character varying)::text, ('monthly'::character varying)::text])));
alter table public.digital_bins add constraint check_waste_type CHECK (((waste_type)::text = ANY (ARRAY[('general'::character varying)::text, ('recycling'::character varying)::text, ('organic'::character varying)::text])));
alter table public.digital_bins add constraint digital_bins_collector_id_fkey FOREIGN KEY (collector_id) REFERENCES auth.users(id);
alter table public.digital_bins add constraint digital_bins_disposal_site_id_fkey FOREIGN KEY (disposal_site_id) REFERENCES disposal_centers(id);
alter table public.digital_bins add constraint digital_bins_location_id_fkey FOREIGN KEY (location_id) REFERENCES bin_locations(id) ON DELETE CASCADE;
alter table public.digital_bins add constraint digital_bins_pkey PRIMARY KEY (id);
alter table public.digital_bins add constraint digital_bins_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'available'::text, 'accepted'::text, 'en_route'::text, 'arrived'::text, 'collecting'::text, 'completed'::text, 'disposed'::text, 'cancelled'::text, 'canceled'::text, 'expired'::text])));
alter table public.digital_bins add constraint digital_bins_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.digital_bins add constraint digital_bins_whatsapp_user_id_fkey FOREIGN KEY (whatsapp_user_id) REFERENCES whatsapp_users(id) ON DELETE SET NULL;
CREATE INDEX idx_digital_bins_bin_size ON public.digital_bins USING btree (bin_size_liters);
CREATE INDEX idx_digital_bins_collector_payout ON public.digital_bins USING btree (collector_id, collector_total_payout) WHERE (status = 'disposed'::text);
CREATE INDEX idx_digital_bins_collector_status ON public.digital_bins USING btree (collector_id, status) WHERE (status = 'disposed'::text);
CREATE INDEX idx_digital_bins_en_route ON public.digital_bins USING btree (collector_id) WHERE (status = ANY (ARRAY['accepted'::text, 'en_route'::text, 'arrived'::text]));
CREATE INDEX idx_digital_bins_expires_at ON public.digital_bins USING btree (expires_at);
CREATE INDEX idx_digital_bins_location_id ON public.digital_bins USING btree (location_id);
CREATE INDEX idx_digital_bins_urgent ON public.digital_bins USING btree (is_urgent, created_at) WHERE (is_urgent = true);
CREATE INDEX idx_digital_bins_user_id ON public.digital_bins USING btree (user_id);
CREATE INDEX idx_digital_bins_user_points ON public.digital_bins USING btree (user_id, created_at);
CREATE INDEX idx_digital_bins_user_promo_count ON public.digital_bins USING btree (user_id) WHERE (status <> ALL (ARRAY['cancelled'::text, 'expired'::text]));
CREATE INDEX idx_digital_bins_user_updated ON public.digital_bins USING btree (user_id, updated_at DESC);
CREATE INDEX idx_digital_bins_whatsapp_user_id ON public.digital_bins USING btree (whatsapp_user_id) WHERE (whatsapp_user_id IS NOT NULL);

-- Row level security: on
-- anon: DELETE,INSERT,SELECT,UPDATE
-- authenticated: DELETE,INSERT,SELECT,UPDATE
-- service_role: DELETE,INSERT,SELECT,UPDATE

-- Policies
create policy "Allow authenticated users to read digital_bins" on public.digital_bins as permissive for select to authenticated
  using (true);
create policy "digital_bins_update_collector_or_staff" on public.digital_bins as permissive for update to authenticated
  using (((collector_id = auth.uid()) OR td_can_manage_requests() OR (td_is_active_collector() AND (collector_id IS NULL) AND (lower(status) = ANY (ARRAY['pending'::text, 'available'::text])))))
  with check (((collector_id = auth.uid()) OR td_can_manage_requests() OR (td_is_active_collector() AND (collector_id IS NULL) AND (lower(status) = ANY (ARRAY['pending'::text, 'available'::text])))));
create policy "Users can create digital bins" on public.digital_bins as permissive for insert to public
  with check ((auth.uid() = user_id));
create policy "Users can update their own digital bins" on public.digital_bins as permissive for update to public
  using ((auth.uid() = user_id));
create policy "Users can view their own digital bins" on public.digital_bins as permissive for select to public
  using ((auth.uid() = user_id));

-- Triggers (run in name order)
CREATE TRIGGER ab_td_keep_booked_payout BEFORE UPDATE ON public.digital_bins FOR EACH ROW EXECUTE FUNCTION td_keep_booked_payout();
CREATE TRIGGER ab_td_manager_assign BEFORE INSERT OR UPDATE ON public.digital_bins FOR EACH ROW EXECUTE FUNCTION td_guard_manager_assign();
CREATE TRIGGER ac_td_record_bin_acceptance BEFORE UPDATE ON public.digital_bins FOR EACH ROW EXECUTE FUNCTION td_record_bin_acceptance();
CREATE TRIGGER digital_bins_enforce_coverage BEFORE INSERT OR UPDATE OF location_id ON public.digital_bins FOR EACH ROW EXECUTE FUNCTION enforce_digital_bin_coverage();
CREATE TRIGGER digital_bins_protect_price BEFORE UPDATE ON public.digital_bins FOR EACH ROW EXECUTE FUNCTION td_protect_digital_bin_price();
CREATE TRIGGER digital_bins_refund_promotion AFTER UPDATE OF status, is_active ON public.digital_bins FOR EACH ROW EXECUTE FUNCTION td_refund_promotion_on_cancel();
CREATE TRIGGER digital_bins_set_price BEFORE INSERT ON public.digital_bins FOR EACH ROW EXECUTE FUNCTION td_set_digital_bin_price();
CREATE TRIGGER enforce_pickup_status_flow BEFORE UPDATE OF status, collector_id ON public.digital_bins FOR EACH ROW EXECUTE FUNCTION enforce_pickup_status_flow();
CREATE TRIGGER require_active_collector_claim BEFORE INSERT OR UPDATE OF collector_id ON public.digital_bins FOR EACH ROW EXECUTE FUNCTION enforce_active_collector_claim();
CREATE TRIGGER td_audit_request AFTER INSERT OR UPDATE ON public.digital_bins FOR EACH ROW EXECUTE FUNCTION td_audit_request();
CREATE TRIGGER td_notify_household_on_status AFTER UPDATE OF status ON public.digital_bins FOR EACH ROW WHEN ((new.status IS DISTINCT FROM old.status)) EXECUTE FUNCTION td_notify_household_on_status();
CREATE TRIGGER trg_digital_bin_qr_code_url BEFORE INSERT OR UPDATE OF id ON public.digital_bins FOR EACH ROW EXECUTE FUNCTION set_digital_bin_qr_code_url();
CREATE TRIGGER trigger_digital_bin_collected AFTER UPDATE ON public.digital_bins FOR EACH ROW EXECUTE FUNCTION trigger_increment_on_digital_bin_collected();
CREATE TRIGGER validate_digital_bin_status BEFORE UPDATE OF status ON public.digital_bins FOR EACH ROW EXECUTE FUNCTION validate_digital_bin_status_transition();
