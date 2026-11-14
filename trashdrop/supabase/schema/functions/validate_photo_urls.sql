-- Function public.validate_photo_urls
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- validate_photo_urls(): execute: service_role
CREATE OR REPLACE FUNCTION public.validate_photo_urls()
 RETURNS TABLE(id uuid, has_blob_urls boolean, has_data_urls boolean, has_valid_urls boolean, photo_count integer, invalid_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
    RETURN QUERY
    SELECT 
        d.id,
        ARRAY_TO_STRING(d.photos, ',') LIKE '%blob:%' as has_blob_urls,
        ARRAY_TO_STRING(d.photos, ',') LIKE '%data:%' as has_data_urls,
        ARRAY_TO_STRING(d.photos, ',') LIKE '%http%' as has_valid_urls,
        COALESCE(ARRAY_LENGTH(d.photos, 1), 0) as photo_count,
        (
            SELECT COUNT(*)::integer
            FROM UNNEST(COALESCE(d.photos, '{}'::text[])) AS photo
            WHERE photo LIKE 'blob:%' OR photo LIKE 'data:%'
        ) as invalid_count
    FROM public.illegal_dumping_mobile d;
END;
$function$;
