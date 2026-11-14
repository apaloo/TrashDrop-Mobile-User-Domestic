-- Function public.clean_blob_urls_from_photos
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- clean_blob_urls_from_photos(): execute: authenticated, service_role
CREATE OR REPLACE FUNCTION public.clean_blob_urls_from_photos()
 RETURNS TABLE(id uuid, old_photo_count integer, new_photo_count integer, removed_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
    report_record RECORD;
    cleaned_photos text[];
    old_count integer;
    new_count integer;
BEGIN
    FOR report_record IN 
        SELECT id, photos 
        FROM public.illegal_dumping_mobile 
        WHERE photos IS NOT NULL 
        AND ARRAY_TO_STRING(photos, ',') LIKE '%blob:%'
    LOOP
        -- Get original count
        old_count := COALESCE(ARRAY_LENGTH(report_record.photos, 1), 0);
        
        -- Filter out blob URLs
        SELECT ARRAY_AGG(photo)
        INTO cleaned_photos
        FROM UNNEST(report_record.photos) AS photo
        WHERE photo NOT LIKE 'blob:%';
        
        -- Handle case where all photos were blob URLs
        IF cleaned_photos IS NULL THEN
            cleaned_photos := '{}'::text[];
        END IF;
        
        -- Get new count
        new_count := COALESCE(ARRAY_LENGTH(cleaned_photos, 1), 0);
        
        -- Update the record
        UPDATE public.illegal_dumping_mobile
        SET photos = cleaned_photos
        WHERE id = report_record.id;
        
        -- Return the result
        id := report_record.id;
        old_photo_count := old_count;
        new_photo_count := new_count;
        removed_count := old_count - new_count;
        
        RETURN NEXT;
    END LOOP;
    
    RETURN;
END;
$function$;
