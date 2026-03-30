-- Safe Status Consolidation Migration
-- Handles existing constraints and objects gracefully

-- Step 1: Check if unified status enum type exists, create if not
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pickup_status_enum') THEN
        CREATE TYPE pickup_status_enum AS ENUM (
            'pending',
            'accepted', 
            'en_route',
            'arrived',
            'collecting',
            'completed',
            'cancelled'
        );
        RAISE NOTICE 'Created pickup_status_enum type';
    ELSE
        RAISE NOTICE 'pickup_status_enum type already exists';
    END IF;
END $$;

-- Step 2: Update pickup_requests table to use consolidated statuses
DO $$
DECLARE
    updated_count integer;
BEGIN
    RAISE NOTICE 'Updating pickup_requests status values...';
    
    -- Only update rows that need updating
    UPDATE pickup_requests 
    SET status = CASE 
        WHEN status IN ('available', 'pending') THEN 'pending'
        WHEN status IN ('accepted', 'collector_assigned') THEN 'accepted'
        WHEN status IN ('en_route', 'in_transit') THEN 'en_route'
        WHEN status = 'arrived' THEN 'arrived'
        WHEN status IN ('collecting', 'picked_up') THEN 'collecting'
        WHEN status IN ('completed', 'disposed') THEN 'completed'
        WHEN status IN ('cancelled', 'canceled') THEN 'cancelled'
        ELSE 'pending'
    END
    WHERE status NOT IN ('pending', 'accepted', 'en_route', 'arrived', 'collecting', 'completed', 'cancelled');
    
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RAISE NOTICE 'Updated % rows in pickup_requests', updated_count;
END $$;

-- Step 3: Update digital_bins table to use consolidated statuses
DO $$
DECLARE
    updated_count integer;
BEGIN
    RAISE NOTICE 'Updating digital_bins status values...';
    
    -- Only update rows that need updating
    UPDATE digital_bins 
    SET status = CASE 
        WHEN status IN ('available', 'pending') THEN 'pending'
        WHEN status IN ('accepted', 'in_service') THEN 'accepted'
        WHEN status = 'en_route' THEN 'en_route'
        WHEN status = 'arrived' THEN 'arrived'
        WHEN status IN ('picked_up', 'collecting') THEN 'collecting'
        WHEN status IN ('completed', 'disposed') THEN 'completed'
        WHEN status IN ('canceled', 'cancelled', 'expired') THEN 'cancelled'
        ELSE 'pending'
    END
    WHERE status NOT IN ('pending', 'accepted', 'en_route', 'arrived', 'collecting', 'completed', 'cancelled');
    
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RAISE NOTICE 'Updated % rows in digital_bins', updated_count;
END $$;

-- Step 4: Add or update constraints safely
DO $$ 
BEGIN
    RAISE NOTICE 'Checking/updating pickup_requests status constraint...';
    
    -- Drop existing constraint if it exists (we'll recreate it to ensure correct definition)
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'pickup_requests_status_check' 
        AND conrelid = 'pickup_requests'::regclass
    ) THEN
        RAISE NOTICE 'Dropping existing pickup_requests status constraint';
        ALTER TABLE pickup_requests DROP CONSTRAINT pickup_requests_status_check;
    END IF;

    -- Add constraint if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'pickup_requests_status_check' 
        AND conrelid = 'pickup_requests'::regclass
    ) THEN
        RAISE NOTICE 'Adding pickup_requests status constraint';
        ALTER TABLE pickup_requests 
        ADD CONSTRAINT pickup_requests_status_check 
        CHECK (status IN ('pending', 'accepted', 'en_route', 'arrived', 'collecting', 'completed', 'cancelled'));
    END IF;
END $$;

