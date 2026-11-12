-- Protected pricing (docs/DIGITAL_BIN_PRICING.md); owner's written approval
-- 2026-11-12: "yes, apply to production". The sign-up trigger that creates a
-- new account's promotion counter fixes its search_path, like every other
-- function since 20261112123642 (TD19, Supabase advisor). Its body already
-- names its table in full, so what it does is unchanged.
ALTER FUNCTION public.create_promotional_usage_on_signup() SET search_path = public, extensions, pg_temp;
