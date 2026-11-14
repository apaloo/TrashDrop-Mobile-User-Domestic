-- Table public.scheduled_pickups
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

create table public.scheduled_pickups (
  id uuid not null default uuid_generate_v4(),
  user_id uuid not null,
  location_id uuid not null,
  schedule_type text not null,
  waste_type text not null,
  bag_count integer not null,
  pickup_date timestamp with time zone not null,
  preferred_time text not null,
  special_instructions text,
  status text not null default 'scheduled'::text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  frequency text not null default 'weekly'::text,
  address text,
  cancelled_at timestamp with time zone,
  cancelled_by uuid,
  cancellation_reason text
);
alter table public.scheduled_pickups add constraint scheduled_pickups_frequency_check CHECK ((frequency = ANY (ARRAY['weekly'::text, 'biweekly'::text, 'monthly'::text])));
alter table public.scheduled_pickups add constraint scheduled_pickups_location_id_fkey FOREIGN KEY (location_id) REFERENCES locations(id);
alter table public.scheduled_pickups add constraint scheduled_pickups_pkey PRIMARY KEY (id);
alter table public.scheduled_pickups add constraint scheduled_pickups_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);

-- Row level security: on
-- anon: DELETE,INSERT,SELECT,UPDATE
-- authenticated: DELETE,INSERT,SELECT,UPDATE
-- service_role: DELETE,INSERT,SELECT,UPDATE

-- Policies
create policy "Users can manage their scheduled pickups" on public.scheduled_pickups as permissive for all to public
  using ((auth.uid() = user_id));

-- Triggers (run in name order)
CREATE TRIGGER td_audit_request AFTER INSERT OR UPDATE ON public.scheduled_pickups FOR EACH ROW EXECUTE FUNCTION td_audit_request();
CREATE TRIGGER update_scheduled_pickups_updated_at BEFORE UPDATE ON public.scheduled_pickups FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
