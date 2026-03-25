-- Migration: Add Duplicate Prevention and Idempotency for Illegal Dumping Reports
-- Updated to match the actual database schema
-- This migration adds comprehensive duplicate detection and prevention mechanisms

-- ============================================================================
-- STEP 1: Add Required Extensions (if not already exists)
-- ============================================================================
DO $$
BEGIN
    -- Enable UUID generation if not already enabled
    IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'uuid-ossp') THEN
        CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    END IF;
    
    -- Enable PostGIS for geographic operations if not already enabled
    IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') THEN
        CREATE EXTENSION IF NOT EXISTS postgis;
    END IF;
END $$;

-- ============================================================================
-- STEP 2: Create Location Hash Function for Duplicate Detection
-- ============================================================================

-- Function to generate location hash for spatial duplicate detection
-- Creates grid cells based on tolerance to detect nearby reports
CREATE OR REPLACE FUNCTION generate_location_hash(
    lat NUMERIC, 
    lng NUMERIC, 
    tolerance_meters INTEGER DEFAULT 50
) RETURNS TEXT AS $$
BEGIN
    -- Convert coordinates to grid cells based on tolerance
    -- This creates a hash that will be the same for nearby locations
    RETURN CONCAT(
        ROUND(lat::NUMERIC * 1000000 / tolerance_meters)::TEXT,
        ',',
        ROUND(lng::NUMERIC * 1000000 / tolerance_meters)::TEXT
    );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- STEP 3: Add New Columns to illegal_dumping_mobile Table
-- ============================================================================

-- Add location_hash column for spatial duplicate detection
ALTER TABLE illegal_dumping_mobile 
ADD COLUMN IF NOT EXISTS location_hash TEXT;

-- Add idempotency token column for retry-safe operations
ALTER TABLE illegal_dumping_mobile 
ADD COLUMN IF NOT EXISTS idempotency_token TEXT;

-- Add submission fingerprint column for client-side duplicate detection
ALTER TABLE illegal_dumping_mobile 
ADD COLUMN IF NOT EXISTS submission_fingerprint TEXT;

-- ============================================================================
-- STEP 4: Create Triggers for Auto-Generated Fields
-- ============================================================================

-- Trigger to auto-generate location hash on insert
CREATE OR REPLACE FUNCTION set_dumping_location_hash()
RETURNS TRIGGER AS $$
BEGIN
    -- Extract coordinates from geometry type (PostGIS Point)
    -- Handle both direct lat/lng columns and coordinates geometry
    IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
        NEW.location_hash = generate_location_hash(
            NEW.latitude, 
            NEW.longitude, 
            50 -- 50 meter tolerance for duplicate detection
        );
    ELSIF NEW.coordinates IS NOT NULL THEN
        -- Extract coordinates from geometry if available
        NEW.location_hash = generate_location_hash(
            ST_Y(NEW.coordinates::geometry), 
            ST_X(NEW.coordinates::geometry), 
            50
        );
        -- Also set lat/lng if not already set
        IF NEW.latitude IS NULL THEN
            NEW.latitude = ST_Y(NEW.coordinates::geometry);
        END IF;
        IF NEW.longitude IS NULL THEN
            NEW.longitude = ST_X(NEW.coordinates::geometry);
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trg_set_dumping_location_hash ON illegal_dumping_mobile;

-- Create trigger for auto-generating location hash
CREATE TRIGGER trg_set_dumping_location_hash
    BEFORE INSERT ON illegal_dumping_mobile
    FOR EACH ROW EXECUTE FUNCTION set_dumping_location_hash();

-- ============================================================================
-- STEP 5: Create Indexes for Performance
-- ============================================================================

-- Create spatial index for coordinates if not exists (using PostGIS geometry type)
DO $$
BEGIN
    -- Check if coordinates column is spatial and create appropriate index
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'illegal_dumping_mobile' 
        AND column_name = 'coordinates'
        AND data_type = 'USER-DEFINED'
    ) THEN
        -- This is a PostGIS geometry column
        CREATE INDEX IF NOT EXISTS illegal_dumping_mobile_coordinates_idx 
        ON illegal_dumping_mobile USING gist (coordinates);
    END IF;
