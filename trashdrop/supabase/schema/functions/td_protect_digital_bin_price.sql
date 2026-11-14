-- Function public.td_protect_digital_bin_price
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- td_protect_digital_bin_price(): execute: anon, authenticated, service_role
CREATE OR REPLACE FUNCTION public.td_protect_digital_bin_price()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() = OLD.user_id
     AND (NEW.fee IS DISTINCT FROM OLD.fee
       OR NEW.is_promotional IS DISTINCT FROM OLD.is_promotional
       OR NEW.promo_request_number IS DISTINCT FROM OLD.promo_request_number
       OR NEW.bag_count IS DISTINCT FROM OLD.bag_count
       OR NEW.bin_size_liters IS DISTINCT FROM OLD.bin_size_liters
       OR NEW.is_urgent IS DISTINCT FROM OLD.is_urgent
       OR NEW.collector_core_payout IS DISTINCT FROM OLD.collector_core_payout
       OR NEW.collector_urgent_payout IS DISTINCT FROM OLD.collector_urgent_payout
       OR NEW.collector_total_payout IS DISTINCT FROM OLD.collector_total_payout) THEN
    RAISE EXCEPTION 'A booking''s price, size and bags can''t be changed after it is made'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;
