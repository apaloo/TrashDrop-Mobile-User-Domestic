-- Table public.team_invites
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

create table public.team_invites (
  id uuid not null default gen_random_uuid(),
  group_id uuid not null,
  token text not null,
  team_role text not null default 'member'::text,
  created_by uuid not null,
  created_at timestamp with time zone not null default now(),
  expires_at timestamp with time zone not null,
  max_uses integer not null default 25,
  uses integer not null default 0,
  revoked_at timestamp with time zone
);
alter table public.team_invites add constraint team_invites_group_id_fkey FOREIGN KEY (group_id) REFERENCES account_roles(user_id) ON DELETE CASCADE;
alter table public.team_invites add constraint team_invites_pkey PRIMARY KEY (id);
alter table public.team_invites add constraint team_invites_role_chk CHECK ((team_role = ANY (ARRAY['member'::text, 'admin'::text])));
alter table public.team_invites add constraint team_invites_token_key UNIQUE (token);
alter table public.team_invites add constraint team_invites_uses_chk CHECK (((max_uses >= 1) AND (max_uses <= 200) AND ((uses >= 0) AND (uses <= max_uses))));
CREATE INDEX team_invites_group_idx ON public.team_invites USING btree (group_id, created_at DESC);

-- Row level security: on
-- anon: no access
-- authenticated: no access
-- service_role: DELETE,INSERT,SELECT,UPDATE