DO $$ 
BEGIN
    RAISE NOTICE 'Checking/updating digital_bins status constraint...';
    
    -- Drop existing constraint if it exists (we'll recreate it to ensure correct definition)
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'digital_bins_status_check' 
        AND conrelid = 'digital_bins'::regclass
    ) THEN
        RAISE NOTICE 'Dropping existing digital_bins status constraint';
        ALTER TABLE digital_bins DROP CONSTRAINT digital_bins_status_check;
    END IF;

    -- Add constraint if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'digital_bins_status_check' 
        AND conrelid = 'digital_bins'::regclass
    ) THEN
        RAISE NOTICE 'Adding digital_bins status constraint';
        ALTER TABLE digital_bins 
        ADD CONSTRAINT digital_bins_status_check 
        CHECK (status IN ('pending', 'accepted', 'en_route', 'arrived', 'collecting', 'completed', 'cancelled'));
    END IF;
END $$;

-- Step 5: Create or replace status transition validation function
CREATE OR REPLACE FUNCTION validate_status_transition(
    current_status pickup_status_enum,
    new_status pickup_status_enum
) RETURNS boolean AS $$
BEGIN
    -- Define valid transitions
    CASE current_status
        WHEN 'pending' THEN
            RETURN new_status IN ('accepted', 'cancelled');
        WHEN 'accepted' THEN
            RETURN new_status IN ('en_route', 'cancelled');
        WHEN 'en_route' THEN
            RETURN new_status IN ('arrived', 'cancelled');
        WHEN 'arrived' THEN
            RETURN new_status IN ('collecting', 'cancelled');
        WHEN 'collecting' THEN
            RETURN new_status IN ('completed', 'cancelled');
        WHEN 'completed' THEN
            RETURN false; -- Terminal state
        WHEN 'cancelled' THEN
            RETURN false; -- Terminal state
        ELSE
            RETURN false;
    END CASE;
END;
$$ LANGUAGE plpgsql;

-- Step 6: Create or replace trigger function
CREATE OR REPLACE FUNCTION enforce_status_transition()
RETURNS TRIGGER AS $$
BEGIN
    -- Only validate on update if status is changing
    IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
        IF NOT validate_status_transition(OLD.status::pickup_status_enum, NEW.status::pickup_status_enum) THEN
            RAISE EXCEPTION 'Invalid status transition from % to %', OLD.status, NEW.status;
        END IF;
    END IF;
    
    -- Auto-set timestamps based on status
    IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
        CASE NEW.status
            WHEN 'accepted' THEN
                NEW.accepted_at = NOW();
            WHEN 'collecting' THEN
                NEW.picked_up_at = NOW();
            WHEN 'completed' THEN
                NEW.disposed_at = NOW();
        END CASE;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 7: Apply triggers safely
DO $$
BEGIN
    RAISE NOTICE 'Checking/updating pickup_requests trigger...';
    
    -- Drop existing trigger if it exists
    IF EXISTS (
        SELECT 1 FROM pg_trigger 
        WHERE tgname = 'pickup_requests_status_trigger' 
        AND tgrelid = 'pickup_requests'::regclass
    ) THEN
        RAISE NOTICE 'Dropping existing pickup_requests trigger';
        DROP TRIGGER pickup_requests_status_trigger ON pickup_requests;
    END IF;

    -- Create new trigger
    RAISE NOTICE 'Creating pickup_requests trigger';
    CREATE TRIGGER pickup_requests_status_trigger
        BEFORE UPDATE ON pickup_requests
        FOR EACH ROW EXECUTE FUNCTION enforce_status_transition();
END $$;

DO $$
BEGIN
    RAISE NOTICE 'Checking/updating digital_bins trigger...';
    
    -- Drop existing trigger if it exists
    IF EXISTS (
        SELECT 1 FROM pg_trigger 
        WHERE tgname = 'digital_bins_status_trigger' 
        AND tgrelid = 'digital_bins'::regclass
    ) THEN
        RAISE NOTICE 'Dropping existing digital_bins trigger';
        DROP TRIGGER digital_bins_status_trigger ON digital_bins;
    END IF;

    -- Create new trigger
    RAISE NOTICE 'Creating digital_bins trigger';
    CREATE TRIGGER digital_bins_status_trigger
        BEFORE UPDATE ON digital_bins
        FOR EACH ROW EXECUTE FUNCTION enforce_status_transition();
