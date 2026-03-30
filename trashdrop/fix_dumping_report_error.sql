-- Fix for "nearest_report" not assigned error
-- This error occurs when the nearest_report record variable is accessed before being properly initialized

-- Fix the check_dumping_duplicate function
CREATE OR REPLACE FUNCTION check_dumping_duplicate(
    p_reported_by UUID,
    p_latitude NUMERIC,
    p_longitude NUMERIC,
    p_radius_km NUMERIC DEFAULT 0.05, -- 50m radius for strict duplicate check
    p_hours_back INTEGER DEFAULT 1 -- 1 hour for strict duplicate check
)
RETURNS TABLE (
    is_duplicate BOOLEAN,
    duplicate_count BIGINT,
    nearest_distance NUMERIC,
    nearest_report_id UUID,
    message TEXT
) AS $$
DECLARE
    nearby_count BIGINT;
    nearest_report RECORD := NULL; -- Initialize to NULL
BEGIN
    -- Count nearby reports from same user
    SELECT COUNT(*) INTO nearby_count
    FROM illegal_dumping_mobile d
    WHERE d.reported_by = p_reported_by
    AND (
        (d.coordinates IS NOT NULL AND ST_DWithin(
            d.coordinates, 
            ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326), 
            p_radius_km * 1000
        ))
        OR
        (d.coordinates IS NULL AND d.latitude IS NOT NULL AND d.longitude IS NOT NULL AND
         ST_DWithin(
            ST_SetSRID(ST_MakePoint(d.longitude, d.latitude), 4326),
            ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326), 
            p_radius_km * 1000
         ))
    )
    AND d.created_at > NOW() - INTERVAL '1 hour' * p_hours_back;
    
    -- Get nearest report if any exist
    IF nearby_count > 0 THEN
        SELECT * INTO nearest_report
        FROM find_nearby_dumping(p_latitude, p_longitude, p_radius_km, p_hours_back, p_reported_by)
        LIMIT 1;
    END IF;
    
    RETURN QUERY SELECT 
        nearby_count > 0 as is_duplicate,
        nearby_count as duplicate_count,
        COALESCE(nearest_report.distance_meters, 0) as nearest_distance,
        COALESCE(nearest_report.id, NULL::UUID) as nearest_report_id,
        CASE 
            WHEN nearby_count = 0 THEN 'No duplicates found'
            WHEN nearby_count = 1 THEN 'Found 1 similar report nearby'
            ELSE CONCAT('Found ', nearby_count, ' similar reports nearby')
        END as message;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Also fix the prevent_duplicate_dumping_reports function to handle the case properly
CREATE OR REPLACE FUNCTION prevent_duplicate_dumping_reports()
RETURNS TRIGGER AS $$
DECLARE
    duplicate_check RECORD;
    nearby_reports RECORD := NULL; -- Initialize to NULL
BEGIN
    -- Skip duplicate check if idempotency token is provided (for retries)
    IF NEW.idempotency_token IS NOT NULL THEN
        -- Check if this is a retry of an existing submission
        IF EXISTS (
            SELECT 1 FROM illegal_dumping_mobile 
            WHERE idempotency_token = NEW.idempotency_token
        ) THEN
            -- This is a duplicate retry, return existing record
            RAISE EXCEPTION 'DUPLICATE_RETRY: Report already exists with idempotency token %', NEW.idempotency_token;
        END IF;
        
        -- New submission with idempotency token, allow it
        RETURN NEW;
    END IF;
    
    -- Check for exact duplicates using submission fingerprint
    IF NEW.submission_fingerprint IS NOT NULL THEN
        IF EXISTS (
            SELECT 1 FROM illegal_dumping_mobile 
            WHERE submission_fingerprint = NEW.submission_fingerprint
            AND created_at > NOW() - INTERVAL '5 minutes'
        ) THEN
            RAISE EXCEPTION 'DUPLICATE_SUBMISSION: Identical submission detected within 5 minutes';
        END IF;
    END IF;
    
    -- Check for spatial duplicates within 100m and 24 hours
    SELECT * INTO duplicate_check
    FROM check_dumping_duplicate(NEW.reported_by, NEW.latitude, NEW.longitude, 0.1, 24);
    
    IF duplicate_check.is_duplicate THEN
        RAISE EXCEPTION 'SPATIAL_DUPLICATE: Found % similar report(s) within 100m in the last 24 hours. Nearest is %m away.', 
            duplicate_check.duplicate_count, 
            ROUND(duplicate_check.nearest_distance);
    END IF;
    
    -- Check for stricter duplicates within 50m and 1 hour (same user)
    SELECT * INTO nearby_reports
    FROM check_dumping_duplicate(NEW.reported_by, NEW.latitude, NEW.longitude, 0.05, 1);
    
    IF nearby_reports.is_duplicate THEN
        RAISE EXCEPTION 'TEMPORAL_DUPLICATE: You already reported a dumping site %m away within the last hour. Please wait before submitting another report.', 
            ROUND(nearby_reports.nearest_distance);
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT EXECUTE ON FUNCTION check_dumping_duplicate TO authenticated;
