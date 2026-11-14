-- Function public.test_merge_dumping_reports
-- Generated from production by engineering/automation/schema-snapshot.mjs.
-- Do not edit: change the database with a migration (ADR-001), then refresh.

-- test_merge_dumping_reports(p_primary_report_id uuid, p_duplicate_report_ids uuid[], p_merged_by uuid): execute: service_role
CREATE OR REPLACE FUNCTION public.test_merge_dumping_reports(p_primary_report_id uuid, p_duplicate_report_ids uuid[], p_merged_by uuid)
 RETURNS TABLE(success boolean, message text, merged_count integer, debug_info text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
    merged_count INTEGER := 0;
    i INTEGER;
    duplicate_id UUID;
    primary_exists BOOLEAN;
    total_duplicates INTEGER := 0;
    debug_messages TEXT[] := ARRAY[]::TEXT[];
BEGIN
    -- Add debug info
    debug_messages := array_append(debug_messages, 'Starting merge process');
    
    -- Validate primary report
    SELECT EXISTS(SELECT 1 FROM illegal_dumping_mobile WHERE id = p_primary_report_id) 
    INTO primary_exists;
    
    debug_messages := array_append(debug_messages, 
        'Primary report ' || p_primary_report_id::TEXT || ' exists: ' || CASE WHEN primary_exists THEN 'true' ELSE 'false' END);
    
    IF NOT primary_exists THEN
        debug_messages := array_append(debug_messages, 'Primary report not found - returning error');
        RETURN QUERY SELECT false, 'Primary report not found', 0, array_to_string(debug_messages, ' | ');
        RETURN;
    END IF;
    
    -- Validate array
    IF p_duplicate_report_ids IS NULL OR array_length(p_duplicate_report_ids, 1) IS NULL THEN
        debug_messages := array_append(debug_messages, 'Duplicate array is null or empty');
        RETURN QUERY SELECT false, 'Duplicate report IDs array is required', 0, array_to_string(debug_messages, ' | ');
        RETURN;
    END IF;
    
    total_duplicates := array_length(p_duplicate_report_ids, 1);
    debug_messages := array_append(debug_messages, 
        'Total duplicates to process: ' || total_duplicates::TEXT);
    
    -- Process each duplicate
    FOR i IN 1..total_duplicates LOOP
        duplicate_id := p_duplicate_report_ids[i];
        debug_messages := array_append(debug_messages, 
            'Processing duplicate ' || i::TEXT || ': ' || duplicate_id::TEXT);
        
        -- Check if duplicate exists
        IF NOT EXISTS (SELECT 1 FROM illegal_dumping_mobile WHERE id = duplicate_id) THEN
            debug_messages := array_append(debug_messages, 
                'Duplicate ' || duplicate_id::TEXT || ' does not exist - skipping');
            CONTINUE;
        END IF;
        
        -- Skip if trying to merge primary into itself
        IF duplicate_id = p_primary_report_id THEN
            debug_messages := array_append(debug_messages, 
                'Duplicate ' || duplicate_id::TEXT || ' is same as primary - skipping');
            CONTINUE;
        END IF;
        
        -- Perform the merge
        BEGIN
            -- Update history
            INSERT INTO illegal_dumping_history_mobile (
                dumping_id, status, notes, updated_by, created_at
            ) VALUES (
                duplicate_id, 'merged', 
                'Merged into report ' || p_primary_report_id::TEXT || ' by user ' || p_merged_by::TEXT,
                p_merged_by, NOW()
            );
            
            -- Update primary report photos
            UPDATE illegal_dumping_mobile 
            SET photos = photos || COALESCE(
                (SELECT photos FROM illegal_dumping_mobile WHERE id = duplicate_id), 
                ARRAY[]::TEXT[]
            ),
            updated_at = NOW()
            WHERE id = p_primary_report_id;
            
            -- Delete duplicate
            DELETE FROM illegal_dumping_mobile WHERE id = duplicate_id;
            
            merged_count := merged_count + 1;
            
            debug_messages := array_append(debug_messages, 
                'Successfully merged duplicate ' || duplicate_id::TEXT);
            
        EXCEPTION WHEN OTHERS THEN
            debug_messages := array_append(debug_messages, 
                'Error merging duplicate ' || duplicate_id::TEXT || ': ' || SQLERRM);
        END;
    END LOOP;
    
    debug_messages := array_append(debug_messages, 
        'Merge completed. Merged ' || merged_count::TEXT || ' of ' || total_duplicates::TEXT || ' duplicates');
    
    -- Return result
    IF merged_count > 0 THEN
        RETURN QUERY SELECT 
            true, 
            'Successfully merged ' || merged_count::TEXT || ' of ' || total_duplicates::TEXT || ' duplicate reports', 
            merged_count,
            array_to_string(debug_messages, ' | ');
    ELSE
        RETURN QUERY SELECT 
            false, 
            'No valid duplicate reports found to merge', 
            0,
            array_to_string(debug_messages, ' | ');
    END IF;
    
END;
$function$;
