import { supabase } from './supabaseClient';

// Default expiration time: 7 days in seconds
const DEFAULT_EXPIRATION = 7 * 24 * 60 * 60;

/**
 * Stores a QR code in the database with an expiration time
 * @param {Object} params - The parameters object
 * @param {string} params.userId - The ID of the user who owns the QR code
 * @param {string} params.pickupId - The ID of the pickup associated with the QR code
 * @param {string} params.qrCodeUrl - The URL of the QR code image
 * @param {number} [params.expiresInSeconds] - Optional expiration time in seconds (default: 7 days)
 * @returns {Promise<Object>} The stored QR code data
 */
export const storeQRCode = async ({ userId, pickupId, qrCodeUrl, expiresInSeconds = DEFAULT_EXPIRATION }) => {
  try {
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + expiresInSeconds);

    const { data, error } = await supabase
      .from('qr_codes')
      .insert([
        {
          user_id: userId,
          pickup_id: pickupId,
          qr_code_url: qrCodeUrl,
          expires_at: expiresAt.toISOString(),
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ])
      .select('*')
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error storing QR code:', error);
    throw error;
  }
};

/**
 * Retrieves an active QR code for a pickup
 * @param {string} pickupId - The ID of the pickup
 * @returns {Promise<Object|null>} The QR code data or null if not found/expired
 */
export const getQRCode = async (pickupId) => {
  try {
    const { data, error } = await supabase
      .from('qr_codes')
      .select('*')
      .eq('pickup_id', pickupId)
      .eq('is_active', true)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error retrieving QR code:', error);
    return null;
  }
};

/**
 * Invalidates a QR code (marks as inactive)
 * @param {string} qrCodeId - The ID of the QR code to invalidate
 * @returns {Promise<boolean>} True if successful, false otherwise
 */
export const invalidateQRCode = async (qrCodeId) => {
  try {
    const { error } = await supabase
      .from('qr_codes')
      .update({ 
        is_active: false,
        updated_at: new Date().toISOString()
      })
      .eq('id', qrCodeId);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error invalidating QR code:', error);
    return false;
  }
};

/**
 * Cleans up expired QR codes
 * @returns {Promise<number>} Number of QR codes cleaned up
 */
export const cleanupExpiredQRCodes = async () => {
  try {
    const { data, error } = await supabase.rpc('cleanup_expired_qr_codes');
    
    if (error) throw error;
    return data || 0;
  } catch (error) {
    console.error('Error cleaning up expired QR codes:', error);
    return 0;
  }
};

// Run cleanup on import (optional, could be run on app start)
// cleanupExpiredQRCodes().catch(console.error);

export default {
  storeQRCode,
  getQRCode,
  invalidateQRCode,
  cleanupExpiredQRCodes
};
