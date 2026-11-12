-- validate_cashout answered signed-out callers: its caller check ran only when
-- someone was signed in, so a signed-out call returned any collector's
-- available balance. No app calls it; signed-in collectors (their own
-- balance only) and the server key keep access. Owner's approval 2026-11-12.
revoke execute on function public.validate_cashout(uuid, numeric) from public, anon;
grant execute on function public.validate_cashout(uuid, numeric) to authenticated, service_role;
