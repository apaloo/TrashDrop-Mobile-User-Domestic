-- Table public.bin_reminder_plans
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

create table public.bin_reminder_plans (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  source_bin_id uuid,
  location_id uuid,
  frequency text not null,
  start_date date not null,
  occurrence integer not null default 1,
  next_due_date date not null,
  preferred_time text not null default 'morning'::text,
  bin_size_liters integer,
  waste_type text,
  bag_count integer not null default 1,
  notes text,
  status text not null default 'active'::text,
  stopped_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);
alter table public.bin_reminder_plans add constraint bin_reminder_plans_bag_count_check CHECK ((bag_count >= 1));
alter table public.bin_reminder_plans add constraint bin_reminder_plans_frequency_check CHECK ((frequency = ANY (ARRAY['weekly'::text, 'biweekly'::text, 'monthly'::text])));
alter table public.bin_reminder_plans add constraint bin_reminder_plans_location_id_fkey FOREIGN KEY (location_id) REFERENCES bin_locations(id) ON DELETE SET NULL;
alter table public.bin_reminder_plans add constraint bin_reminder_plans_occurrence_check CHECK ((occurrence >= 1));
alter table public.bin_reminder_plans add constraint bin_reminder_plans_pkey PRIMARY KEY (id);
alter table public.bin_reminder_plans add constraint bin_reminder_plans_preferred_time_check CHECK ((preferred_time = ANY (ARRAY['morning'::text, 'afternoon'::text, 'evening'::text])));
alter table public.bin_reminder_plans add constraint bin_reminder_plans_source_bin_id_fkey FOREIGN KEY (source_bin_id) REFERENCES digital_bins(id) ON DELETE SET NULL;
alter table public.bin_reminder_plans add constraint bin_reminder_plans_source_bin_id_key UNIQUE (source_bin_id);
alter table public.bin_reminder_plans add constraint bin_reminder_plans_status_check CHECK ((status = ANY (ARRAY['active'::text, 'stopped'::text])));
alter table public.bin_reminder_plans add constraint bin_reminder_plans_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX bin_reminder_plans_due_idx ON public.bin_reminder_plans USING btree (next_due_date) WHERE (status = 'active'::text);
CREATE INDEX bin_reminder_plans_user_idx ON public.bin_reminder_plans USING btree (user_id);

-- Row level security: on
-- anon: no access
-- authenticated: SELECT
-- service_role: DELETE,INSERT,SELECT,UPDATE

-- Policies
create policy "Users read their own reminder plans" on public.bin_reminder_plans as permissive for select to authenticated
  using ((user_id = ( SELECT auth.uid() AS uid)));
