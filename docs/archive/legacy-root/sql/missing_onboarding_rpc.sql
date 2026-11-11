-- Missing RPC Functions for Onboarding Service
-- These functions are called by the onboardingService.js but were missing from the original SQL

-- 1. GET USER HAS BAGS SELECTION
CREATE OR REPLACE FUNCTION get_user_has_bags_selection(user_uuid UUID)
RETURNS JSON AS $$
DECLARE
  has_bags_selection BOOLEAN := FALSE;
  selection_made BOOLEAN := FALSE;
  has_bags BOOLEAN := FALSE;
BEGIN
  -- Check if user has made a bags selection
  SELECT EXISTS(
    SELECT 1 FROM user_activity 
    WHERE user_id = user_uuid AND activity_type IN ('has_bags_true', 'has_bags_false')
  ) INTO selection_made;
  
  -- If selection made, determine what they selected
  IF selection_made THEN
    has_bags_selection := TRUE;
    
    -- Check if they selected "has bags"
    SELECT EXISTS(
      SELECT 1 FROM user_activity 
      WHERE user_id = user_uuid AND activity_type = 'has_bags_true'
    ) INTO has_bags;
  END IF;
  
  RETURN JSON_BUILD_OBJECT(
    'selection_made', has_bags_selection,
    'has_bags', has_bags,
    'next_step', CASE 
      WHEN NOT selection_made THEN 'has_bags'
      WHEN has_bags THEN 'location'
      ELSE 'choose_service'
    END
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. DISMISS ONBOARDING
CREATE OR REPLACE FUNCTION dismiss_onboarding(user_uuid UUID)
RETURNS JSON AS $$
BEGIN
  -- Mark onboarding as completed/dismissed
  INSERT INTO user_activity (user_id, activity_type, description)
  VALUES (user_uuid, 'onboarding_completed', 'User dismissed onboarding')
  ON CONFLICT (user_id, activity_type) DO NOTHING;
  
  RETURN JSON_BUILD_OBJECT('success', TRUE, 'message', 'Onboarding dismissed');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. PROCESS QR SCAN
CREATE OR REPLACE FUNCTION process_qr_scan(user_uuid UUID, qr TEXT)
RETURNS JSON AS $$
DECLARE
  batch_record RECORD;
  qr_scan_record RECORD;
BEGIN
  -- Check if QR code exists in batches table
  SELECT * INTO batch_record
  FROM batches 
  WHERE qr_code = qr AND created_by = user_uuid;
  
  IF NOT FOUND THEN
    RETURN JSON_BUILD_OBJECT('success', FALSE, 'error', 'QR code not found or not owned by user');
  END IF;
  
  -- Record QR scan activity
  INSERT INTO user_activity (user_id, activity_type, description, metadata)
  VALUES (user_uuid, 'qr_scan', 'QR code scanned during onboarding', 
          JSON_BUILD_OBJECT('qr_code', qr, 'batch_id', batch_record.id))
  ON CONFLICT (user_id, activity_type, metadata) DO NOTHING;
  
  RETURN JSON_BUILD_OBJECT('success', TRUE, 'batch_id', batch_record.id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. CREATE DIGITAL BIN
CREATE OR REPLACE FUNCTION create_digital_bin(user_uuid UUID, location_id UUID DEFAULT NULL)
RETURNS JSON AS $$
DECLARE
  bin_id UUID;
  bin_record RECORD;
BEGIN
  -- Create digital bin
  INSERT INTO digital_bins (user_id, location_id, status, is_active, created_at)
  VALUES (user_uuid, location_id, 'available', TRUE, NOW())
  RETURNING id INTO bin_id;
  
  -- Record digital bin creation activity
  INSERT INTO user_activity (user_id, activity_type, description, metadata)
  VALUES (user_uuid, 'digital_bin_requested', 'Digital bin created during onboarding',
          JSON_BUILD_OBJECT('bin_id', bin_id, 'location_id', location_id));
  
  RETURN JSON_BUILD_OBJECT('success', TRUE, 'bin_id', bin_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. START ONBOARDING
CREATE OR REPLACE FUNCTION start_onboarding(user_uuid UUID)
RETURNS JSON AS $$
BEGIN
  -- Record onboarding start
  INSERT INTO user_activity (user_id, activity_type, description)
  VALUES (user_uuid, 'onboarding_started', 'User started onboarding')
  ON CONFLICT (user_id, activity_type) DO NOTHING;
  
  RETURN JSON_BUILD_OBJECT('success', TRUE, 'message', 'Onboarding started');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions to authenticated users
DO $$
BEGIN
  -- Grant execute permissions for all new functions
  GRANT EXECUTE ON FUNCTION get_user_has_bags_selection TO authenticated;
  GRANT EXECUTE ON FUNCTION dismiss_onboarding TO authenticated;
  GRANT EXECUTE ON FUNCTION process_qr_scan TO authenticated;
  GRANT EXECUTE ON FUNCTION create_digital_bin TO authenticated;
  GRANT EXECUTE ON FUNCTION start_onboarding TO authenticated;
END $$;
