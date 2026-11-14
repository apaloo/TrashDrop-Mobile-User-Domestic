-- Table public.collector_tips
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

create table public.collector_tips (
  id uuid not null default gen_random_uuid(),
  collector_id uuid not null,
  request_id uuid,
  request_type character varying(50) default 'pickup_request'::character varying,
  amount numeric(10,2) not null default 0,
  user_id uuid,
  message text,
  created_at timestamp without time zone default now(),
  updated_at timestamp without time zone default now()
);
alter table public.collector_tips add constraint collector_tips_collector_id_fkey FOREIGN KEY (collector_id) REFERENCES auth.users(id);
alter table public.collector_tips add constraint collector_tips_pkey PRIMARY KEY (id);
alter table public.collector_tips add constraint collector_tips_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
CREATE INDEX idx_tips_collector ON public.collector_tips USING btree (collector_id, created_at);
CREATE INDEX idx_tips_request ON public.collector_tips USING btree (request_id);

-- Row level security: on
-- anon: DELETE,INSERT,SELECT,UPDATE
-- authenticated: DELETE,INSERT,SELECT,UPDATE
-- service_role: DELETE,INSERT,SELECT,UPDATE

-- Policies
create policy "view_own_tips" on public.collector_tips as permissive for select to authenticated
  using ((collector_id = auth.uid()));
