-- Table public.whatsapp_users
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

create table public.whatsapp_users (
  id uuid not null default gen_random_uuid(),
  phone text not null,
  user_id uuid,
  display_name text,
  language text default 'en'::text,
  is_active boolean default true,
  total_bookings integer default 0,
  last_booking_at timestamp with time zone,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);
alter table public.whatsapp_users add constraint whatsapp_users_phone_key UNIQUE (phone);
alter table public.whatsapp_users add constraint whatsapp_users_pkey PRIMARY KEY (id);
alter table public.whatsapp_users add constraint whatsapp_users_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- Row level security: on
-- anon: DELETE,INSERT,SELECT,UPDATE
-- authenticated: DELETE,INSERT,SELECT,UPDATE
-- service_role: DELETE,INSERT,SELECT,UPDATE
