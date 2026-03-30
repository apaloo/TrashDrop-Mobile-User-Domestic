-- Status Consolidation Migration
-- Consolidates inconsistent status values across pickup_requests and digital_bins tables

-- Step 1: Create unified status enum type
DO $$ BEGIN
    CREATE TYPE pickup_status_enum AS ENUM (
        'pending',
        'accepted', 
        'en_route',
        'arrived',
        'collecting',
        'completed',
        'cancelled'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Step 2: Update pickup_requests table to use consolidated statuses
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

-- Step 3: Update digital_bins table to use consolidated statuses
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

-- Step 4: Add constraints to enforce new status values (only if they don't exist)
DO $$ 
BEGIN
    -- Check if constraint exists before adding
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'pickup_requests_status_check' 
        AND conrelid = 'pickup_requests'::regclass
    ) THEN
        ALTER TABLE pickup_requests 
        ADD CONSTRAINT pickup_requests_status_check 
        CHECK (status IN ('pending', 'accepted', 'en_route', 'arrived', 'collecting', 'completed', 'cancelled'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'digital_bins_status_check' 
        AND conrelid = 'digital_bins'::regclass
    ) THEN
        ALTER TABLE digital_bins 
        ADD CONSTRAINT digital_bins_status_check 
        CHECK (status IN ('pending', 'accepted', 'en_route', 'arrived', 'collecting', 'completed', 'cancelled'));
    END IF;
END $$;

-- Step 5: Create status transition validation function
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

-- Step 6: Add trigger for automatic status validation
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

-- Step 7: Apply triggers to both tables (only if they don't exist)
DO $$
BEGIN
    -- Check if trigger exists before creating
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger 
        WHERE tgname = 'pickup_requests_status_trigger' 
        AND tgrelid = 'pickup_requests'::regclass
    ) THEN
        CREATE TRIGGER pickup_requests_status_trigger
            BEFORE UPDATE ON pickup_requests
            FOR EACH ROW EXECUTE FUNCTION enforce_status_transition();
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger 
        WHERE tgname = 'digital_bins_status_trigger' 
        AND tgrelid = 'digital_bins'::regclass
    ) THEN
        CREATE TRIGGER digital_bins_status_trigger
            BEFORE UPDATE ON digital_bins
            FOR EACH ROW EXECUTE FUNCTION enforce_status_transition();
    END IF;
END $$;

-- Step 8: Create unified pickup status view for easy querying
CREATE OR REPLACE VIEW unified_pickup_status AS
SELECT 
    'pickup_request' as request_type,
    id,
    user_id,
    collector_id,
    status,
    accepted_at,
    picked_up_at,
    disposed_at,
    created_at,
    updated_at,
    location,
    address,
    fee,
    bag_count,
    waste_type,
    special_instructions
FROM pickup_requests

UNION ALL

SELECT 
    'digital_bin' as request_type,
    id,
    user_id,
    collector_id,
    status,
    accepted_at,
    collected_at as picked_up_at,
    disposed_at,
    created_at,
    updated_at,
    NULL as location,
    NULL as address,
    fee,
    bag_count,
    waste_type,
    NULL as special_instructions
FROM digital_bins;

-- Step 9: Create index for performance (only if they don't exist)
DO $$
BEGIN
    -- Check if index exists before creating
    IF NOT EXISTS (
        SELECT 1 FROM pg_index 
        WHERE indexrelid = 'idx_unified_pickup_status_user_status'::regclass
    ) THEN
        CREATE INDEX idx_unified_pickup_status_user_status ON unified_pickup_status(user_id, status);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_index 
        WHERE indexrelid = 'idx_unified_pickup_status_collector_status'::regclass
    ) THEN
        CREATE INDEX idx_unified_pickup_status_collector_status ON unified_pickup_status(collector_id, status) WHERE collector_id IS NOT NULL;
    END IF;
END $$;

-- Step 10: Add comment documentation
COMMENT ON TYPE pickup_status_enum IS 'Unified status for all pickup requests and digital bins';
COMMENT ON FUNCTION validate_status_transition IS 'Validates status transitions according to business rules';
COMMENT ON VIEW unified_pickup_status IS 'Unified view of all pickup requests and digital bins with consistent status values';
