/**
 * Enhanced Dumping Service with Duplicate Prevention and Idempotency
 * Comprehensive service for managing illegal dumping reports with duplicate detection
 */

import supabase from '../utils/supabaseClient.js';
import { toastService } from '../services/toastService.js';
import { retrySupabaseOperation } from '../utils/retryUtils.js';
import syncService from './syncService.js';
import { uploadPhotos } from './photoUploadService.js';

/**
 * Generate a unique fingerprint for report submission (client-side duplicate detection)
 * @param {string} userId - User ID
 * @param {Object} reportData - Report data
 * @returns {string} Unique fingerprint
 */
const generateReportFingerprint = (userId, reportData) => {
  const coords = reportData.coordinates;
  const keyData = {
    userId,
    lat: Math.round((coords.latitude || coords.lat) * 1000), // Round to 3 decimal places
    lng: Math.round((coords.longitude || coords.lng) * 1000),
    wasteType: reportData.waste_type,
    size: reportData.estimated_volume,
    hour: new Date().getHours(), // Time-based component
    date: new Date().toDateString() // Date component
  };
  
  // Create base64 encoded fingerprint
  const fingerprint = btoa(JSON.stringify(keyData))
    .replace(/[^a-zA-Z0-9]/g, '')
    .substring(0, 16);
  
  return `dumping_${fingerprint}`;
};

/**
 * Generate idempotency token for retry-safe operations
 * @param {string} userId - User ID
 * @param {Object} reportData - Report data
 * @returns {string} Idempotency token
 */
const generateIdempotencyToken = (userId, reportData) => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const tokenData = {
    userId,
    timestamp,
    random,
    coords: {
      lat: Math.round((reportData.coordinates.latitude || reportData.coordinates.lat) * 1000),
      lng: Math.round((reportData.coordinates.longitude || reportData.coordinates.lng) * 1000)
    }
  };
  
  return btoa(JSON.stringify(tokenData))
    .replace(/[^a-zA-Z0-9]/g, '')
    .substring(0, 32);
};

/**
 * Store submission fingerprint in localStorage for duplicate prevention
 * @param {string} userId - User ID
 * @param {Object} reportData - Report data
 * @param {string} fingerprint - Generated fingerprint
 */
const storeSubmissionFingerprint = (userId, reportData, fingerprint) => {
  try {
    const storageKey = `dumping_submissions_${userId}`;
    const existingSubmissions = JSON.parse(localStorage.getItem(storageKey) || '[]');
    
    // Add new submission
    existingSubmissions.push({
      fingerprint,
      timestamp: Date.now(),
      coords: reportData.coordinates
    });
    
    // Keep only last 50 submissions and clean up old ones (older than 30 minutes)
    const filteredSubmissions = existingSubmissions
      .filter(sub => (Date.now() - sub.timestamp) < 30 * 60 * 1000) // 30 minutes
      .slice(-50);
    
    localStorage.setItem(storageKey, JSON.stringify(filteredSubmissions));
  } catch (error) {
    console.warn('[DumpingService] Failed to store submission fingerprint:', error);
  }
};

/**
 * Check for recent submissions with same fingerprint
 * @param {string} userId - User ID
 * @param {Object} reportData - Report data
 * @returns {Object} Duplicate check result
 */
