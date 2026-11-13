/**
 * Service for managing illegal dumping reports and history
 */

import supabase from '../utils/supabaseClient.js';
import { toastService } from '../services/toastService.js';
import { retrySupabaseOperation } from '../utils/retryUtils.js';
import syncService from './syncService.js';
import { prepareReportPhotos, isLocalPhotoUrl } from './photoUploadService.js';
import { reverseGeocode as lookUpAddress } from '../utils/reverseGeocode.js';

/**
 * General area for the public map, "Town, Region" (e.g. "Pokuase, Greater Accra Region").
 * Matches the admin portal's scripts/backfill-area-names.mjs.
 */
export const areaFromAddress = (address = {}) => {
  const town = address.city || address.town || address.village || address.suburb || address.municipality || address.county;
  const region = address.state || address.region;
  const parts = [town, region].filter(Boolean);
  return parts.filter((p, i) => parts.indexOf(p) === i).join(', ') || null;
};

/**
 * Get address and area from coordinates using reverse geocoding
 * @param {number} latitude - Latitude
 * @param {number} longitude - Longitude
 * @returns {Promise<{formattedAddress: string, area: string|null}|null>} null if the lookup fails
 */
const reverseGeocode = async (latitude, longitude) => {
  const found = await lookUpAddress(latitude, longitude);
  if (!found) {
    console.warn('[DumpingService] Reverse geocoding found no address');
    return null;
  }
  // Build the address from its parts (shorter than the full display name)
  const address = found.address;
  const parts = [
    address.road || address.street,
    address.suburb || address.neighbourhood,
    address.city || address.town || address.village,
    address.state || address.region,
    address.country
  ].filter(Boolean);
  const formattedAddress = parts.length > 0 ? parts.join(', ') : found.displayName;
  return { formattedAddress, area: areaFromAddress(address) };
};

/**
 * Maps the estimated_volume value from the form to the required size value for the database
 * @param {string} estimatedVolume - Value from the form's estimated_volume field
 * @returns {string} Size value for database (small, medium, or large)
 */
const mapEstimatedVolumeToSize = (estimatedVolume) => {
  // Default to 'medium' if no valid value provided
  if (!estimatedVolume) return 'medium';
  
  // Map the form values to database size categories
  const estimatedVolumeLower = estimatedVolume.toLowerCase();
  
  if (estimatedVolumeLower.includes('small') || estimatedVolumeLower.includes('few bags')) {
    return 'small';
  } else if (estimatedVolumeLower.includes('large') || estimatedVolumeLower.includes('truck')) {
    return 'large';
  } else {
    // For everything else (medium size, unknown, etc.), use 'medium'
    return 'medium';
  }
};

export const SESSION_EXPIRED_MESSAGE =
  'Your sign-in has ended. Sign in again to send this report: it and its photos are kept on this phone.';

/**
 * True only when Supabase says there is no session: it renews an expired one
 * first and drops it when the server refuses the renewal. A lookup that fails
 * (no connection) is not treated as signed out.
 */
const sessionEnded = async () => {
  try {
    const { data, error } = await supabase.auth.getSession();
    return !error && !data?.session;
  } catch {
    return false;
  }
};

const sessionExpiredError = () => {
  const err = new Error(SESSION_EXPIRED_MESSAGE);
  err.code = 'SESSION_EXPIRED';
  return err;
};

