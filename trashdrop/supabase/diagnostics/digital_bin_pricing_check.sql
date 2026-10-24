-- Health check of the accepted TrashDrop Digital Bin Pricing
-- (docs/DIGITAL_BIN_PRICING.md). Read-only: READ ONLY transaction, ends with
-- ROLLBACK, and the one price lookup uses p_claim = false (no promotion is
-- used). Every row should say ok.
BEGIN TRANSACTION READ ONLY;

WITH checks(check_name, ok, detail) AS (
  SELECT 'pricing trigger on new bins',
         EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.digital_bins'::regclass AND tgname = 'digital_bins_set_price' AND tgenabled <> 'D'),
         'digital_bins_set_price present and enabled'
  UNION ALL
  SELECT 'customers cannot reprice bins',
         EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.digital_bins'::regclass AND tgname = 'digital_bins_protect_price' AND tgenabled <> 'D'),
         'digital_bins_protect_price present and enabled'
  UNION ALL
  SELECT 'cancel gives the promotion back (status and app cancel)',
         EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.digital_bins'::regclass AND tgname = 'digital_bins_refund_promotion'
                 AND tgenabled <> 'D' AND pg_get_triggerdef(oid) ILIKE '%is_active%'),
         'digital_bins_refund_promotion watches status and is_active'
  UNION ALL
  SELECT 'price function runs as definer',
         coalesce((SELECT prosecdef FROM pg_proc WHERE oid = to_regprocedure('public.td_price_digital_bin(uuid,double precision,double precision,integer,integer,boolean,boolean)')), false),
         'td_price_digital_bin exists, SECURITY DEFINER'
  UNION ALL
  SELECT 'customers can only read promotional_usage',
         NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.promotional_usage'::regclass AND polcmd <> 'r'),
         'no INSERT/UPDATE/DELETE/ALL policies'
  UNION ALL
  SELECT 'no write grants on promotional_usage',
         NOT EXISTS (SELECT 1 FROM information_schema.role_table_grants
                     WHERE table_schema = 'public' AND table_name = 'promotional_usage'
                       AND grantee IN ('anon', 'authenticated') AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')),
         'anon/authenticated have no INSERT, UPDATE, DELETE or TRUNCATE'
  UNION ALL
  SELECT 'old counting call no longer counts',
         pg_get_functiondef('public.increment_promotional_usage(uuid)'::regprocedure) NOT ILIKE '%update%',
         'increment_promotional_usage(uuid) only reads'
  UNION ALL
  SELECT 'zone price for 2 × 240 L at the latest bin',
         coalesce((SELECT p.fee > 1 AND NOT p.is_promotional AND p.collector_total_payout = p.fee - 1
                   FROM (SELECT l.coordinates FROM public.digital_bins b JOIN public.bin_locations l ON l.id = b.location_id
                         ORDER BY b.created_at DESC LIMIT 1) x,
                   LATERAL public.td_price_digital_bin(NULL, ST_Y(x.coordinates::geometry), ST_X(x.coordinates::geometry), 240, 2, false, false) p), false),
         'fee = zone price × 2 + GHS 1, payout = fee − 1 (fails if that zone has no 240 L price)'
)
SELECT CASE WHEN ok THEN 'ok' ELSE 'FAIL' END AS result, check_name, detail FROM checks;

ROLLBACK;
