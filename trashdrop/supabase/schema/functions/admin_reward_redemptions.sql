-- Function public.admin_reward_redemptions
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- admin_reward_redemptions(p_status text): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.admin_reward_redemptions(p_status text DEFAULT 'pending'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
BEGIN
  IF NOT public.can_do('rewards.manage') THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(row_to_json(x) ORDER BY
             CASE WHEN p_status = 'pending' THEN x.created_at END ASC,
             CASE WHEN p_status IS DISTINCT FROM 'pending' THEN x.created_at END DESC)
      FROM (
        SELECT rr.id::text AS id, rr.created_at, coalesce(rr.status, 'pending') AS status, rr.points_spent,
               rr.phone_number, rr.network, rr.sent_at, rr.staff_note,
               r.name AS reward_name, r.category AS reward_category,
               rr.user_id,
               coalesce(nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''),
                        split_part(u.email, '@', 1)) AS household_name,
               coalesce(p.email, u.email::text) AS household_email
          FROM public.rewards_redemption rr
          LEFT JOIN public.rewards r ON r.id = rr.reward_id
          LEFT JOIN public.profiles p ON p.id = rr.user_id
          LEFT JOIN auth.users u ON u.id = rr.user_id
         WHERE p_status IS NULL OR coalesce(rr.status, 'pending') = p_status
         LIMIT 500
      ) x), '[]'::jsonb);
END $function$;