export const dumpingService = {
  /**
   * Create a new illegal dumping report
   * @param {string} userId - User ID reporting the dumping
   * @param {Object} reportData - Report details
   * @returns {Object} Created report
   */
  async createReport(userId, reportData) {
    const validatePhotoUrls = (urls) => {
      if (!Array.isArray(urls)) return false;
      return urls.every(url => {
        try {
          new URL(url);
          return true;
        } catch {
          return false;
        }
      });
    };

    const validateEnumValue = (value, allowedValues) => {
      return allowedValues.includes(value);
    };

    try {
      if (!userId) {
        throw new Error('User ID is required');
      }
      
      console.log('[DumpingService] Creating dumping report for user:', userId);

      // Validate required coordinates - handle both direct lat/lng and GeoJSON Point format
      let latitude, longitude;
      if (reportData.coordinates) {
        if (reportData.coordinates.type === 'Point' && Array.isArray(reportData.coordinates.coordinates)) {
          // GeoJSON Point format: {type: 'Point', coordinates: [longitude, latitude]}
          [longitude, latitude] = reportData.coordinates.coordinates;
          console.log('[DumpingService] Found GeoJSON Point coordinates:', { longitude, latitude });
        } else if (typeof reportData.coordinates.latitude === 'number' && typeof reportData.coordinates.longitude === 'number') {
          // Direct lat/lng object: {latitude: number, longitude: number}
          latitude = reportData.coordinates.latitude;
          longitude = reportData.coordinates.longitude;
          console.log('[DumpingService] Found direct lat/lng coordinates:', { latitude, longitude });
        }
      }

      if (typeof latitude !== 'number' || typeof longitude !== 'number') {
        console.error('[DumpingService] Missing or invalid coordinates:', reportData.coordinates);
        throw new Error('Coordinates (latitude and longitude) are required');
      }
      
      // Log the coordinates for debugging
      console.log('[DumpingService] Using coordinates:', { latitude, longitude });

      // Validate severity
      if (reportData.severity && !validateEnumValue(reportData.severity, ['low', 'medium', 'high'])) {
        throw new Error('Invalid severity value. Must be one of: low, medium, high');
      }

      // Validate size
      if (reportData.size && !validateEnumValue(reportData.size, ['small', 'medium', 'large'])) {
        throw new Error('Invalid size value. Must be one of: small, medium, large');
      }

      // Validate photos if provided (blob:/data: camera photos are uploaded below)
      if (reportData.photos) {
        const hasInvalidPhotos = reportData.photos.some(url => {
          if (!url || typeof url !== 'string') return true;
          return !isLocalPhotoUrl(url) && !validatePhotoUrls([url]);
        });
        if (hasInvalidPhotos) {
          throw new Error('Invalid photo URL format');
        }
      }

      // Convert coordinates to PostGIS/GeoJSON Point format
      // This is the format required by the database schema
      const geoJsonPoint = {
        type: 'Point',
        coordinates: [longitude, latitude]
      };

      console.log('[DumpingService] Formatted GeoJSON Point:', geoJsonPoint);
      
      // One reverse-geocode lookup gives the area name for the public map and,
      // if the form didn't send one, the address
      const geocoded = await reverseGeocode(latitude, longitude);
      let location = reportData.location;
      if (!location || location === 'Unknown location' || location.trim() === '') {
        console.log('[DumpingService] No location provided, using reverse geocoding');
        location = geocoded?.formattedAddress || 'Unknown location';
      }
      console.log('[DumpingService] Using location:', location);
      
      // A sign-in that has ended makes every photo upload fail as signed out;
      // say so instead of blaming the connection (TD44)
      if (await sessionEnded()) throw sessionExpiredError();

      // Upload every camera photo to Supabase Storage. Device-only blob:/data:
      // URLs are never saved: they can't be opened from any other device.
      const { urls: photoUrls, failed: failedPhotos } = await prepareReportPhotos(reportData.photos, userId);
      if (failedPhotos > 0) {
        // The sign-in can also end while the photos upload
        if (await sessionEnded()) throw sessionExpiredError();
        const err = new Error(`${failedPhotos} photo${failedPhotos > 1 ? 's' : ''} could not be uploaded. Check your connection and try again.`);
        err.code = 'PHOTO_UPLOAD_FAILED';
        throw err;
      }

      // Include all required fields for illegal_dumping_mobile table based on confirmed schema
      const report = {
        reported_by: userId,
        location: location,
        coordinates: geoJsonPoint, // PostGIS column expects GeoJSON format
        latitude: latitude, // Separate latitude field
        longitude: longitude, // Separate longitude field
        waste_type: reportData.waste_type || 'mixed',
        severity: reportData.severity || 'medium',
        size: mapEstimatedVolumeToSize(reportData.estimated_volume),
        photos: photoUrls,
        status: 'pending'
        // Note: created_at and updated_at are auto-generated by DB
      };
      // Left empty when geocoding fails; the admin portal's hourly backfill fills it later
      if (geocoded?.area) report.area_name = geocoded.area;
      
      console.log('[DumpingService] Mapped size value:', report.size);

      // Removed localStorage activity caching - using direct database operations only

      let report_data, reportError;
      try {
        [report_data, reportError] = await retrySupabaseOperation(
          async () => {
            let { data, error } = await supabase
              .from('illegal_dumping_mobile')
              .insert([report])
              .select('*');
            // If the area_name column doesn't exist yet (migration not applied), submit without it
            if (error && report.area_name && /area_name/.test(`${error.message} ${error.details || ''}`)) {
              console.warn('[DumpingService] area_name column missing; submitting report without it');
              delete report.area_name;
              ({ data, error } = await supabase
                .from('illegal_dumping_mobile')
                .insert([report])
                .select('*'));
            }
            return [data, error];
          },
          {
            operationName: 'Create dumping report',
            maxAttempts: 3,
            onRetry: (attempt, error, delay) => {
              console.log(`[DumpingService] Retry attempt ${attempt} for report creation in ${delay}ms`);
            }
          }
        );
      } catch (retryError) {
        // Convert retry operation error to reportError for local fallback handling
        reportError = retryError;
        report_data = null;
      }

      if (reportError) {
        console.error('[DumpingService] Error creating dumping report:', reportError);
        console.error('[DumpingService] Report data being inserted:', report);
        console.error('[DumpingService] Error details:', {
          message: reportError.message,
          code: reportError.code,
          details: reportError.details,
          hint: reportError.hint
        });

        // Detect FK violation or RLS policy violation and fall back to local-first storage
        const msg = `${reportError.message || ''} ${reportError.details || ''}`;
        const isFKViolation = msg.includes('23503') || msg.includes('reported_by_fkey') || msg.includes('not present in table "users"');
        const isRLSViolation = reportError.code === '42501' || msg.includes('row-level security policy') || msg.includes('42501') || 
                              (reportError.message && reportError.message.includes('42501')) ||
                              (reportError.status === 401 && msg.includes('row-level security'));
        
        if (isFKViolation || isRLSViolation) {
          const violationType = isRLSViolation ? 'RLS policy violation' : 'Foreign key violation';
          console.error(`[DumpingService] ${violationType} on reported_by. Cannot submit report.`);
          throw new Error('Failed to submit report due to user validation issues. Please try logging out and back in.');
        }

        // Provide more specific error messages for other issues
        if (reportError.message && reportError.message.includes('column')) {
          throw new Error(`Database schema error: ${reportError.message}`);
        }
        throw new Error(reportError.message || 'Failed to create report in database');
      }

      // Try to create the additional report details in the dumping_reports_mobile table with retry
      try {
        const reportDetails = {
          dumping_id: report_data[0].id,
          estimated_volume: reportData.estimated_volume || 'unknown',
          hazardous_materials: reportData.hazardous_materials || false,
          accessibility_notes: reportData.description || reportData.accessibility_notes || 'No additional details provided'
          // Note: created_at is auto-generated by DB
        };

        console.log('[DumpingService] Creating dumping report details:', reportDetails);

        await retrySupabaseOperation(
          async () => {
            const result = await supabase
              .from('dumping_reports_mobile')
              .insert(reportDetails);
            
            if (result.error) {
              throw result.error;
            }
            
            return result;
          },
          {
            operationName: 'Create report details',
            maxAttempts: 2, // Fewer attempts for secondary operation
            onRetry: (attempt, error, delay) => {
              console.log(`[DumpingService] Retry attempt ${attempt} for report details in ${delay}ms`);
            }
          }
        );

        console.log('[DumpingService] Successfully created report details');
      } catch (detailsErr) {
        console.warn('[DumpingService] Report details creation failed, continuing without it:', detailsErr);
      }

      console.log('[DumpingService] Successfully created dumping report:', report_data[0].id);
      
      // Activity will be shown directly from illegal_dumping_mobile table
      return { data: report_data[0], error: null };

    } catch (error) {
      console.error('[DumpingService] Error in createReport:', error);
      return {
        data: null,
        error: {
          message: error.message || 'Failed to create dumping report',
          code: error.code || 'CREATE_REPORT_ERROR'
        }
      };
    }
  },

};

export default dumpingService;
