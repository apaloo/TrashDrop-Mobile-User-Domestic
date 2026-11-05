-- Profiles: each user may create and edit only their own row, and may not
-- set their own role, points, level or phone_verified.
--
-- Before: "Enable insert/update for authenticated users" were USING (true) /
-- WITH CHECK (true), so any signed-in user could rewrite anyone's name,
-- phone, address or photo, and the anon role held full table grants.
--
-- Who still writes profiles after this:
--   * the signed-in user, on their own row (Personal Info, Preferences,
--     Notifications, dark mode, profile photo)
--   * service_role (Netlify functions, admin tooling) and SECURITY DEFINER
--     database functions: they bypass RLS and the column guard below
-- Staff are recognised by td_is_staff() (admin email list), not by
-- profiles.role, so nothing here changes staff access.
-- Reading is unchanged ("Enable read access for authenticated users").

drop policy if exists "Enable insert for authenticated users" on public.profiles;
drop policy if exists "Enable update for authenticated users" on public.profiles;

drop policy if exists "Users create their own profile" on public.profiles;
create policy "Users create their own profile"
  on public.profiles for insert
  to authenticated
  with check (id = (select auth.uid()));

drop policy if exists "Users update their own profile" on public.profiles;
create policy "Users update their own profile"
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Signed-out visitors never write profiles; nobody empties the table via the API
revoke insert, update, delete, truncate, references, trigger on public.profiles from anon;
revoke delete, truncate, references, trigger on public.profiles from authenticated;

-- Columns a user must not set on themselves. Requests straight from the app
-- run as the anon/authenticated role; trusted code (service_role, SECURITY
-- DEFINER functions owned by postgres) runs as another role and is not limited.
create or replace function public.td_guard_profile_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.role := 'user';
    new.points := 0;
    new.level := 'Eco Starter';
    new.phone_verified := false;
  else
    new.role := old.role;
    new.points := old.points;
    new.level := old.level;
    new.phone_verified := old.phone_verified;
  end if;
  return new;
end;
$$;

drop trigger if exists td_guard_profile_columns on public.profiles;
create trigger td_guard_profile_columns
  before insert or update on public.profiles
  for each row execute function public.td_guard_profile_columns();
