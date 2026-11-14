-- Table public.bin_reminders
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

create table public.bin_reminders (
  id uuid not null default gen_random_uuid(),
  plan_id uuid not null,
  user_id uuid not null,
  due_date date not null,
  status text not null default 'pending'::text,
  booked_bin_id uuid,
  created_at timestamp with time zone not null default now(),
  responded_at timestamp with time zone
);
alter table public.bin_reminders add constraint bin_reminders_booked_bin_id_fkey FOREIGN KEY (booked_bin_id) REFERENCES digital_bins(id) ON DELETE SET NULL;
alter table public.bin_reminders add constraint bin_reminders_pkey PRIMARY KEY (id);
alter table public.bin_reminders add constraint bin_reminders_plan_id_due_date_key UNIQUE (plan_id, due_date);
alter table public.bin_reminders add constraint bin_reminders_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES bin_reminder_plans(id) ON DELETE CASCADE;
alter table public.bin_reminders add constraint bin_reminders_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'booked'::text, 'skipped'::text, 'expired'::text])));
alter table public.bin_reminders add constraint bin_reminders_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX bin_reminders_user_pending_idx ON public.bin_reminders USING btree (user_id, due_date) WHERE (status = 'pending'::text);

-- Row level security: on
-- anon: no access
-- authenticated: SELECT
-- service_role: DELETE,INSERT,SELECT,UPDATE

-- Policies
create policy "Users read their own reminders" on public.bin_reminders as permissive for select to authenticated
  using ((user_id = ( SELECT auth.uid() AS uid)));