END $$;

-- Create index for location hash based duplicate detection
CREATE INDEX IF NOT EXISTS illegal_dumping_mobile_location_hash_idx 
ON illegal_dumping_mobile (location_hash);

-- Create composite index for user + time based duplicate detection
CREATE INDEX IF NOT EXISTS illegal_dumping_mobile_user_time_idx 
ON illegal_dumping_mobile (reported_by, created_at DESC);

-- Create unique index for idempotency tokens
CREATE UNIQUE INDEX IF NOT EXISTS illegal_dumping_mobile_idempotency_token_idx 
ON illegal_dumping_mobile (idempotency_token) 
WHERE idempotency_token IS NOT NULL;

-- Create index for submission fingerprints
CREATE INDEX IF NOT EXISTS illegal_dumping_mobile_fingerprint_idx 
ON illegal_dumping_mobile (submission_fingerprint) 
WHERE submission_fingerprint IS NOT NULL;

-- ============================================================================
-- STEP 6: Create RPC Functions for Duplicate Detection
-- ============================================================================

-- Function to find nearby dumping reports with spatial and temporal filtering
CREATE OR REPLACE FUNCTION find_nearby_dumping(
    p_latitude NUMERIC,
    p_longitude NUMERIC,
    p_radius_km NUMERIC DEFAULT 0.1, -- Default 100m radius
    p_hours_back INTEGER DEFAULT 24, -- Default 24 hours back
    p_exclude_user_id UUID DEFAULT NULL -- Optional: exclude reports from specific user
)
RETURNS TABLE (
    id UUID,
    reported_by UUID,
    location TEXT,
    coordinates geometry, -- Using geometry type for PostGIS
    latitude NUMERIC,
    longitude NUMERIC,
    waste_type TEXT,
    severity TEXT,
    size TEXT,
    photos TEXT[],
    status TEXT,
    created_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE,
    distance_meters NUMERIC,
    hours_ago NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        d.id,
        d.reported_by,
        d.location,
        d.coordinates,
        d.latitude,
        d.longitude,
        d.waste_type,
        d.severity,
        d.size,
        d.photos,
        d.status,
        d.created_at,
        d.updated_at,
        -- Calculate distance using coordinates if available, otherwise lat/lng
        CASE 
            WHEN d.coordinates IS NOT NULL THEN
                ST_Distance(
                    d.coordinates::geography, 
                    ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::geography
                )::NUMERIC
            WHEN d.latitude IS NOT NULL AND d.longitude IS NOT NULL THEN
                ST_Distance(
                    ST_SetSRID(ST_MakePoint(d.longitude, d.latitude), 4326)::geography,
                    ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::geography
                )::NUMERIC
            ELSE NULL
        END as distance_meters,
        -- Calculate hours ago
        (EXTRACT(EPOCH FROM (NOW() - d.created_at)) / 3600)::NUMERIC as hours_ago
    FROM illegal_dumping_mobile d
    WHERE 
        -- Spatial filter: within radius
        (
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
        -- Time filter: within specified hours
        AND d.created_at > NOW() - INTERVAL '1 hour' * p_hours_back
        -- Optional user exclusion
        AND (p_exclude_user_id IS NULL OR d.reported_by != p_exclude_user_id)
    ORDER BY distance_meters, d.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check for potential duplicates before insertion
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
    nearest_report RECORD;
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

-- ============================================================================
-- STEP 7: Create Duplicate Prevention Trigger
-- ============================================================================

-- Function to prevent duplicate reports based on spatial and temporal constraints
CREATE OR REPLACE FUNCTION prevent_duplicate_dumping_reports()
RETURNS TRIGGER AS $$
DECLARE
    duplicate_check RECORD;
    nearby_reports RECORD;
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

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trg_prevent_duplicate_dumping_reports ON illegal_dumping_mobile;

-- Create the duplicate prevention trigger
CREATE TRIGGER trg_prevent_duplicate_dumping_reports
    BEFORE INSERT ON illegal_dumping_mobile
    FOR EACH ROW EXECUTE FUNCTION prevent_duplicate_dumping_reports();

-- ============================================================================
-- STEP 8: Create Utility Functions for Report Management
-- ============================================================================

-- Function to merge duplicate reports (admin function)
CREATE OR REPLACE FUNCTION merge_dumping_reports(
    p_primary_report_id UUID,
    p_duplicate_report_ids UUID[],
    p_merged_by UUID
)
RETURNS TABLE (
    success BOOLEAN,
    message TEXT,
    merged_count INTEGER
) AS $$
DECLARE
    merged_count INTEGER := 0;
    duplicate_record RECORD;
BEGIN
    -- Validate primary report exists
    IF NOT EXISTS (SELECT 1 FROM illegal_dumping_mobile WHERE id = p_primary_report_id) THEN
        RETURN QUERY SELECT false, 'Primary report not found', 0;
        RETURN;
    END IF;
    
    -- Merge each duplicate report
    FOREACH duplicate_record.id IN ARRAY p_duplicate_report_ids
    LOOP
        -- Update history to show merge
        INSERT INTO illegal_dumping_history_mobile (
            dumping_id, 
            status, 
            notes, 
            updated_by
        ) VALUES (
            duplicate_record.id,
            'merged',
            CONCAT('Merged into report ', p_primary_report_id),
            p_merged_by
        );
        
        -- Update primary report with additional photos if any
        UPDATE illegal_dumping_mobile 
        SET photos = photos || COALESCE(
            (SELECT photos FROM illegal_dumping_mobile WHERE id = duplicate_record.id), 
            ARRAY[]::TEXT[]
        )
        WHERE id = p_primary_report_id;
        
        -- Delete the duplicate report
        DELETE FROM illegal_dumping_mobile WHERE id = duplicate_record.id;
        
        merged_count := merged_count + 1;
    END LOOP;
    
    RETURN QUERY SELECT 
        true, 
        CONCAT('Successfully merged ', merged_count, ' reports'), 
        merged_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get duplicate statistics
CREATE OR REPLACE FUNCTION get_dumping_duplicate_stats(
    p_days_back INTEGER DEFAULT 30
)
RETURNS TABLE (
    date_truncated DATE,
    total_reports BIGINT,
    potential_duplicates BIGINT,
    duplicate_percentage NUMERIC,
    most_active_user UUID,
    user_report_count BIGINT
) AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- STEP 9: Update Existing Records (Backfill)
-- ============================================================================

-- Update existing records to have location_hash and lat/lng coordinates
DO $$
DECLARE
    record RECORD;
    updated_count INTEGER := 0;
    lat_val NUMERIC;
    lng_val NUMERIC;
BEGIN
    -- Backfill location_hash for existing records
    FOR record IN 
        SELECT id, coordinates, latitude, longitude 
        FROM illegal_dumping_mobile 
        WHERE location_hash IS NULL
        LIMIT 1000 -- Process in batches to avoid long transactions
    LOOP
        -- Extract latitude value with proper type casting
        lat_val := COALESCE(
            record.latitude,
            CASE 
                WHEN record.coordinates IS NOT NULL THEN ST_Y(record.coordinates::geometry)
                ELSE 0
            END
        );
        
        -- Extract longitude value with proper type casting
        lng_val := COALESCE(
            record.longitude,
            CASE 
                WHEN record.coordinates IS NOT NULL THEN ST_X(record.coordinates::geometry)
                ELSE 0
            END
        );
        
        -- Only update if we have valid coordinates
        IF lat_val != 0 OR lng_val != 0 THEN
            UPDATE illegal_dumping_mobile 
            SET 
                location_hash = generate_location_hash(lat_val, lng_val, 50),
                latitude = COALESCE(record.latitude, ST_Y(record.coordinates::geometry)),
                longitude = COALESCE(record.longitude, ST_X(record.coordinates::geometry))
            WHERE id = record.id;
            
            updated_count := updated_count + 1;
        END IF;
    END LOOP;
    
    RAISE NOTICE 'Updated % records with location_hash and coordinates', updated_count;
END $$;

-- ============================================================================
-- STEP 10: Grant Permissions
-- ============================================================================

-- Grant execute permissions on functions to authenticated users
GRANT EXECUTE ON FUNCTION find_nearby_dumping TO authenticated;
GRANT EXECUTE ON FUNCTION check_dumping_duplicate TO authenticated;
GRANT EXECUTE ON FUNCTION get_dumping_duplicate_stats TO authenticated;

-- Grant execute permissions on admin functions to appropriate roles
-- Note: Adjust role names based on your actual role structure
DO $$
BEGIN
    -- Check if service_role exists and grant permissions
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        GRANT EXECUTE ON FUNCTION merge_dumping_reports TO service_role;
    END IF;
    
    -- Check if admin role exists and grant permissions
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'admin') THEN
        GRANT EXECUTE ON FUNCTION merge_dumping_reports TO admin;
        GRANT EXECUTE ON FUNCTION get_dumping_duplicate_stats TO admin;
    END IF;
END $$;

-- ============================================================================
-- STEP 11: Create Views for Monitoring
-- ============================================================================

-- View for monitoring potential duplicates
CREATE OR REPLACE VIEW dumping_duplicate_monitoring AS
SELECT 
    d.id,
    d.reported_by,
    d.location,
    d.latitude,
    d.longitude,
    d.waste_type,
    d.severity,
    d.status,
    d.created_at,
    d.location_hash,
    COUNT(*) OVER (PARTITION BY d.location_hash) as similar_reports,
    MIN(d.created_at) OVER (PARTITION BY d.location_hash) as first_report_time,
    CASE 
        WHEN COUNT(*) OVER (PARTITION BY d.location_hash) > 1 THEN 'POTENTIAL_DUPLICATE'
        ELSE 'UNIQUE'
    END as duplicate_status
FROM illegal_dumping_mobile d
WHERE d.created_at > NOW() - INTERVAL '7 days'
ORDER BY d.location_hash, d.created_at;

-- View for user duplicate activity
CREATE OR REPLACE VIEW user_dumping_activity AS
SELECT 
    reported_by,
    COUNT(*) as total_reports,
    COUNT(CASE WHEN location_hash IN (
        SELECT location_hash FROM illegal_dumping_mobile d2 
        WHERE d2.reported_by = illegal_dumping_mobile.reported_by
        GROUP BY location_hash 
        HAVING COUNT(*) > 1
    ) THEN 1 END) as potential_duplicates,
    ROUND(
        (COUNT(CASE WHEN location_hash IN (
            SELECT location_hash FROM illegal_dumping_mobile d2 
            WHERE d2.reported_by = illegal_dumping_mobile.reported_by
            GROUP BY location_hash 
            HAVING COUNT(*) > 1
        ) THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0)), 2
    ) as duplicate_percentage,
    MAX(created_at) as last_report_date,
    MIN(created_at) as first_report_date
FROM illegal_dumping_mobile
GROUP BY reported_by
ORDER BY total_reports DESC;

-- ============================================================================
-- STEP 12: Validation and Testing
-- ============================================================================

-- Test the functions with sample data (commented out for production)
/*
-- Test location hash generation
SELECT generate_location_hash(5.614736, -0.208811, 50) as location_hash;

-- Test nearby reports function
SELECT * FROM find_nearby_dumping(5.614736, -0.208811, 0.1, 24);

-- Test duplicate check function
SELECT * FROM check_dumping_duplicate(
    (SELECT id FROM auth.users LIMIT 1), 
    5.614736, 
    -0.208811, 
    0.05, 
    1
);
*/

-- ============================================================================
-- COMPLETION MESSAGE
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE 'Dumping duplicate prevention migration completed successfully!';
    RAISE NOTICE 'Added features:';
    RAISE NOTICE '- Location hash generation for spatial duplicate detection';
    RAISE NOTICE '- Idempotency token support for retry-safe operations';
    RAISE NOTICE '- Submission fingerprint for client-side duplicate prevention';
    RAISE NOTICE '- Spatial and temporal duplicate prevention triggers';
    RAISE NOTICE '- RPC functions for nearby report detection';
    RAISE NOTICE '- Admin functions for report merging';
    RAISE NOTICE '- Monitoring views for duplicate analysis';
    RAISE NOTICE '- Performance indexes for efficient querying';
END $$;
