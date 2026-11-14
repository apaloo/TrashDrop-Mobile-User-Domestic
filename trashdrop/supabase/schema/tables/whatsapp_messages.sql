-- Table public.whatsapp_messages
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

create table public.whatsapp_messages (
  message_id text not null,
  phone text not null,
  received_at timestamp with time zone not null default now()
);
alter table public.whatsapp_messages add constraint whatsapp_messages_pkey PRIMARY KEY (message_id);
CREATE INDEX idx_whatsapp_messages_received_at ON public.whatsapp_messages USING btree (received_at);

-- Row level security: on
-- anon: DELETE,INSERT,SELECT,UPDATE
-- authenticated: DELETE,INSERT,SELECT,UPDATE
-- service_role: DELETE,INSERT,SELECT,UPDATE
