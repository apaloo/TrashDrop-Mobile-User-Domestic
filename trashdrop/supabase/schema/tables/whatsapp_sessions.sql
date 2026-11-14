-- Table public.whatsapp_sessions
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

create table public.whatsapp_sessions (
  id uuid not null default gen_random_uuid(),
  whatsapp_user_id uuid not null,
  phone text not null,
  state text not null default 'idle'::text,
  collected_data jsonb default '{}'::jsonb,
  last_message_at timestamp with time zone default now(),
  expires_at timestamp with time zone default (now() + '00:30:00'::interval),
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);
alter table public.whatsapp_sessions add constraint whatsapp_sessions_pkey PRIMARY KEY (id);
alter table public.whatsapp_sessions add constraint whatsapp_sessions_whatsapp_user_id_fkey FOREIGN KEY (whatsapp_user_id) REFERENCES whatsapp_users(id) ON DELETE CASCADE;
CREATE INDEX idx_whatsapp_sessions_phone_active ON public.whatsapp_sessions USING btree (phone, state, expires_at DESC);

-- Row level security: on
-- anon: DELETE,INSERT,SELECT,UPDATE
-- authenticated: DELETE,INSERT,SELECT,UPDATE
-- service_role: DELETE,INSERT,SELECT,UPDATE
