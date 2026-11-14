-- Table public.account_activity
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

create table public.account_activity (
  id bigint not null,
  account_id uuid not null,
  account_role text,
  activity text not null,
  entity_type text not null default 'illegal_dumping'::text,
  entity_id text not null,
  region text,
  district text,
  value numeric,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamp with time zone not null default now(),
  dedupe_key text,
  team_id uuid
);
alter table public.account_activity add constraint account_activity_activity_chk CHECK ((activity = ANY (ARRAY['report.created'::text, 'report.verified'::text, 'cleanup.assigned'::text, 'cleanup.received'::text, 'cleanup.claimed'::text, 'cleanup.released'::text, 'cleanup.claim_expired'::text, 'cleanup.started'::text, 'cleanup.completed'::text, 'cleanup.marked_cleaned'::text])));
alter table public.account_activity add constraint account_activity_dedupe_key_key UNIQUE (dedupe_key);
alter table public.account_activity add constraint account_activity_pkey PRIMARY KEY (id);
CREATE INDEX account_activity_account_idx ON public.account_activity USING btree (account_id, occurred_at DESC);
CREATE INDEX account_activity_activity_idx ON public.account_activity USING btree (activity, occurred_at DESC);
CREATE INDEX account_activity_area_idx ON public.account_activity USING btree (region, district, occurred_at DESC);
CREATE INDEX account_activity_team_idx ON public.account_activity USING btree (team_id, occurred_at DESC) WHERE (team_id IS NOT NULL);

-- Row level security: on
-- anon: no access
-- authenticated: SELECT
-- service_role: DELETE,INSERT,SELECT,UPDATE

-- Policies
create policy "account_activity: staff read" on public.account_activity as permissive for select to authenticated
  using (td_is_staff());
