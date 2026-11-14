-- Table public.team_members
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

create table public.team_members (
  group_id uuid not null,
  member_id uuid not null,
  team_role text not null default 'member'::text,
  status text not null default 'active'::text,
  invite_id uuid,
  joined_at timestamp with time zone not null default now(),
  ended_at timestamp with time zone,
  ended_by uuid
);
alter table public.team_members add constraint team_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES account_roles(user_id) ON DELETE CASCADE;
alter table public.team_members add constraint team_members_member_id_fkey FOREIGN KEY (member_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.team_members add constraint team_members_not_self_chk CHECK ((group_id <> member_id));
alter table public.team_members add constraint team_members_pkey PRIMARY KEY (group_id, member_id);
alter table public.team_members add constraint team_members_role_chk CHECK ((team_role = ANY (ARRAY['member'::text, 'admin'::text])));
alter table public.team_members add constraint team_members_status_chk CHECK ((status = ANY (ARRAY['active'::text, 'removed'::text, 'left'::text])));
CREATE INDEX team_members_group_idx ON public.team_members USING btree (group_id) WHERE (status = 'active'::text);
CREATE UNIQUE INDEX team_members_one_active_idx ON public.team_members USING btree (member_id) WHERE (status = 'active'::text);

-- Row level security: on
-- anon: no access
-- authenticated: no access
-- service_role: DELETE,INSERT,SELECT,UPDATE
