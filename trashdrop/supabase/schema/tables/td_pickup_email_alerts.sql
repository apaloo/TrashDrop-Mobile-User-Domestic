-- Table public.td_pickup_email_alerts
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

create table public.td_pickup_email_alerts (
  source text not null,
  request_id text not null,
  status text not null default 'pending'::text,
  attempts integer not null default 0,
  last_attempt_at timestamp with time zone,
  sent_at timestamp with time zone,
  last_error text,
  created_at timestamp with time zone not null default now()
);
alter table public.td_pickup_email_alerts add constraint td_pickup_email_alerts_pkey PRIMARY KEY (source, request_id);
alter table public.td_pickup_email_alerts add constraint td_pickup_email_alerts_source_check CHECK ((source = ANY (ARRAY['pickup_requests'::text, 'digital_bins'::text])));
alter table public.td_pickup_email_alerts add constraint td_pickup_email_alerts_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'sent'::text, 'failed'::text, 'skipped'::text])));
CREATE INDEX td_pickup_email_alerts_pending_idx ON public.td_pickup_email_alerts USING btree (created_at) WHERE (status = 'pending'::text);

-- Row level security: on
-- anon: no access
-- authenticated: no access
-- service_role: DELETE,INSERT,SELECT,UPDATE