const checkRecentSubmissions = (userId, reportData) => {
  try {
    const storageKey = `dumping_submissions_${userId}`;
    const recentSubmissions = JSON.parse(localStorage.getItem(storageKey) || '[]');
    const currentFingerprint = generateReportFingerprint(userId, reportData);
    
    // Check for exact fingerprint match within 5 minutes
    const exactMatch = recentSubmissions.find(sub => 
      sub.fingerprint === currentFingerprint && 
      (Date.now() - sub.timestamp) < 5 * 60 * 1000 // 5 minutes
    );
    
    if (exactMatch) {
      return {
        isDuplicate: true,
        type: 'EXACT_FINGERPRINT',
        message: 'This appears to be a duplicate of a recent submission.',
        timeAgo: Math.floor((Date.now() - exactMatch.timestamp) / 1000 / 60) // minutes ago
      };
    }
    
    // Check for nearby submissions within 100m and 1 hour
    const nearbySubmission = recentSubmissions.find(sub => {
      const distance = calculateDistance(
        reportData.coordinates.latitude,
        reportData.coordinates.longitude,
        sub.coords.latitude,
        sub.coords.longitude
      );
      return distance < 100 && (Date.now() - sub.timestamp) < 60 * 60 * 1000; // 1 hour
    });
    
    if (nearbySubmission) {
      return {
        isDuplicate: true,
        type: 'NEARBY_RECENT',
        message: 'A similar report was submitted nearby within the last hour.',
        timeAgo: Math.floor((Date.now() - nearbySubmission.timestamp) / 1000 / 60), // minutes ago
        distance: calculateDistance(
          reportData.coordinates.latitude,
          reportData.coordinates.longitude,
          nearbySubmission.coords.latitude,
          nearbySubmission.coords.longitude
        )
      };
    }
    
    return { isDuplicate: false };
  } catch (error) {
    console.warn('[DumpingService] Error checking recent submissions:', error);
    return { isDuplicate: false };
  }
};

/**
 * Calculate distance between two coordinates in meters
 * @param {number} lat1 - Latitude 1
 * @param {number} lon1 - Longitude 1
 * @param {number} lat2 - Latitude 2
 * @param {number} lon2 - Longitude 2
 * @returns {number} Distance in meters
 */
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
          Math.cos(φ1) * Math.cos(φ2) *
          Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c;
};

/**
 * Maps the estimated_volume value from the form to the required size value for the database
 * @param {string} estimatedVolume - Value from the form's estimated_volume field
 * @returns {string} Size value for database (small, medium, or large)
 */
const mapEstimatedVolumeToSize = (estimatedVolume) => {
  if (!estimatedVolume) return 'medium';
  
  const estimatedVolumeLower = estimatedVolume.toLowerCase();
  
  if (estimatedVolumeLower.includes('small') || estimatedVolumeLower.includes('few bags')) {
    return 'small';
  } else if (estimatedVolumeLower.includes('large') || estimatedVolumeLower.includes('truck')) {
    return 'large';
  } else {
    return 'medium';
  }
};

