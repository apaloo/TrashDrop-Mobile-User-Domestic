-- Function public.merge_dumping_reports
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- merge_dumping_reports(p_primary_report_id uuid, p_duplicate_report_ids uuid[], p_merged_by uuid): execute: service_role
CREATE OR REPLACE FUNCTION public.merge_dumping_reports(p_primary_report_id uuid, p_duplicate_report_ids uuid[], p_merged_by uuid)
 RETURNS TABLE(success boolean, message text, merged_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
    merged_count INTEGER := 0;
    duplicate_record RECORD;
    primary_exists BOOLEAN;
    total_duplicates INTEGER := 0;
BEGIN
    -- Validate inputs
    IF p_primary_report_id IS NULL THEN
        RETURN QUERY SELECT false, 'Primary report ID is required', 0;
        RETURN;
    END IF;
    
    IF p_duplicate_report_ids IS NULL OR array_length(p_duplicate_report_ids, 1) IS NULL THEN
        RETURN QUERY SELECT false, 'Duplicate report IDs array is required', 0;
        RETURN;
    END IF;
    
    IF p_merged_by IS NULL THEN
        RETURN QUERY SELECT false, 'Merged by user ID is required', 0;
        RETURN;
    END IF;
    
    -- Check if primary report exists
    SELECT EXISTS(SELECT 1 FROM illegal_dumping_mobile WHERE id = p_primary_report_id) 
    INTO primary_exists;
    
    IF NOT primary_exists THEN
        RETURN QUERY SELECT false, 'Primary report not found', 0;
        RETURN;
    END IF;
    
    -- Count total duplicates to process
    total_duplicates := array_length(p_duplicate_report_ids, 1);
    
    -- Merge each duplicate report
    DECLARE
        i INTEGER;
        duplicate_id UUID;
    BEGIN
    FOR i IN 1..array_length(p_duplicate_report_ids, 1) LOOP
        duplicate_id := p_duplicate_report_ids[i];
        
        -- Skip if duplicate doesn't exist
        IF NOT EXISTS (SELECT 1 FROM illegal_dumping_mobile WHERE id = duplicate_id) THEN
            CONTINUE;
        END IF;
        
        -- Skip if trying to merge primary report into itself
        IF duplicate_id = p_primary_report_id THEN
            CONTINUE;
        END IF;
        
        BEGIN
            -- Update history to show merge
            INSERT INTO illegal_dumping_history_mobile (
                dumping_id, 
                status, 
                notes, 
                updated_by,
                created_at
            ) VALUES (
                duplicate_id,
                'merged',
                CONCAT('Merged into report ', p_primary_report_id, ' by user ', p_merged_by),
                p_merged_by,
                NOW()
            );
            
            -- Update primary report with additional photos if any
            UPDATE illegal_dumping_mobile 
            SET photos = photos || COALESCE(
                (SELECT photos FROM illegal_dumping_mobile WHERE id = duplicate_id), 
                ARRAY[]::TEXT[]
            ),
            updated_at = NOW()
            WHERE id = p_primary_report_id;
            
            -- Delete the duplicate report
            DELETE FROM illegal_dumping_mobile WHERE id = duplicate_id;
            
            merged_count := merged_count + 1;
            
        EXCEPTION WHEN OTHERS THEN
            -- Log error but continue with other duplicates
            RAISE NOTICE 'Error merging duplicate %: %', duplicate_id, SQLERRM;
        END;
    END LOOP;
    END;
    
    -- Return success message
    IF merged_count > 0 THEN
        RETURN QUERY SELECT 
            true, 
            CONCAT('Successfully merged ', merged_count, ' of ', total_duplicates, ' duplicate reports into primary report ', p_primary_report_id), 
            merged_count;
    ELSE
        RETURN QUERY SELECT 
            false, 
            'No valid duplicate reports found to merge', 
            0;
    END IF;
    
END;
$function$;
