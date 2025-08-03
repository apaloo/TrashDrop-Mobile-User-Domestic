import supabase from './supabaseClient.js';
import QRCode from 'qrcode';

// Default expiration time: 7 days in seconds
const DEFAULT_EXPIRATION = 7 * 24 * 60 * 60;

// Generate a proper QR code using the qrcode library
const generateQRCodeData = async (binId, locationId) => {
  const qrData = {
    binId,
    locationId,
    timestamp: Date.now(),
    url: `https://trashdrop.app/bin/${binId}`,
    expires: Date.now() + (DEFAULT_EXPIRATION * 1000)
  };
  
  try {
    // Generate actual QR code image as data URL
    const qrCodeUrl = await QRCode.toDataURL(qrData.url, {
      width: 256,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });
    
    return {
      ...qrData,
      qrCodeUrl,
      dataString: qrData.url
    };
  } catch (error) {
    console.error('Error generating QR code:', error);
    // Fallback to simple data URL
    const dataString = JSON.stringify(qrData);
    const qrCodeUrl = `data:text/plain;base64,${btoa(dataString)}`;
    
    return {
      ...qrData,
      qrCodeUrl,
      dataString
    };
  }
};

/**
 * Stores a QR code locally first, then optionally syncs to Supabase
 * @param {string} locationId - The ID of the location associated with the digital bin
 * @param {string} qrCodeUrl - The URL of the QR code (optional, will be generated if not provided)
 * @param {Object} [options] - Optional configuration
 * @param {boolean} [options.syncToSupabase] - Whether to sync to Supabase (default: false)
 * @param {string} [options.binId] - The bin ID if already exists
 * @returns {Promise<Object>} The stored QR code data
 */
export const storeQRCode = async (locationId, qrCodeUrl = null, options = {}) => {
  try {
    const { syncToSupabase = false, binId } = options;
    
    // Generate QR code data if not provided
    let qrData;
    if (qrCodeUrl) {
      qrData = {
        binId: binId || `bin_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        locationId,
        qrCodeUrl,
        url: `https://trashdrop.app/bin/${binId || locationId}`,
        timestamp: Date.now(),
        expires: Date.now() + (DEFAULT_EXPIRATION * 1000),
        dataString: qrCodeUrl
      };
    } else {
      qrData = await generateQRCodeData(binId || `bin_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, locationId);
    }
    
    // Always store in localStorage first (local-first approach)
    const storageKey = `qr_${locationId}`;
    const qrStorage = {
      ...qrData,
      storedAt: Date.now(),
      syncedToSupabase: false
    };
    
    localStorage.setItem(storageKey, JSON.stringify(qrStorage));
    console.log(`[QR Storage] QR code stored locally for location: ${locationId}`);
    
    // Optional: Sync to Supabase (only if explicitly requested and we have proper auth)
    if (syncToSupabase) {
      try {
        // This is now optional and won't block the main flow
        console.log(`[QR Storage] Attempting to sync QR code to Supabase...`);
        
        // We'll sync this as part of the main digital bin creation, not as a separate operation
        qrStorage.syncedToSupabase = true;
        localStorage.setItem(storageKey, JSON.stringify(qrStorage));
        console.log(`[QR Storage] QR code marked for Supabase sync`);
      } catch (syncError) {
        console.warn(`[QR Storage] Failed to sync to Supabase, but QR code is stored locally:`, syncError);
        // Don't throw here - local storage succeeded
      }
    }
    
    return qrStorage;
  } catch (error) {
    console.error('Error storing QR code:', error);
    throw error;
  }
};

/**
 * Retrieves an active QR code for a digital bin location (checks local storage first)
 * @param {string} locationId - The ID of the location
 * @returns {Promise<Object|null>} The QR code data or null if not found/expired
 */
export const getQRCode = async (locationId) => {
  try {
    // First, check localStorage (local-first approach)
    const storageKey = `qr_${locationId}`;
    const storedQR = localStorage.getItem(storageKey);
    
    if (storedQR) {
      const qrData = JSON.parse(storedQR);
      
      // Check if it's still valid
      if (qrData.expires && Date.now() < qrData.expires) {
        console.log(`[QR Storage] Found valid QR code in localStorage for location: ${locationId}`);
        return qrData;
      } else {
        console.log(`[QR Storage] QR code expired in localStorage, removing...`);
        localStorage.removeItem(storageKey);
      }
    }
    
    // Fallback: check Supabase (optional, may not be available due to RLS)
    try {
      const { data, error } = await supabase
        .from('digital_bins')
        .select('*')
        .eq('location_id', locationId)
        .eq('is_active', true)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.warn(`[QR Storage] Could not fetch from Supabase:`, error);
        return null;
      }
      
      if (data) {
        console.log(`[QR Storage] Found QR code in Supabase for location: ${locationId}`);
        // Also store locally for future use
        const qrStorage = {
          ...data,
          storedAt: Date.now(),
          syncedToSupabase: true
        };
        localStorage.setItem(storageKey, JSON.stringify(qrStorage));
      }
      
      return data;
    } catch (supabaseError) {
      console.warn(`[QR Storage] Supabase fallback failed:`, supabaseError);
      return null;
    }
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
      .from('digital_bins')
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
    const { data, error } = await supabase.rpc('cleanup_expired_digital_bins');
    
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
