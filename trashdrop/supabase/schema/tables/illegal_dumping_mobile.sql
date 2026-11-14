-- Table public.illegal_dumping_mobile
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

create table public.illegal_dumping_mobile (
  id uuid not null default uuid_generate_v4(),
  reported_by uuid not null,
  location text not null,
  coordinates geometry(Point,4326) not null,
  waste_type text not null default 'mixed'::text,
  severity text not null default 'medium'::text,
  size text not null default 'medium'::text,
  photos text[] default ARRAY[]::text[],
  status text not null default 'pending'::text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  latitude numeric(10,8),
  longitude numeric(11,8),
  assigned_to uuid,
  location_hash text,
  idempotency_token text,
  submission_fingerprint text,
  disposed_at timestamp with time zone,
  disposal_site_id text,
  disposal_site_name text,
  cleanup_fee numeric,
  completed_at timestamp with time zone,
  area_name text,
  region text,
  district text,
  assigned_at timestamp with time zone,
  assigned_via text,
  cleanup_photos text[],
  fee_paid_by text
);
alter table public.illegal_dumping_mobile add constraint illegal_dumping_mobile_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES collector_profiles(id);
alter table public.illegal_dumping_mobile add constraint illegal_dumping_mobile_assigned_via_check CHECK (((assigned_via IS NULL) OR (assigned_via = ANY (ARRAY['admin'::text, 'claim'::text]))));
alter table public.illegal_dumping_mobile add constraint illegal_dumping_mobile_disposal_site_id_fkey FOREIGN KEY (disposal_site_id) REFERENCES disposal_centers(id);
alter table public.illegal_dumping_mobile add constraint illegal_dumping_mobile_fee_paid_by_check CHECK ((fee_paid_by = ANY (ARRAY['trashdrop'::text, 'mmda'::text])));
alter table public.illegal_dumping_mobile add constraint illegal_dumping_mobile_pkey PRIMARY KEY (id);
alter table public.illegal_dumping_mobile add constraint illegal_dumping_mobile_severity_check CHECK ((severity = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text])));
alter table public.illegal_dumping_mobile add constraint illegal_dumping_mobile_size_check CHECK ((size = ANY (ARRAY['small'::text, 'medium'::text, 'large'::text])));
alter table public.illegal_dumping_mobile add constraint illegal_dumping_mobile_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'verified'::text, 'in_progress'::text, 'completed'::text, 'disposed'::text, 'cancelled'::text])));
CREATE INDEX idx_illegal_dumping_mobile_coordinates ON public.illegal_dumping_mobile USING btree (latitude, longitude);
CREATE INDEX idx_illegal_dumping_mobile_disposed ON public.illegal_dumping_mobile USING btree (assigned_to) WHERE (status = 'disposed'::text);
CREATE INDEX idx_illegal_dumping_reporter_created ON public.illegal_dumping_mobile USING btree (reported_by, created_at DESC);
CREATE INDEX idx_illegal_dumping_reporter_severity ON public.illegal_dumping_mobile USING btree (reported_by, severity);
CREATE INDEX illegal_dumping_mobile_claimable_idx ON public.illegal_dumping_mobile USING btree (region, district) WHERE ((status = 'verified'::text) AND (assigned_to IS NULL));
CREATE INDEX illegal_dumping_mobile_coordinates_idx ON public.illegal_dumping_mobile USING gist (coordinates);
CREATE INDEX illegal_dumping_mobile_district_idx ON public.illegal_dumping_mobile USING btree (district);
CREATE INDEX illegal_dumping_mobile_fingerprint_idx ON public.illegal_dumping_mobile USING btree (submission_fingerprint) WHERE (submission_fingerprint IS NOT NULL);
CREATE UNIQUE INDEX illegal_dumping_mobile_idempotency_token_idx ON public.illegal_dumping_mobile USING btree (idempotency_token) WHERE (idempotency_token IS NOT NULL);
CREATE INDEX illegal_dumping_mobile_location_hash_idx ON public.illegal_dumping_mobile USING btree (location_hash);
CREATE INDEX illegal_dumping_mobile_region_idx ON public.illegal_dumping_mobile USING btree (region);

-- Row level security: on
-- anon: DELETE,INSERT,SELECT,UPDATE
-- authenticated: DELETE,INSERT,SELECT,UPDATE
-- service_role: DELETE,INSERT,SELECT,UPDATE

