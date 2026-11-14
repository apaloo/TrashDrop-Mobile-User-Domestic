-- Table public.logs
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

create table public.logs (
  id uuid not null default gen_random_uuid(),
  level character varying(20) not null default 'info'::character varying,
  source character varying(100),
  message text not null,
  data jsonb,
  user_id uuid,
  session_id character varying(255),
  ip_address inet,
  user_agent text,
  request_id character varying(255),
  module character varying(100),
  function_name character varying(100),
  line_number integer,
  stack_trace text,
  execution_time numeric(10,3),
  memory_usage bigint,
  created_at timestamp with time zone not null default now(),
  action text,
  entity_type text,
  entity_id text,
  actor_id uuid,
  actor_name text,
  actor_role text,
  before jsonb,
  after jsonb,
  metadata jsonb not null default '{}'::jsonb,
  is_sample boolean not null default false
);
alter table public.logs add constraint logs_level_check CHECK (((level)::text = ANY ((ARRAY['debug'::character varying, 'info'::character varying, 'warn'::character varying, 'error'::character varying, 'critical'::character varying])::text[])));
alter table public.logs add constraint logs_pkey PRIMARY KEY (id);
alter table public.logs add constraint logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX idx_logs_level ON public.logs USING btree (level);
CREATE INDEX idx_logs_session_id ON public.logs USING btree (session_id);
CREATE INDEX idx_logs_source ON public.logs USING btree (source);
CREATE INDEX idx_logs_user_id ON public.logs USING btree (user_id);
CREATE INDEX logs_action_idx ON public.logs USING btree (action);
CREATE INDEX logs_created_idx ON public.logs USING btree (created_at DESC);
CREATE INDEX logs_entity_idx ON public.logs USING btree (entity_id, created_at DESC);
CREATE INDEX logs_level_idx ON public.logs USING btree (level, created_at DESC);
CREATE INDEX logs_sample_idx ON public.logs USING btree (is_sample, created_at DESC);

-- Row level security: on
-- anon: SELECT
-- authenticated: SELECT
-- service_role: DELETE,INSERT,SELECT,UPDATE

-- Policies
create policy "logs: admins read" on public.logs as permissive for select to authenticated
  using (td_is_staff());

-- Triggers (run in name order)
CREATE TRIGGER td_logs_normalise BEFORE INSERT OR UPDATE ON public.logs FOR EACH ROW EXECUTE FUNCTION td_logs_normalise();
