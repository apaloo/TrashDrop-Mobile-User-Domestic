import supabase from './supabaseClient.js';
import { getQRCode, invalidateQRCode } from './qrStorage.js';

/**
 * Parse and validate the QR code data
 * @param {string} qrData - The raw QR code data
 * @returns {Object} Parsed and validated QR code data
 */
export const parseQRCodeData = (qrData) => {
  try {
    // Check if the QR code is in the expected format
    if (!qrData.startsWith('trashdrop-')) {
      throw new Error('Invalid QR code format');
    }
    
    // Extract the payload (remove the 'trashdrop-' prefix)
    const payload = qrData.substring(10);
    
    // In a production app, you would decrypt the payload here
    // For now, we'll assume it's a JSON string with pickupId and userId
    const parsedData = JSON.parse(payload);
    
    // Validate required fields
    if (!parsedData.pickupId || !parsedData.userId) {
      throw new Error('Invalid QR code data: missing required fields');
    }
    
    return {
      pickupId: parsedData.pickupId,
      userId: parsedData.userId,
      timestamp: parsedData.timestamp || null,
      locationId: parsedData.locationId || null,
      isValid: true
    };
  } catch (error) {
    console.error('Error parsing QR code data:', error);
    return {
      isValid: false,
      error: error.message || 'Invalid QR code'
    };
  }
};

/**
 * Validate a pickup by checking if it exists and is in a valid state
 * @param {string} pickupId - The ID of the pickup to validate
 * @param {string} userId - The ID of the user who owns the pickup
 * @returns {Promise<Object>} The validated pickup data or an error object
 */
export const validatePickup = async (pickupId, userId) => {
  try {
    // Check if the QR code is still valid
    const qrCode = await getQRCode(pickupId);
    
    if (!qrCode || !qrCode.is_active) {
      return {
        isValid: false,
        error: 'This QR code has expired or has already been used',
        errorCode: 'QR_CODE_INVALID'
      };
    }
    
    // Check if the pickup exists and belongs to the user
    const { data: pickup, error } = await supabase
      .from('scheduled_pickups')
      .select('*, location:locations(*)')
      .eq('id', pickupId)
      .eq('user_id', userId)
      .single();
    
    if (error || !pickup) {
      return {
        isValid: false,
        error: 'Pickup not found or you do not have permission to access it',
        errorCode: 'PICKUP_NOT_FOUND'
      };
    }
    
    // Check if the pickup is in a valid state
    if (pickup.status !== 'scheduled') {
      return {
        isValid: false,
        error: `This pickup has already been ${pickup.status}`,
        errorCode: 'INVALID_PICKUP_STATUS',
        currentStatus: pickup.status
      };
    }
    
    return {
      isValid: true,
      pickup: {
        ...pickup,
        location_name: pickup.location?.name || 'Unknown Location',
        address: pickup.location?.address || 'No address provided'
      }
    };
  } catch (error) {
    console.error('Error validating pickup:', error);
    return {
      isValid: false,
      error: 'An error occurred while validating the pickup',
      errorCode: 'VALIDATION_ERROR'
    };
  }
};

/**
 * Update the status of a pickup
 * @param {string} pickupId - The ID of the pickup to update
 * @param {string} status - The new status (e.g., 'in_progress', 'completed', 'cancelled')
 * @param {Object} collectorData - Information about the collector
 * @returns {Promise<Object>} The updated pickup or an error object
 */
export const updatePickupStatus = async (pickupId, status, collectorData = {}) => {
  try {
    const updates = {
      status,
      updated_at: new Date().toISOString()
    };
    
    // Add collector information if provided
    if (collectorData.id) {
      updates.collector_id = collectorData.id;
      updates.collector_name = collectorData.name || null;
      updates.collector_phone = collectorData.phone || null;
    }
    
    // Add timestamp for specific status changes
    if (status === 'in_progress') {
      updates.pickup_started_at = new Date().toISOString();
    } else if (status === 'completed') {
      updates.pickup_completed_at = new Date().toISOString();
    } else if (status === 'cancelled') {
      updates.pickup_cancelled_at = new Date().toISOString();
    }
    
    const { data: updatedPickup, error } = await supabase
      .from('scheduled_pickups')
      .update(updates)
      .eq('id', pickupId)
      .select('*, location:locations(*)')
      .single();
    
    if (error) throw error;
    
    // Invalidate the QR code after successful status update
    if (status === 'completed' || status === 'cancelled') {
      await invalidateQRCode(pickupId);
    }
    
    return {
      success: true,
      pickup: {
        ...updatedPickup,
        location_name: updatedPickup.location?.name || 'Unknown Location',
        address: updatedPickup.location?.address || 'No address provided'
      }
    };
  } catch (error) {
    console.error('Error updating pickup status:', error);
    return {
      success: false,
      error: error.message || 'Failed to update pickup status',
      errorCode: 'UPDATE_ERROR'
    };
  }
};

/**
 * Process a scanned QR code
 * @param {string} qrData - The raw QR code data
 * @param {Object} collectorData - Information about the collector
 * @returns {Promise<Object>} The result of the QR code processing
 */
export const processQRCode = async (qrData, collectorData) => {
  // Parse the QR code data
  const qrInfo = parseQRCodeData(qrData);
  if (!qrInfo.isValid) {
    return {
      success: false,
      error: qrInfo.error || 'Invalid QR code',
      errorCode: 'INVALID_QR_CODE'
    };
  }
  
  // Validate the pickup
  const validation = await validatePickup(qrInfo.pickupId, qrInfo.userId);
  if (!validation.isValid) {
    return {
      success: false,
      error: validation.error,
      errorCode: validation.errorCode,
      currentStatus: validation.currentStatus
    };
  }
  
  // Update the pickup status to 'in_progress'
  const result = await updatePickupStatus(
    qrInfo.pickupId, 
    'in_progress', 
    collectorData
  );
  
  if (!result.success) {
    return {
      success: false,
      error: result.error || 'Failed to update pickup status',
      errorCode: result.errorCode || 'UPDATE_ERROR'
    };
  }
  
  return {
    success: true,
    pickup: result.pickup,
    message: 'Pickup started successfully',
    nextStep: 'collect_waste' // Indicate the next step in the workflow
  };
};