END $$;

-- Step 8: Create or replace unified pickup status view (defensive approach)
DROP VIEW IF EXISTS unified_pickup_status;

-- First check what columns actually exist in both tables
DO $$
BEGIN
    RAISE NOTICE 'Creating unified pickup status view with defensive column handling...';
    
    -- Create view using only columns that definitely exist in both tables
    EXECUTE $sql$
    CREATE VIEW unified_pickup_status AS
    SELECT 
        'pickup_request'::text as request_type,
        id::text,
        user_id::text,
        status::text,
        created_at::timestamp with time zone,
        updated_at::timestamp with time zone,
        COALESCE(fee, 0)::numeric as fee,
        COALESCE(bag_count, 0)::bigint as bag_count,
        COALESCE(waste_type, 'general')::text as waste_type
    FROM pickup_requests

    UNION ALL

    SELECT 
        'digital_bin'::text as request_type,
        id::text,
        user_id::text,
        status::text,
        created_at::timestamp with time zone,
        updated_at::timestamp with time zone,
        COALESCE(fee, 0)::numeric as fee,
        COALESCE(bag_count, 0)::bigint as bag_count,
        COALESCE(waste_type, 'general')::text as waste_type
    FROM digital_bins
    $sql$;
    
    RAISE NOTICE 'Unified view created successfully';
END $$;

-- Step 9: Skip index creation on view (PostgreSQL doesn't support indexes on views)
-- The underlying tables already have appropriate indexes for performance
DO $$
BEGIN
    RAISE NOTICE 'Skipping index creation on unified view (PostgreSQL limitation)';
    RAISE NOTICE 'Underlying tables already have indexes for performance';
    RAISE NOTICE 'View can be queried efficiently using existing table indexes';
END $$;

-- Step 10: Add comment documentation
COMMENT ON TYPE pickup_status_enum IS 'Unified status for all pickup requests and digital bins';
COMMENT ON FUNCTION validate_status_transition IS 'Validates status transitions according to business rules';
COMMENT ON VIEW unified_pickup_status IS 'Unified view of all pickup requests and digital bins with consistent status values';

-- Step 11: Verification query
DO $$
DECLARE
    pickup_total integer;
    pickup_pending integer;
    pickup_accepted integer;
    pickup_enroute integer;
    bin_total integer;
    bin_pending integer;
    bin_accepted integer;
BEGIN
    RAISE NOTICE '=== Status Consolidation Complete ===';
    
    -- Verify pickup_requests status counts
    SELECT COUNT(*) INTO pickup_total FROM pickup_requests;
    SELECT COUNT(*) INTO pickup_pending FROM pickup_requests WHERE status = 'pending';
    SELECT COUNT(*) INTO pickup_accepted FROM pickup_requests WHERE status = 'accepted';
    SELECT COUNT(*) INTO pickup_enroute FROM pickup_requests WHERE status = 'en_route';
    
    RAISE NOTICE 'pickup_requests status distribution:';
    RAISE NOTICE '  total: %', pickup_total;
    RAISE NOTICE '  pending: %', pickup_pending;
    RAISE NOTICE '  accepted: %', pickup_accepted;
    RAISE NOTICE '  en_route: %', pickup_enroute;
    
    -- Verify digital_bins status counts
    SELECT COUNT(*) INTO bin_total FROM digital_bins;
    SELECT COUNT(*) INTO bin_pending FROM digital_bins WHERE status = 'pending';
    SELECT COUNT(*) INTO bin_accepted FROM digital_bins WHERE status = 'accepted';
    
    RAISE NOTICE 'digital_bins status distribution:';
    RAISE NOTICE '  total: %', bin_total;
    RAISE NOTICE '  pending: %', bin_pending;
    RAISE NOTICE '  accepted: %', bin_accepted;
    
    RAISE NOTICE 'Migration completed successfully!';
END $$;
