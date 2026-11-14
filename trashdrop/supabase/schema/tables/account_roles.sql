-- Table public.account_roles
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

create table public.account_roles (
  user_id uuid not null,
  company_type text,
  org_name text,
  requested_role text not null default 'user'::text,
  role text not null default 'user'::text,
  status text not null default 'approved'::text,
  region text,
  district text,
  details jsonb not null default '{}'::jsonb,
  review_note text,
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);
alter table public.account_roles add constraint account_roles_pkey PRIMARY KEY (user_id);
alter table public.account_roles add constraint account_roles_requested_chk CHECK ((requested_role = ANY (ARRAY['user'::text, 'volunteer'::text, 'media'::text, 'manager'::text, 'authority'::text])));
alter table public.account_roles add constraint account_roles_role_chk CHECK ((role = ANY (ARRAY['user'::text, 'volunteer'::text, 'media'::text, 'manager'::text, 'authority'::text])));
alter table public.account_roles add constraint account_roles_status_chk CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])));
alter table public.account_roles add constraint account_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX account_roles_status_idx ON public.account_roles USING btree (status, created_at DESC);

-- Row level security: on
-- anon: no access
-- authenticated: DELETE,INSERT,SELECT,UPDATE
-- service_role: DELETE,INSERT,SELECT,UPDATE

-- Policies
create policy "account_roles_read" on public.account_roles as permissive for select to authenticated
  using (((user_id = auth.uid()) OR td_is_staff()));
