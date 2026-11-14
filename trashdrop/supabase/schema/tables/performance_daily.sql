-- Table public.performance_daily
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

create table public.performance_daily (
  account_id uuid not null,
  metric_key text not null,
  day date not null,
  num numeric not null default 0,
  den numeric
);
alter table public.performance_daily add constraint performance_daily_metric_key_fkey FOREIGN KEY (metric_key) REFERENCES performance_metrics(key) ON UPDATE CASCADE ON DELETE CASCADE;
alter table public.performance_daily add constraint performance_daily_pkey PRIMARY KEY (account_id, metric_key, day);
CREATE INDEX performance_daily_metric_day_idx ON public.performance_daily USING btree (metric_key, day);

-- Row level security: on
-- anon: no access
-- authenticated: no access
-- service_role: DELETE,INSERT,SELECT,UPDATE
