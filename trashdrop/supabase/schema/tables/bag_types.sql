-- Table public.bag_types
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

create table public.bag_types (
  plastic bigint,
  paper bigint,
  metal bigint,
  glass bigint,
  organic bigint,
  general bigint,
  recycling bigint
);

-- Row level security: on
-- anon: DELETE,INSERT,SELECT,UPDATE
-- authenticated: DELETE,INSERT,SELECT,UPDATE
-- service_role: DELETE,INSERT,SELECT,UPDATE
