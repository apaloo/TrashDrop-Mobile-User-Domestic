/**
 * Collector service for managing collector sessions and real-time tracking
 */

import supabase from '../utils/supabaseClient.js';

export const collectorService = {
  /**
   * Start a new collector session
   * @param {string} collectorId - Collector's user ID
   * @param {Object} location - Initial location {latitude, longitude}
   * @returns {Object} Created session
   */
  async startSession(collectorId, location) {
    try {
      if (!collectorId || !location) {
        throw new Error('Collector ID and location are required');
      }

      console.log('[CollectorService] Starting session for collector:', collectorId);

      // End any existing active sessions first
      await this.endActiveSession(collectorId);

      const session = {
        collector_id: collectorId,
        status: 'active',
        start_location: location,
        current_location: location,
        last_update: new Date().toISOString(),
        started_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('collector_sessions')
        .insert(session)
        .select()
        .single();

      if (error) {
        console.error('[CollectorService] Error starting session:', error);
        throw error;
      }

      console.log('[CollectorService] Successfully started session:', data.id);
      return { data, error: null };

    } catch (error) {
      console.error('[CollectorService] Error in startSession:', error);
      return {
        data: null,
        error: {
          message: error.message || 'Failed to start collector session',
          code: error.code || 'START_SESSION_ERROR'
        }
      };
    }
  },

  /**
   * End the active session for a collector
   * @param {string} collectorId - Collector's user ID
   * @returns {Object} Updated session
   */
  async endActiveSession(collectorId) {
    try {
      if (!collectorId) {
        throw new Error('Collector ID is required');
      }

      console.log('[CollectorService] Ending active session for collector:', collectorId);

      const { data: activeSession } = await supabase
        .from('collector_sessions')
        .select('id')
        .eq('collector_id', collectorId)
        .eq('status', 'active')
        .single();

      if (activeSession) {
        const { data, error } = await supabase
          .from('collector_sessions')
          .update({
            status: 'completed',
            ended_at: new Date().toISOString()
          })
          .eq('id', activeSession.id)
          .select()
          .single();

        if (error) {
          console.error('[CollectorService] Error ending session:', error);
          throw error;
        }

        console.log('[CollectorService] Successfully ended session:', data.id);
        return { data, error: null };
      }

      return { data: null, error: null };

    } catch (error) {
      console.error('[CollectorService] Error in endActiveSession:', error);
      return {
        data: null,
        error: {
          message: error.message || 'Failed to end collector session',
          code: error.code || 'END_SESSION_ERROR'
        }
      };
    }
  },

  /**
   * Update collector's current location
   * @param {string} sessionId - Collector session ID
   * @param {Object} location - New location {latitude, longitude}
   * @returns {Object} Updated session
   */
  async updateLocation(sessionId, location) {
    try {
      if (!sessionId || !location) {
        throw new Error('Session ID and location are required');
      }

      console.log('[CollectorService] Updating location for session:', sessionId);

      const { data, error } = await supabase
        .from('collector_sessions')
        .update({
          current_location: location,
          last_update: new Date().toISOString()
        })
        .eq('id', sessionId)
        .eq('status', 'active')
        .select()
        .single();

      if (error) {
        console.error('[CollectorService] Error updating location:', error);
        throw error;
      }

      // Also update any active pickup requests
      const { data: pickups } = await supabase
        .from('pickup_requests')
        .select('id')
        .eq('collector_id', data.collector_id)
        .in('status', ['accepted', 'in_transit']);

      if (pickups?.length > 0) {
        await supabase
          .from('pickup_requests')
          .update({
            collector_location: location,
            collector_last_update: new Date().toISOString()
          })
          .in('id', pickups.map(p => p.id));
      }

      console.log('[CollectorService] Successfully updated location');
      return { data, error: null };

    } catch (error) {
      console.error('[CollectorService] Error in updateLocation:', error);
      return {
        data: null,
        error: {
          message: error.message || 'Failed to update location',
          code: error.code || 'UPDATE_LOCATION_ERROR'
        }
      };
    }
  },

  /**
   * Get active collector session details
   * @param {string} collectorId - Collector's user ID
   * @returns {Object} Active session or null
   */
  async getActiveSession(collectorId) {
    try {
      if (!collectorId) {
        throw new Error('Collector ID is required');
      }

      console.log('[CollectorService] Fetching active session for collector:', collectorId);

      const { data, error } = await supabase
        .from('collector_sessions')
        .select(`
          id, collector_id, status, start_location, current_location,
          last_update, started_at, ended_at,
          pickup_requests (
            id, status, location, coordinates, scheduled_date,
            preferred_time, special_instructions
          )
        `)
        .eq('collector_id', collectorId)
        .eq('status', 'active')
        .single();

      if (error) {
        console.error('[CollectorService] Error fetching active session:', error);
        throw error;
      }

      return { data, error: null };

    } catch (error) {
      console.error('[CollectorService] Error in getActiveSession:', error);
      return {
        data: null,
        error: {
          message: error.message || 'Failed to fetch active session',
          code: error.code || 'GET_SESSION_ERROR'
        }
      };
    }
  },

  /**
   * Get nearby collectors for a location
   * @param {Object} location - Location to search around {latitude, longitude}
   * @param {number} radiusKm - Search radius in kilometers
   * @returns {Array} Array of nearby collectors with their current locations
   */
  async getNearbyCollectors(location, radiusKm = 5) {
    try {
      if (!location?.latitude || !location?.longitude) {
        throw new Error('Valid location is required');
      }

      console.log('[CollectorService] Finding collectors near:', location);

      // Use PostGIS to find nearby collectors
      const { data, error } = await supabase.rpc('find_nearby_collectors', {
        p_latitude: location.latitude,
        p_longitude: location.longitude,
        p_radius_km: radiusKm
      });

      if (error) {
        console.error('[CollectorService] Error finding nearby collectors:', error);
        throw error;
      }

      return { data: data || [], error: null };

    } catch (error) {
      console.error('[CollectorService] Error in getNearbyCollectors:', error);
      return {
        data: [],
        error: {
          message: error.message || 'Failed to find nearby collectors',
          code: error.code || 'NEARBY_COLLECTORS_ERROR'
        }
      };
    }
  }
};

export default collectorService;
