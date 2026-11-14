-- Function public.get_dumping_duplicate_stats
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- get_dumping_duplicate_stats(p_days_back integer): execute: service_role
CREATE OR REPLACE FUNCTION public.get_dumping_duplicate_stats(p_days_back integer DEFAULT 30)
 RETURNS TABLE(date_truncated date, total_reports bigint, potential_duplicates bigint, duplicate_percentage numeric, most_active_user uuid, user_report_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
    RETURN QUERY
    SELECT 
        created_at::DATE as date_truncated,
        COUNT(*) as total_reports,
        COUNT(CASE WHEN location_hash IN (
            SELECT location_hash FROM illegal_dumping_mobile 
            WHERE created_at > NOW() - INTERVAL '1 day' * p_days_back
            GROUP BY location_hash, reported_by 
            HAVING COUNT(*) > 1
        ) THEN 1 END) as potential_duplicates,
        ROUND(
            (COUNT(CASE WHEN location_hash IN (
                SELECT location_hash FROM illegal_dumping_mobile 
                WHERE created_at > NOW() - INTERVAL '1 day' * p_days_back
                GROUP BY location_hash, reported_by 
                HAVING COUNT(*) > 1
            ) THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0)), 2
        ) as duplicate_percentage,
        reported_by as most_active_user,
        COUNT(*) as user_report_count
    FROM illegal_dumping_mobile
    WHERE created_at > NOW() - INTERVAL '1 day' * p_days_back
    GROUP BY created_at::DATE, reported_by
    ORDER BY date_truncated DESC, user_report_count DESC;
END;
$function$;
