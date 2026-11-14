-- Table public.performance_metrics
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

create table public.performance_metrics (
  key text not null,
  label text not null,
  description text,
  roles text[] not null,
  calc text not null,
  params jsonb not null default '{}'::jsonb,
  unit text not null default 'count'::text,
  higher_is_better boolean,
  target numeric,
  sort_order integer not null default 100,
  enabled boolean not null default true,
  updated_at timestamp with time zone not null default now(),
  updated_by uuid
);
alter table public.performance_metrics add constraint performance_metrics_calc_chk CHECK (td_valid_metric(calc, params));
alter table public.performance_metrics add constraint performance_metrics_key_chk CHECK ((key ~ '^[a-z][a-z0-9_]{2,40}$'::text));
alter table public.performance_metrics add constraint performance_metrics_label_chk CHECK (((length(btrim(label)) >= 2) AND (length(btrim(label)) <= 80)));
alter table public.performance_metrics add constraint performance_metrics_pkey PRIMARY KEY (key);
alter table public.performance_metrics add constraint performance_metrics_roles_chk CHECK (((cardinality(roles) > 0) AND (roles <@ ARRAY['user'::text, 'volunteer'::text, 'media'::text, 'manager'::text, 'authority'::text])));
alter table public.performance_metrics add constraint performance_metrics_unit_chk CHECK ((unit = ANY (ARRAY['count'::text, 'percent'::text, 'minutes'::text, 'hours'::text])));

-- Row level security: on
-- anon: no access
-- authenticated: DELETE,INSERT,SELECT,UPDATE
-- service_role: DELETE,INSERT,SELECT,UPDATE

-- Policies
create policy "performance_metrics: staff" on public.performance_metrics as permissive for all to authenticated
  using (td_is_staff())
  with check (td_is_staff());

-- Triggers (run in name order)
CREATE TRIGGER td_performance_metrics_changed AFTER INSERT OR DELETE OR UPDATE ON public.performance_metrics FOR EACH STATEMENT EXECUTE FUNCTION td_performance_metrics_changed();