-- Policies
create policy "Allow all for service role" on public.illegal_dumping_mobile as permissive for all to service_role
  using (true)
  with check (true);
create policy "td_dumping_delete" on public.illegal_dumping_mobile as permissive for delete to authenticated
  using (td_is_staff());
create policy "td_dumping_insert" on public.illegal_dumping_mobile as permissive for insert to authenticated
  with check (((reported_by = auth.uid()) OR td_can_manage_requests()));
create policy "td_dumping_read" on public.illegal_dumping_mobile as permissive for select to authenticated
  using (((reported_by = auth.uid()) OR td_can_manage_requests() OR (assigned_to IN ( SELECT td_my_collector_profile_ids() AS td_my_collector_profile_ids)) OR ((td_my_role() <> 'media'::text) AND td_in_my_area(region, district))));
create policy "td_dumping_update" on public.illegal_dumping_mobile as permissive for update to authenticated
  using ((td_can_manage_requests() OR (assigned_to IN ( SELECT td_my_collector_profile_ids() AS td_my_collector_profile_ids)) OR ((reported_by = auth.uid()) AND (status = 'pending'::text))))
  with check ((td_can_manage_requests() OR (assigned_to IN ( SELECT td_my_collector_profile_ids() AS td_my_collector_profile_ids)) OR ((reported_by = auth.uid()) AND (status = ANY (ARRAY['pending'::text, 'cancelled'::text])))));

-- Triggers (run in name order)
CREATE TRIGGER aa_td_guard_insert BEFORE INSERT ON public.illegal_dumping_mobile FOR EACH ROW EXECUTE FUNCTION td_guard_dumping_insert();
CREATE TRIGGER aa_td_guard_update BEFORE UPDATE ON public.illegal_dumping_mobile FOR EACH ROW EXECUTE FUNCTION td_guard_dumping_update();
CREATE TRIGGER ab_td_guard_cleanup_fee BEFORE INSERT OR UPDATE ON public.illegal_dumping_mobile FOR EACH ROW EXECUTE FUNCTION td_guard_cleanup_fee();
CREATE TRIGGER enforce_illegal_dumping_status_flow BEFORE UPDATE OF status ON public.illegal_dumping_mobile FOR EACH ROW EXECUTE FUNCTION enforce_illegal_dumping_status_flow();
CREATE TRIGGER reject_local_dumping_photos BEFORE INSERT OR UPDATE OF photos ON public.illegal_dumping_mobile FOR EACH ROW EXECUTE FUNCTION reject_local_dumping_photos();
CREATE TRIGGER set_illegal_dumping_completed_at BEFORE INSERT OR UPDATE OF status ON public.illegal_dumping_mobile FOR EACH ROW EXECUTE FUNCTION set_illegal_dumping_completed_at();
CREATE TRIGGER td_dumping_activity_insert AFTER INSERT ON public.illegal_dumping_mobile FOR EACH ROW EXECUTE FUNCTION td_dumping_activity();
CREATE TRIGGER td_dumping_activity_update AFTER UPDATE ON public.illegal_dumping_mobile FOR EACH ROW WHEN (((old.status IS DISTINCT FROM new.status) OR (old.assigned_to IS DISTINCT FROM new.assigned_to))) EXECUTE FUNCTION td_dumping_activity();
CREATE TRIGGER td_stamp_assignment BEFORE INSERT OR UPDATE ON public.illegal_dumping_mobile FOR EACH ROW EXECUTE FUNCTION td_stamp_assignment();
CREATE TRIGGER td_tag_area BEFORE INSERT OR UPDATE ON public.illegal_dumping_mobile FOR EACH ROW EXECUTE FUNCTION td_tag_area();
CREATE TRIGGER trg_prevent_duplicate_dumping_reports_simple BEFORE INSERT ON public.illegal_dumping_mobile FOR EACH ROW EXECUTE FUNCTION prevent_duplicate_dumping_reports_simple();
CREATE TRIGGER trg_set_dumping_location_hash_simple BEFORE INSERT ON public.illegal_dumping_mobile FOR EACH ROW EXECUTE FUNCTION set_dumping_location_hash_simple();
CREATE TRIGGER update_illegal_dumping_mobile_updated_at BEFORE UPDATE ON public.illegal_dumping_mobile FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
