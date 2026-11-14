-- Function public.td_refund_promotion_on_cancel
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_refund_promotion_on_cancel(): execute: service_role
CREATE OR REPLACE FUNCTION public.td_refund_promotion_on_cancel()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  was_cancelled boolean := lower(coalesce(OLD.status, '')) IN ('cancelled', 'canceled')
    OR (OLD.is_active IS FALSE AND lower(coalesce(OLD.status, '')) NOT IN ('completed', 'disposed'));
  is_cancelled boolean := lower(coalesce(NEW.status, '')) IN ('cancelled', 'canceled')
    OR (NEW.is_active IS FALSE AND lower(coalesce(NEW.status, '')) NOT IN ('completed', 'disposed'));
BEGIN
  IF NOT coalesce(NEW.is_promotional, false) OR NEW.user_id IS NULL OR was_cancelled = is_cancelled THEN
    RETURN NEW;
  END IF;

  UPDATE public.promotional_usage u
  SET used_count = CASE WHEN is_cancelled THEN greatest(u.used_count - 1, 0)
                        ELSE least(u.used_count + 1, u.max_requests) END,
      updated_at = now()
  WHERE u.user_id = NEW.user_id;
  RETURN NEW;
END;
$function$;