export const dumpingServiceEnhanced = {
  /**
   * Check for nearby existing reports before submission
   * @param {Object} coordinates - Location coordinates {latitude, longitude}
   * @param {Object} options - Search options
   * @returns {Object} Nearby reports check result
   */
  async checkForNearbyReports(coordinates, options = {}) {
    const { radiusKm = 0.1, hoursBack = 24, excludeUserId = null } = options;
    
    try {
      if (!coordinates?.latitude || !coordinates?.longitude) {
        throw new Error('Valid coordinates are required');
      }

      console.log('[DumpingServiceEnhanced] Checking for nearby reports:', coordinates);

      const { data, error } = await retrySupabaseOperation(
        async () => {
          const result = await supabase.rpc('find_nearby_dumping', {
            p_latitude: coordinates.latitude,
            p_longitude: coordinates.longitude,
            p_radius_km: radiusKm,
            p_hours_back: hoursBack,
            p_exclude_user_id: excludeUserId
          });
          
          if (result.error) {
            throw result.error;
          }
          
          return result;
        },
        {
          operationName: 'Find nearby dumping reports',
          maxAttempts: 2
        }
      );

      if (error) {
        console.error('[DumpingServiceEnhanced] Error finding nearby reports:', error);
        throw error;
      }

      const reports = data || [];
      
      // Categorize nearby reports
      const recentReports = reports.filter(r => r.hours_ago < 24);
      const veryRecentReports = reports.filter(r => r.hours_ago < 1);
      const nearbyReports = reports.filter(r => r.distance_meters < 100);
      const veryNearbyReports = reports.filter(r => r.distance_meters < 50);

      return {
        data: reports,
        summary: {
          total: reports.length,
          recent: recentReports.length,
          veryRecent: veryRecentReports.length,
          nearby: nearbyReports.length,
          veryNearby: veryNearbyReports.length
        },
        recommendations: this.generateDuplicateRecommendations(reports, options)
      };

    } catch (error) {
      console.error('[DumpingServiceEnhanced] Error in checkForNearbyReports:', error);
      return {
        data: [],
        error: {
          message: error.message || 'Failed to check for nearby reports',
          code: error.code || 'NEARBY_CHECK_ERROR'
        }
      };
    }
  },

  /**
   * Generate recommendations based on nearby reports
   * @param {Array} reports - Nearby reports
   * @param {Object} options - Check options
   * @returns {Object} Recommendations
   */
  generateDuplicateRecommendations(reports, options) {
    if (!reports || reports.length === 0) {
      return { canSubmit: true, message: 'No similar reports found nearby.' };
    }

    const veryRecentNearby = reports.filter(r => r.hours_ago < 1 && r.distance_meters < 50);
    const recentNearby = reports.filter(r => r.hours_ago < 24 && r.distance_meters < 100);
    const nearby = reports.filter(r => r.distance_meters < 100);

    if (veryRecentNearby.length > 0) {
      return {
        canSubmit: false,
        message: `Found ${veryRecentNearby.length} report(s) within 50m in the last hour. Please wait before submitting another report.`,
        type: 'BLOCK_TEMPORAL_SPATIAL',
        reports: veryRecentNearby
      };
    }

    if (recentNearby.length > 0) {
      return {
        canSubmit: false,
        message: `Found ${recentNearby.length} report(s) within 100m in the last 24 hours. Reports must be at least 100m apart or submitted 24+ hours apart.`,
        type: 'BLOCK_SPATIAL_TEMPORAL',
        reports: recentNearby
      };
    }

    if (nearby.length > 0) {
      return {
        canSubmit: true,
        message: `Found ${nearby.length} report(s) nearby, but they are outside the 24-hour window. You can submit this report.`,
        type: 'WARN_NEARBY',
        reports: nearby
      };
    }

    return { canSubmit: true, message: 'No conflicting reports found nearby.' };
  },

  /**
   * Create a new illegal dumping report with duplicate prevention
   * @param {string} userId - User ID reporting the dumping
   * @param {Object} reportData - Report details
   * @param {Object} options - Submission options
   * @returns {Object} Created report or error
   */
  async createReportWithDuplicatePrevention(userId, reportData, options = {}) {
    const { 
      maxRetries = 3, 
      idempotencyKey = null,
      skipDuplicateCheck = false,
      forceSubmit = false 
    } = options;

    try {
      if (!userId) {
        throw new Error('User ID is required');
      }

      console.log('[DumpingServiceEnhanced] Creating report with duplicate prevention for user:', userId);

      // Step 1: Client-side duplicate check (unless skipped)
      if (!skipDuplicateCheck && !forceSubmit) {
        const clientDuplicateCheck = checkRecentSubmissions(userId, reportData);
        if (clientDuplicateCheck.isDuplicate) {
          return {
            data: null,
            error: {
              message: clientDuplicateCheck.message,
              code: 'CLIENT_DUPLICATE_DETECTED',
              type: clientDuplicateCheck.type,
              timeAgo: clientDuplicateCheck.timeAgo,
              distance: clientDuplicateCheck.distance
            }
          };
        }
      }

      // Step 2: Server-side nearby reports check (unless skipped)
      if (!skipDuplicateCheck && !forceSubmit && reportData.coordinates) {
        const nearbyCheck = await this.checkForNearbyReports(reportData.coordinates, {
          excludeUserId: forceSubmit ? null : userId
        });

        if (!nearbyCheck.error && nearbyCheck.summary.total > 0 && !nearbyCheck.recommendations.canSubmit) {
          return {
            data: null,
            error: {
              message: nearbyCheck.recommendations.message,
              code: 'NEARBY_REPORTS_EXIST',
              type: nearbyCheck.recommendations.type,
              nearbyReports: nearbyCheck.data,
              summary: nearbyCheck.summary
            }
          };
        }
      }

      // Step 3: Generate idempotency token if not provided
      const idempotencyToken = idempotencyKey || generateIdempotencyToken(userId, reportData);
      const submissionFingerprint = generateReportFingerprint(userId, reportData);

      // Step 4: Prepare report data with new fields
      const enhancedReportData = {
        ...reportData,
        idempotency_token: idempotencyToken,
        submission_fingerprint: submissionFingerprint
      };

      // Step 5: Submit report with retry logic
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const result = await this.createReport(userId, enhancedReportData);
          
          if (result.error) {
            // Check if it's a duplicate error
            if (result.error.message?.includes('DUPLICATE_RETRY') || 
                result.error.message?.includes('DUPLICATE_SUBMISSION') ||
                result.error.message?.includes('SPATIAL_DUPLICATE') ||
                result.error.message?.includes('TEMPORAL_DUPLICATE')) {
              // Don't retry on duplicate errors
              throw result.error;
            }
            
            if (attempt === maxRetries) {
              throw result.error;
            }
            
            // Exponential backoff for other errors
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
            continue;
          }
          
          // Success - store fingerprint
          storeSubmissionFingerprint(userId, reportData, submissionFingerprint);
          
          return {
            ...result,
            duplicatePrevention: {
              idempotencyToken,
              submissionFingerprint,
              nearbyReportsChecked: !skipDuplicateCheck
            }
          };
          
        } catch (error) {
          if (attempt === maxRetries) {
            throw error;
          }
        }
      }

    } catch (error) {
      console.error('[DumpingServiceEnhanced] Error in createReportWithDuplicatePrevention:', error);
      return {
        data: null,
        error: {
          message: error.message || 'Failed to create dumping report with duplicate prevention',
          code: error.code || 'CREATE_REPORT_ERROR',
          type: error.type || 'UNKNOWN_ERROR'
        }
      };
    }
  },

  /**
   * Legacy createReport method (maintained for compatibility)
   * @param {string} userId - User ID
   * @param {Object} reportData - Report details
   * @returns {Object} Created report
   */
  async createReport(userId, reportData) {
    // Import the original dumpingService createReport method
    // This is a placeholder - in practice, you would import and use the original method
    // For now, implementing a basic version
    
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
      // Validate coordinates
      let latitude, longitude;
      if (reportData.coordinates) {
        if (typeof reportData.coordinates.latitude === 'number' && typeof reportData.coordinates.longitude === 'number') {
          latitude = reportData.coordinates.latitude;
          longitude = reportData.coordinates.longitude;
        }
      }

      if (typeof latitude !== 'number' || typeof longitude !== 'number') {
        throw new Error('Coordinates (latitude and longitude) are required');
      }

      // Validate severity
      if (reportData.severity && !validateEnumValue(reportData.severity, ['low', 'medium', 'high'])) {
        throw new Error('Invalid severity value. Must be one of: low, medium, high');
      }

      // Validate size
      if (reportData.size && !validateEnumValue(reportData.size, ['small', 'medium', 'large'])) {
        throw new Error('Invalid size value. Must be one of: small, medium, large');
      }

      // Prepare report data
      const report = {
        reported_by: userId,
        location: reportData.location || 'Unknown location',
        coordinates: {
          type: 'Point',
          coordinates: [longitude, latitude]
        },
        latitude: latitude,
        longitude: longitude,
        waste_type: reportData.waste_type || 'mixed',
        severity: reportData.severity || 'medium',
        size: mapEstimatedVolumeToSize(reportData.estimated_volume),
        photos: reportData.photos || [],
        status: 'pending',
        idempotency_token: reportData.idempotency_token,
        submission_fingerprint: reportData.submission_fingerprint
      };

      // Insert report
      const { data: reportDataResult, error: reportError } = await supabase
        .from('illegal_dumping_mobile')
        .insert([report])
        .select('*');

      if (reportError) {
        console.error('[DumpingServiceEnhanced] Error creating dumping report:', reportError);
        throw new Error(reportError.message);
      }

      if (!reportDataResult || reportDataResult.length === 0) {
        throw new Error('No data returned from report creation');
      }

      const createdReport = reportDataResult[0];

      // Create additional report details if provided
      if (reportData.estimated_volume || reportData.hazardous_materials || reportData.description) {
        try {
          const reportDetails = {
            dumping_id: createdReport.id,
            estimated_volume: reportData.estimated_volume || 'unknown',
            hazardous_materials: reportData.hazardous_materials || false,
            accessibility_notes: reportData.description || reportData.accessibility_notes || 'No additional details provided'
          };

          await supabase
            .from('dumping_reports_mobile')
            .insert(reportDetails);

          console.log('[DumpingServiceEnhanced] Successfully created report details');
        } catch (detailsErr) {
          console.warn('[DumpingServiceEnhanced] Report details creation failed, continuing without it:', detailsErr);
        }
      }

      console.log('[DumpingServiceEnhanced] Successfully created dumping report:', createdReport.id);
      
      return { data: createdReport, error: null };

    } catch (error) {
      console.error('[DumpingServiceEnhanced] Error in createReport:', error);
      return {
        data: null,
        error: {
          message: error.message || 'Failed to create dumping report',
          code: error.code || 'CREATE_REPORT_ERROR'
        }
      };
    }
  },

  /**
   * Get duplicate statistics for monitoring
   * @param {number} daysBack - Number of days to look back
   * @returns {Object} Duplicate statistics
   */
  async getDuplicateStatistics(daysBack = 30) {
    try {
      const { data, error } = await supabase.rpc('get_dumping_duplicate_stats', {
        p_days_back: daysBack
      });

      if (error) {
        console.error('[DumpingServiceEnhanced] Error getting duplicate stats:', error);
        throw error;
      }

      return { data: data || [], error: null };

    } catch (error) {
      console.error('[DumpingServiceEnhanced] Error in getDuplicateStatistics:', error);
      return {
        data: [],
        error: {
          message: error.message || 'Failed to get duplicate statistics',
          code: error.code || 'STATS_ERROR'
        }
      };
    }
  },

  /**
   * Merge duplicate reports (admin function)
   * @param {string} primaryReportId - Primary report ID to keep
   * @param {string[]} duplicateReportIds - Array of duplicate report IDs to merge
   * @param {string} mergedBy - User ID performing the merge
   * @returns {Object} Merge result
   */
  async mergeDuplicateReports(primaryReportId, duplicateReportIds, mergedBy) {
    try {
      if (!primaryReportId || !duplicateReportIds?.length || !mergedBy) {
        throw new Error('Primary report ID, duplicate report IDs, and merged by user ID are required');
      }

      const { data, error } = await supabase.rpc('merge_dumping_reports', {
        p_primary_report_id: primaryReportId,
        p_duplicate_report_ids: duplicateReportIds,
        p_merged_by: mergedBy
      });

      if (error) {
        console.error('[DumpingServiceEnhanced] Error merging reports:', error);
        throw error;
      }

      return { data: data[0] || {}, error: null };

    } catch (error) {
      console.error('[DumpingServiceEnhanced] Error in mergeDuplicateReports:', error);
      return {
        data: null,
        error: {
          message: error.message || 'Failed to merge duplicate reports',
          code: error.code || 'MERGE_ERROR'
        }
      };
    }
  }
};

export default dumpingServiceEnhanced;
