-- Stage 3 of 3: digital_bins and bin_payments, which collectors write.
--
-- Row level security was OFF on both. bin_payments holds customers' mobile
-- money numbers and collectors' account numbers; anyone with the public API
-- key could read and change it.
--
-- Who uses them (pg_stat_statements by role, pg_proc, app code on main):
--   digital_bins (digital_bins.collector_id holds the collector's login id)
--     household app  inserts its own bins, reads and updates its own
--                    (status, photo_urls, QR fields).
--     collector app  reads the open pool and its own jobs; UPDATEs bins it
--                    does not own: accept (status + collector_id), each status
--                    step, disposal, payouts, photos (Request.jsx,
--                    disposalService.js, DigitalBinPaymentModal.jsx).
--     admin portal   admin_pickup_requests (security_invoker) reads all bins.
--     database       pricing, claim, coverage, audit and notify triggers are
--                    SECURITY DEFINER or touch only NEW/OLD; not affected.
--                    The pricing triggers are protected and are not touched
--                    here.
--     The existing UPDATE rule is owner-only, so turning RLS on without the
--     rule below would stop collectors working on bins.
--   bin_payments (bin_payments.collector_id holds collector_profiles.id, not
--   the login id)
--     collector app  inserts its collection payments; reads and updates its
--                    own (status, gateway errors, retries); earnings read by
--                    its own bin ids.
--     household app, admin portal: none (admin figures come from SECURITY
--                    DEFINER functions).
--
-- What this does:
--   digital_bins
--     read    unchanged: existing own-row and signed-in read rules.
--     insert  unchanged: for yourself.
--     update  existing owner rule kept; added, the same paths pickup_requests
--             already allows: the assigned collector, an active collector
--             taking an unassigned pending/available bin, and admins and
--             managers (td_can_manage_requests). A collector may hand a bin
--             back to the open pool.
--     delete  none (no app deletes bins).
--   bin_payments
--     read, insert, update  the collector the payment belongs to
--                           (td_my_collector_profile_ids()); admins and
--                           managers read and update.
--   both     RLS on; anon and authenticated lose TRUNCATE, REFERENCES, TRIGGER.

create policy digital_bins_update_collector_or_staff on public.digital_bins
  for update to authenticated
  using (
    collector_id = auth.uid()
    or public.td_can_manage_requests()
    or (public.td_is_active_collector()
        and collector_id is null
        and lower(status) in ('pending', 'available'))
  )
  with check (
    collector_id = auth.uid()
    or public.td_can_manage_requests()
    or (public.td_is_active_collector()
        and collector_id is null
        and lower(status) in ('pending', 'available'))
  );

create policy bin_payments_read_own_or_staff on public.bin_payments
  for select to authenticated
  using (
    collector_id in (select public.td_my_collector_profile_ids())
    or public.td_can_manage_requests()
  );

create policy bin_payments_insert_own on public.bin_payments
  for insert to authenticated
  with check (collector_id in (select public.td_my_collector_profile_ids()));

create policy bin_payments_update_own_or_staff on public.bin_payments
  for update to authenticated
  using (
    collector_id in (select public.td_my_collector_profile_ids())
    or public.td_can_manage_requests()
  )
  with check (
    collector_id in (select public.td_my_collector_profile_ids())
    or public.td_can_manage_requests()
  );

alter table public.digital_bins enable row level security;
alter table public.bin_payments enable row level security;
revoke truncate, references, trigger on public.digital_bins, public.bin_payments from anon, authenticated;
