-- Table public.coverage_waitlist
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

create table public.coverage_waitlist (
  id uuid not null default gen_random_uuid(),
  user_id uuid,
  whatsapp_user_id uuid,
  channel text not null,
  latitude double precision not null,
  longitude double precision not null,
  address text,
  wants_notification boolean not null default false,
  nearest_zone_id uuid,
  nearest_zone_km numeric,
  request_count integer not null default 1,
  created_at timestamp with time zone not null default now(),
  last_requested_at timestamp with time zone not null default now(),
  closed_at timestamp with time zone,
  close_reason text
);
alter table public.coverage_waitlist add constraint coverage_waitlist_channel_check CHECK ((channel = ANY (ARRAY['app'::text, 'whatsapp'::text])));
alter table public.coverage_waitlist add constraint coverage_waitlist_check CHECK (((user_id IS NOT NULL) OR (whatsapp_user_id IS NOT NULL)));
alter table public.coverage_waitlist add constraint coverage_waitlist_close_reason_check CHECK ((close_reason = ANY (ARRAY['booked'::text, 'dismissed'::text])));
alter table public.coverage_waitlist add constraint coverage_waitlist_latitude_check CHECK (((latitude >= ('-90'::integer)::double precision) AND (latitude <= (90)::double precision)));
alter table public.coverage_waitlist add constraint coverage_waitlist_longitude_check CHECK (((longitude >= ('-180'::integer)::double precision) AND (longitude <= (180)::double precision)));
alter table public.coverage_waitlist add constraint coverage_waitlist_nearest_zone_id_fkey FOREIGN KEY (nearest_zone_id) REFERENCES pricing_zones(id) ON DELETE SET NULL;
alter table public.coverage_waitlist add constraint coverage_waitlist_pkey PRIMARY KEY (id);
alter table public.coverage_waitlist add constraint coverage_waitlist_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.coverage_waitlist add constraint coverage_waitlist_whatsapp_user_id_fkey FOREIGN KEY (whatsapp_user_id) REFERENCES whatsapp_users(id) ON DELETE CASCADE;
CREATE INDEX idx_coverage_waitlist_open_user ON public.coverage_waitlist USING btree (user_id) WHERE (closed_at IS NULL);
CREATE INDEX idx_coverage_waitlist_open_whatsapp ON public.coverage_waitlist USING btree (whatsapp_user_id) WHERE (closed_at IS NULL);

-- Row level security: on
-- anon: no access
-- authenticated: DELETE,INSERT,SELECT,UPDATE
-- service_role: DELETE,INSERT,SELECT,UPDATE

-- Policies
create policy "Users can view their own waitlist entries" on public.coverage_waitlist as permissive for select to authenticated
  using ((auth.uid() = user_id));
