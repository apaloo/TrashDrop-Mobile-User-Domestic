-- Function public.get_pickup_request_bag_prices
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- get_pickup_request_bag_prices(p_request_ids text[]): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.get_pickup_request_bag_prices(p_request_ids text[])
 RETURNS TABLE(request_id text, bag_count integer, unit_prices numeric[], total numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH reqs AS (
    SELECT pr.id::text AS id, pr.user_id, pr.created_at,
           GREATEST(COALESCE(pr.estimated_volume, pr.bag_count, 1), 1)::integer AS n
    FROM pickup_requests pr
    WHERE pr.id::text = ANY (p_request_ids)
      AND (pr.status = 'pending' OR pr.collector_id = auth.uid())
      AND public.is_active_collector(auth.uid())
  ),
  user_reqs AS (
    SELECT pr.id::text AS id, pr.user_id,
           GREATEST(COALESCE(pr.estimated_volume, pr.bag_count, 1), 1)::integer AS n,
           SUM(GREATEST(COALESCE(pr.estimated_volume, pr.bag_count, 1), 1)::integer)
             OVER (PARTITION BY pr.user_id ORDER BY pr.created_at, pr.id
                   ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS upto
    FROM pickup_requests pr
    WHERE pr.user_id IN (SELECT user_id FROM reqs)
      AND pr.status IN ('pending', 'accepted', 'en_route', 'arrived')
  ),
  user_bags AS (
    SELECT bg.user_id, COALESCE(bg.unit_price, b.unit_price) AS price,
           ROW_NUMBER() OVER (PARTITION BY bg.user_id ORDER BY b.created_at, bg.id) AS rn
    FROM bags bg
    JOIN batches b ON b.id = bg.batch_id
    WHERE bg.user_id IN (SELECT user_id FROM reqs)
      AND bg.status = 'active'
  )
  SELECT r.id,
         r.n,
         COALESCE(array_agg(ub.price ORDER BY ub.rn) FILTER (WHERE ub.price IS NOT NULL), ARRAY[]::numeric[]),
         COALESCE(SUM(ub.price), 0)
  FROM reqs r
  JOIN user_reqs ur ON ur.id = r.id
  LEFT JOIN user_bags ub
    ON ub.user_id = r.user_id
   AND ub.rn > ur.upto - ur.n
   AND ub.rn <= ur.upto
  GROUP BY r.id, r.n;
$function$;
