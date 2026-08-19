import supabase from './supabaseClient.js';
import QRCode from 'qrcode';

// Default expiration time: 7 days in seconds
const DEFAULT_EXPIRATION = 7 * 24 * 60 * 60;

// Generate a proper QR code using the qrcode library.
// The encoded value MUST be the digital bin id: the collector app decodes
// ".../bin/<uuid>" and matches it against digital_bins.id. A location id is
// reused across bookings at the same address and cannot identify a pickup.
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
 * Stores a QR code locally first, then optionally syncs to Supabase.
 *
 * Keyed by DIGITAL BIN id. It used to be keyed by location id, which meant two
 * bins booked at the same address shared one cache entry and the second bin
 * displayed the first bin's QR — the collector then rejected it as "Wrong bin".
 *
 * @param {string} binId - The ID of the digital bin this QR identifies
 * @param {string} qrCodeUrl - The QR image data URL (optional, generated if absent)
 * @param {Object} [options] - Optional configuration
 * @param {boolean} [options.syncToSupabase] - Whether to sync to Supabase (default: false)
 * @param {string} [options.locationId] - The location the bin sits at, for reference only
 * @returns {Promise<Object>} The stored QR code data
 */
export const storeQRCode = async (binId, qrCodeUrl = null, options = {}) => {
  try {
    const { syncToSupabase = false, locationId = null } = options;
    
    // Generate QR code data if not provided
    let qrData;
    if (qrCodeUrl) {
      qrData = {
        binId,
        locationId,
        qrCodeUrl,
        url: `https://trashdrop.app/bin/${binId}`,
        timestamp: Date.now(),
        expires: Date.now() + (DEFAULT_EXPIRATION * 1000),
        dataString: qrCodeUrl
      };
    } else {
      qrData = await generateQRCodeData(binId, locationId);
    }
    
    // Always store in localStorage first (local-first approach)
    const storageKey = `qr_${binId}`;
    const qrStorage = {
      ...qrData,
      storedAt: Date.now(),
      syncedToSupabase: false
    };
    
    localStorage.setItem(storageKey, JSON.stringify(qrStorage));
    console.log(`[QR Storage] QR code stored locally for bin: ${binId}`);
    
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
 * @param {string} binId - The ID of the digital bin
 * @returns {Promise<Object|null>} The QR code data or null if not found/expired
 */
export const getQRCode = async (binId) => {
  try {
    // First, check localStorage (local-first approach)
    const storageKey = `qr_${binId}`;
    const storedQR = localStorage.getItem(storageKey);
    
    if (storedQR) {
      const qrData = JSON.parse(storedQR);
      
      // Check if it's still valid
      if (qrData.expires && Date.now() < qrData.expires) {
        console.log(`[QR Storage] Found valid QR code in localStorage for bin: ${binId}`);
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
        .eq('id', binId)
        .eq('is_active', true)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();

      if (error) {
        console.warn(`[QR Storage] Could not fetch from Supabase:`, error);
        return null;
      }
      
      if (data) {
        console.log(`[QR Storage] Found digital bin in Supabase for bin: ${binId}`);
        // DON'T store to localStorage - Supabase data doesn't have the generated qrCodeUrl image
        // Return null so the component knows it needs to generate a QR code
        console.log(`[QR Storage] Supabase data doesn't have generated image, needs generation`);
      }
      
      return null;
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
