-- Applied on production 2026-11-12 (owner's approval), recorded version 20261112102236.
-- TD50: write policies say whose rows they are for (secure development
-- principle 10). Legitimate writers were checked across all three apps and
-- the Edge/Netlify functions, and the change was tested rolled back as a
-- signed-in user and as a signed-out visitor first. After it, the security
-- watch's count of open write policies is 0.

-- WhatsApp tables: only the Netlify functions use them, with the service key
-- (which bypasses row-level security). The "service role" policies applied to
-- every role; remove them, leaving the tables closed to app users.
drop policy if exists "Service role full access on whatsapp_users" on public.whatsapp_users;
drop policy if exists "Service role full access on whatsapp_sessions" on public.whatsapp_sessions;

-- Service areas: the admin site only reads them.
drop policy if exists "Enable insert for authenticated users" on public.service_areas;
drop policy if exists "Enable update for authenticated users" on public.service_areas;
create policy service_areas_staff_insert on public.service_areas for insert to authenticated with check (public.td_is_staff());
create policy service_areas_staff_update on public.service_areas for update to authenticated using (public.td_is_staff()) with check (public.td_is_staff());

-- Messages (admin site): the sender writes, the recipient marks read; each
-- person reads only their own conversations.
drop policy if exists "Enable insert for authenticated users" on public.messages;
drop policy if exists "Enable update for authenticated users" on public.messages;
drop policy if exists "Enable read access for authenticated users" on public.messages;
create policy messages_read_own on public.messages for select to authenticated
  using (sender_id = auth.uid() or recipient_id = auth.uid() or public.td_is_staff());
create policy messages_send_own on public.messages for insert to authenticated
  with check (sender_id = auth.uid());
create policy messages_recipient_update on public.messages for update to authenticated
  using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());

-- Dumping report details (household app): only for the reporter's own report.
drop policy if exists "Users can insert dumping reports mobile" on public.dumping_reports_mobile;
create policy dumping_reports_mobile_insert_own on public.dumping_reports_mobile for insert to authenticated
  with check (public.td_can_manage_requests() or exists (
    select 1 from public.illegal_dumping_mobile d where d.id = dumping_id and d.reported_by = auth.uid()));

-- Legacy dumping_reports (household offline sync): own rows only.
drop policy if exists "Users can insert dumping reports" on public.dumping_reports;
create policy dumping_reports_insert_own on public.dumping_reports for insert to authenticated
  with check (user_id = auth.uid());

-- Authority assignments: created by staff (the collector app only updates them).
drop policy if exists "Allow authenticated users to create assignments" on public.authority_assignments;
create policy authority_assignments_staff_insert on public.authority_assignments for insert to authenticated
  with check (public.td_is_staff());
