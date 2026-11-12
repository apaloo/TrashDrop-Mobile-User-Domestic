-- Points can't be created by inserting rows directly (protected TrashDrop
-- Points, docs/POINTS.md; owner's approval 2026-11-12).
--
-- 1. Reward redemptions are created only by td_redeem_reward (cost and
--    balance checked on the server; the Rewards page uses it). Signed-in
--    users can no longer insert redemptions themselves, and a redemption
--    always spends a positive number of points.
-- 2. A dumping report created by a household starts as 'pending':
--    verification, assignment, cleanup fee and completion are set later by
--    staff and the workflow (td_guard_dumping_update covers changes), never
--    by the reporter at creation.

drop policy if exists "Users can insert their own redemptions" on public.rewards_redemption;
revoke insert on public.rewards_redemption from anon, authenticated;
alter table public.rewards_redemption
  add constraint rewards_redemption_points_positive check (points_spent > 0);

create or replace function public.td_guard_dumping_insert()
returns trigger language plpgsql security definer
set search_path to 'public' as $function$
begin
  if auth.uid() is null or public.td_can_manage_requests() then
    return new; -- service key or staff
  end if;
  new.status := 'pending';
  new.assigned_to := null;
  new.assigned_at := null;
  new.assigned_via := null;
  new.cleanup_fee := null;
  new.completed_at := null;
  new.disposed_at := null;
  new.disposal_site_id := null;
  new.disposal_site_name := null;
  new.cleanup_photos := null;
  return new;
end $function$;

revoke all on function public.td_guard_dumping_insert() from public, anon, authenticated;

drop trigger if exists aa_td_guard_insert on public.illegal_dumping_mobile;
create trigger aa_td_guard_insert before insert on public.illegal_dumping_mobile
  for each row execute function public.td_guard_dumping_insert();
