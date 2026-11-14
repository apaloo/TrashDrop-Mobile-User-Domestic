-- Table public.logs_archive
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

create table public.logs_archive (
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
  is_sample boolean not null default false,
  archived_at timestamp with time zone default now()
);

-- Row level security: on
-- anon: no access
-- authenticated: no access
-- service_role: DELETE,INSERT,SELECT,UPDATE
