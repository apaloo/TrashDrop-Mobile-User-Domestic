/**
 * Service for managing illegal dumping reports and history
 */

import supabase from '../utils/supabaseClient.js';

export const dumpingService = {
  /**
   * Create a new illegal dumping report
   * @param {string} userId - User ID reporting the dumping
   * @param {Object} reportData - Report details
   * @returns {Object} Created report
   */
  async createReport(userId, reportData) {
    try {
      if (!userId || !reportData.location) {
        throw new Error('User ID and location are required');
      }

      console.log('[DumpingService] Creating dumping report for user:', userId);

      const report = {
        reported_by: userId,
        location: reportData.location,
        coordinates: reportData.coordinates,
        description: reportData.description,
        waste_type: reportData.waste_type || 'mixed',
        severity: reportData.severity || 'medium',
        status: 'pending',
        photos: reportData.photos || [],
        created_at: new Date().toISOString()
      };

      // First create the main report
      const { data: dumpingReport, error: reportError } = await supabase
        .from('illegal_dumping')
        .insert(report)
        .select()
        .single();

      if (reportError) {
        console.error('[DumpingService] Error creating dumping report:', reportError);
        throw reportError;
      }

      // Then create the initial history record
      const historyEntry = {
        dumping_id: dumpingReport.id,
        status: 'reported',
        notes: 'Initial report created',
        updated_by: userId,
        created_at: new Date().toISOString()
      };

      const { error: historyError } = await supabase
        .from('illegal_dumping_history')
        .insert(historyEntry);

      if (historyError) {
        console.error('[DumpingService] Error creating history entry:', historyError);
        throw historyError;
      }

      // Create a detailed report entry
      const reportDetails = {
        dumping_id: dumpingReport.id,
        estimated_volume: reportData.estimated_volume,
        hazardous_materials: reportData.hazardous_materials || false,
        accessibility_notes: reportData.accessibility_notes,
        cleanup_priority: reportData.cleanup_priority || 'normal',
        created_at: new Date().toISOString()
      };

      const { error: detailsError } = await supabase
        .from('dumping_reports')
        .insert(reportDetails);

      if (detailsError) {
        console.error('[DumpingService] Error creating report details:', detailsError);
        throw detailsError;
      }

      console.log('[DumpingService] Successfully created dumping report:', dumpingReport.id);
      return { data: dumpingReport, error: null };

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

  /**
   * Get report details including history
   * @param {string} reportId - Report ID
   * @returns {Object} Report details with history
   */
  async getReportDetails(reportId) {
    try {
      if (!reportId) {
        throw new Error('Report ID is required');
      }

      console.log('[DumpingService] Fetching report details:', reportId);

      const { data: report, error: reportError } = await supabase
        .from('illegal_dumping')
        .select(`
          *,
          dumping_reports (*),
          illegal_dumping_history (*)
        `)
        .eq('id', reportId)
        .single();

      if (reportError) {
        console.error('[DumpingService] Error fetching report details:', reportError);
        throw reportError;
      }

      return { data: report, error: null };

    } catch (error) {
      console.error('[DumpingService] Error in getReportDetails:', error);
      return {
        data: null,
        error: {
          message: error.message || 'Failed to fetch report details',
          code: error.code || 'GET_REPORT_ERROR'
        }
      };
    }
  },

  /**
   * Update report status
   * @param {string} reportId - Report ID
   * @param {string} status - New status
   * @param {string} userId - User ID making the update
   * @param {string} notes - Optional notes about the update
   * @returns {Object} Updated report
   */
  async updateReportStatus(reportId, status, userId, notes = '') {
    try {
      if (!reportId || !status || !userId) {
        throw new Error('Report ID, status, and user ID are required');
      }

      console.log('[DumpingService] Updating report status:', reportId, status);

      // Update the main report
      const { data: report, error: reportError } = await supabase
        .from('illegal_dumping')
        .update({
          status,
          updated_at: new Date().toISOString()
        })
        .eq('id', reportId)
        .select()
        .single();

      if (reportError) {
        console.error('[DumpingService] Error updating report status:', reportError);
        throw reportError;
      }

      // Add history entry
      const historyEntry = {
        dumping_id: reportId,
        status,
        notes: notes || `Status updated to ${status}`,
        updated_by: userId,
        created_at: new Date().toISOString()
      };

      const { error: historyError } = await supabase
        .from('illegal_dumping_history')
        .insert(historyEntry);

      if (historyError) {
        console.error('[DumpingService] Error creating history entry:', historyError);
        throw historyError;
      }

      console.log('[DumpingService] Successfully updated report status');
      return { data: report, error: null };

    } catch (error) {
      console.error('[DumpingService] Error in updateReportStatus:', error);
      return {
        data: null,
        error: {
          message: error.message || 'Failed to update report status',
          code: error.code || 'UPDATE_STATUS_ERROR'
        }
      };
    }
  },

  /**
   * Get nearby dumping reports
   * @param {Object} location - Location to search around {latitude, longitude}
   * @param {number} radiusKm - Search radius in kilometers
   * @returns {Array} Array of nearby reports
   */
  async getNearbyReports(location, radiusKm = 5) {
    try {
      if (!location?.latitude || !location?.longitude) {
        throw new Error('Valid location is required');
      }

      console.log('[DumpingService] Finding reports near:', location);

      // Use PostGIS to find nearby reports
      const { data, error } = await supabase.rpc('find_nearby_dumping', {
        p_latitude: location.latitude,
        p_longitude: location.longitude,
        p_radius_km: radiusKm
      });

      if (error) {
        console.error('[DumpingService] Error finding nearby reports:', error);
        throw error;
      }

      return { data: data || [], error: null };

    } catch (error) {
      console.error('[DumpingService] Error in getNearbyReports:', error);
      return {
        data: [],
        error: {
          message: error.message || 'Failed to find nearby reports',
          code: error.code || 'NEARBY_REPORTS_ERROR'
        }
      };
    }
  },

  /**
   * Add photos to an existing report
   * @param {string} reportId - Report ID
   * @param {string[]} photoUrls - Array of photo URLs
   * @param {string} userId - User ID adding the photos
   * @returns {Object} Updated report
   */
  async addPhotosToReport(reportId, photoUrls, userId) {
    try {
      if (!reportId || !photoUrls?.length || !userId) {
        throw new Error('Report ID, photos, and user ID are required');
      }

      console.log('[DumpingService] Adding photos to report:', reportId);

      // Get current photos
      const { data: currentReport } = await supabase
        .from('illegal_dumping')
        .select('photos')
        .eq('id', reportId)
        .single();

      const updatedPhotos = [...(currentReport?.photos || []), ...photoUrls];

      // Update the report with new photos
      const { data: report, error: reportError } = await supabase
        .from('illegal_dumping')
        .update({
          photos: updatedPhotos,
          updated_at: new Date().toISOString()
        })
        .eq('id', reportId)
        .select()
        .single();

      if (reportError) {
        console.error('[DumpingService] Error updating report photos:', reportError);
        throw reportError;
      }

      // Add history entry
      const historyEntry = {
        dumping_id: reportId,
        status: report.status,
        notes: `Added ${photoUrls.length} new photos`,
        updated_by: userId,
        created_at: new Date().toISOString()
      };

      await supabase
        .from('illegal_dumping_history')
        .insert(historyEntry);

      console.log('[DumpingService] Successfully added photos to report');
      return { data: report, error: null };

    } catch (error) {
      console.error('[DumpingService] Error in addPhotosToReport:', error);
      return {
        data: null,
        error: {
          message: error.message || 'Failed to add photos to report',
          code: error.code || 'ADD_PHOTOS_ERROR'
        }
      };
    }
  }
};

export default dumpingService;
