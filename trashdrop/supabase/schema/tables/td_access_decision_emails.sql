-- Table public.td_access_decision_emails
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

create table public.td_access_decision_emails (
  user_id uuid not null,
  reviewed_at timestamp with time zone not null,
  status text not null default 'pending'::text,
  attempts integer not null default 0,
  last_attempt_at timestamp with time zone,
  sent_at timestamp with time zone,
  last_error text,
  created_at timestamp with time zone not null default now()
);
alter table public.td_access_decision_emails add constraint td_access_decision_emails_pkey PRIMARY KEY (user_id, reviewed_at);
alter table public.td_access_decision_emails add constraint td_access_decision_emails_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'sent'::text, 'failed'::text, 'skipped'::text])));
CREATE INDEX td_access_decision_emails_pending_idx ON public.td_access_decision_emails USING btree (created_at) WHERE (status = 'pending'::text);

-- Row level security: on
-- anon: no access
-- authenticated: no access
-- service_role: DELETE,INSERT,SELECT,UPDATE
