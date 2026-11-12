-- Applied on production 2026-11-12 (owner's approval). Direct inserts and
-- updates on bags, batches and scans are for staff only; everything else goes
-- through SECURITY DEFINER functions (admin_generate_batches,
-- activate_batch_for_user, scan_pickup_request_bag). Checked before applying:
-- no app depends on the old open rules (the remaining direct writes were dead
-- code or redundant), and batch activation works under the new ones.
drop policy if exists "Enable insert for authenticated users" on public.bags;
drop policy if exists "Enable update for authenticated users" on public.bags;
drop policy if exists "Enable insert for authenticated users" on public.batches;
drop policy if exists "Enable update for authenticated users" on public.batches;
drop policy if exists "Enable insert for authenticated users" on public.scans;
drop policy if exists "Enable update for authenticated users" on public.scans;
create policy bags_staff_insert on public.bags for insert to authenticated with check (public.td_is_staff());
create policy bags_staff_update on public.bags for update to authenticated using (public.td_is_staff()) with check (public.td_is_staff());
create policy batches_staff_insert on public.batches for insert to authenticated with check (public.td_is_staff());
create policy batches_staff_update on public.batches for update to authenticated using (public.td_is_staff()) with check (public.td_is_staff());
create policy scans_staff_insert on public.scans for insert to authenticated with check (public.td_is_staff());
create policy scans_staff_update on public.scans for update to authenticated using (public.td_is_staff()) with check (public.td_is_staff());
