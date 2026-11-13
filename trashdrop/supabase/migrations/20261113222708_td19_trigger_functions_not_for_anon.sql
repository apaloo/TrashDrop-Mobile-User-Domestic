-- TD19 (database security stage 2): signed-out callers lose EXECUTE on 17
-- SECURITY DEFINER trigger functions. Least privilege, as the Supabase
-- security advisor recommends (lint 0028 anon_security_definer_function_
-- executable): a trigger function can't usefully be called through the API,
-- and PostgreSQL checks EXECUTE on a trigger function only when the trigger
-- is created, not when it fires. Checked in production first on 2026-11-13: a
-- role without EXECUTE still fired a SECURITY DEFINER trigger (rolled back).
-- So nothing changes for any user; signed-in users and the service role keep
-- their grants.
--
-- Left as they are: td_guard_request_write (protected points rules),
-- create_promotional_usage_on_signup (protected promotions area) and
-- td_account_role_on_signup (in the security watch's access fingerprints).
-- No deletions.
revoke execute on function public.collector_profiles_clean_contact() from public, anon;
revoke execute on function public.enforce_active_collector_claim() from public, anon;
revoke execute on function public.link_whatsapp_user_on_profile_update() from public, anon;
revoke execute on function public.log_collector_status_change() from public, anon;
revoke execute on function public.set_pickup_request_location_from_user() from public, anon;
revoke execute on function public.td_alert_activity_to_logs() from public, anon;
revoke execute on function public.td_alert_notify() from public, anon;
revoke execute on function public.td_alert_track() from public, anon;
revoke execute on function public.td_audit_batch() from public, anon;
revoke execute on function public.td_audit_collector() from public, anon;
revoke execute on function public.td_audit_request() from public, anon;
revoke execute on function public.td_batches_fill_details() from public, anon;
revoke execute on function public.td_guard_dumping_update() from public, anon;
revoke execute on function public.td_guard_manager_assign() from public, anon;
revoke execute on function public.td_tag_area() from public, anon;
revoke execute on function public.trigger_increment_on_digital_bin_collected() from public, anon;
revoke execute on function public.trigger_increment_on_pickup_completed() from public, anon;
