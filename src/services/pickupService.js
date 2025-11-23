/**
 * Pickup service for handling pickup request database operations
 * Supports both one-time and scheduled pickups with payment integration
 */

import supabase from '../utils/supabaseClient.js';

export const pickupService = {
  /**
   * Get active pickup request for a user
   * @param {string} userId - User ID
   * @returns {Object} Active pickup request or null
   */
  async getActivePickup(userId) {
    try {
      if (!userId) {
        throw new Error('User ID is required');
      }

      console.log('[PickupService] Fetching active pickup for user:', userId);

      // Check both one-time and scheduled pickups
      const activeStatuses = ['accepted', 'in_transit', 'available'];
      
      // Check one-time pickups (fetch collector separately since no FK constraint)
      const { data: oneTimeData, error: oneTimeError } = await supabase
        .from('pickup_requests')
        .select(`
          id, location, coordinates, fee, status, collector_id,
          accepted_at, picked_up_at, disposed_at, created_at, updated_at,
          waste_type, bag_count, special_instructions, scheduled_date,
          preferred_time, points_earned
        `)
        .eq('user_id', userId)
        .in('status', activeStatuses)
        .order('created_at', { ascending: false })
        .limit(1);

      if (oneTimeError) {
        console.error('[PickupService] Error fetching active one-time pickup:', oneTimeError);
        throw oneTimeError;
      }
      
      // Fetch collector details separately if collector_id exists
      if (oneTimeData?.[0]?.collector_id) {
        try {
          const { data: collectorData } = await supabase
            .from('collector_profiles')
            .select('user_id, first_name, last_name, email, phone, rating, vehicle_type, vehicle_plate, vehicle_color, profile_image_url, status, region')
            .eq('user_id', oneTimeData[0].collector_id)
            .single();
          
          if (collectorData) {
            oneTimeData[0].collector = {
              id: collectorData.user_id,
              ...collectorData
            };
          }
        } catch (collectorError) {
          console.warn('[PickupService] Could not fetch collector details:', collectorError);
          // Non-fatal, continue without collector data
        }
      }

      // Check scheduled pickups
      const { data: scheduledData, error: scheduledError } = await supabase
        .from('scheduled_pickups')
        .select(`
          id, user_id, location_id, waste_type, bag_count, pickup_date,
          preferred_time, special_instructions, status, created_at, updated_at
        `)
        .eq('user_id', userId)
        .in('status', activeStatuses)
        .order('pickup_date', { ascending: true })
        .limit(1);

      if (scheduledError) {
        console.error('[PickupService] Error fetching active scheduled pickup:', scheduledError);
        throw scheduledError;
      }

      // Prioritize one-time pickup if both exist
      const activePickup = oneTimeData?.[0] || scheduledData?.[0];

      if (activePickup) {
        // Get payment method details if available
        let paymentMethod = null;
        if (activePickup.payment_method_id) {
          const { data: paymentData } = await supabase
            .from('payment_methods')
            .select('type, provider, is_default')
            .eq('id', activePickup.payment_method_id)
            .single();
          paymentMethod = paymentData;
        }

        // Get location details if available
        let location = null;
        if (activePickup.location_id) {
          const { data: locationData } = await supabase
            .from('locations')
            .select('location_name, address, latitude, longitude, location_type')
            .eq('id', activePickup.location_id)
            .single();
          location = locationData;
        }

        // Format the pickup data to match expected structure
        const formattedPickup = {
          id: activePickup.id,
          user_id: userId,
          collector_id: activePickup.collector_id,
          collector: activePickup.collector || null, // Include collector profile data
          status: activePickup.status,
          location: location || activePickup.location,
          coordinates: activePickup.coordinates,
          fee: activePickup.fee || 0,
          bags: activePickup.bag_count || 0,
          bag_count: activePickup.bag_count || 0,
          notes: activePickup.special_instructions || '',
          special_instructions: activePickup.special_instructions || '',
          waste_type: activePickup.waste_type || 'general',
          scheduled_date: activePickup.pickup_date || activePickup.scheduled_date,
          preferred_time: activePickup.preferred_time,
          points_earned: activePickup.points_earned || 0,
          payment_method: paymentMethod,
          payment_type: activePickup.payment_type,
          batch_id: activePickup.batch_id,
          is_scheduled: !!scheduledData?.[0],
          schedule_type: activePickup.schedule_type,
          frequency: activePickup.frequency,
          created_at: activePickup.created_at,
          updated_at: activePickup.updated_at,
          accepted_at: activePickup.accepted_at,
          picked_up_at: activePickup.picked_up_at,
          disposed_at: activePickup.disposed_at
        };

        console.log('[PickupService] Found active pickup:', formattedPickup.id);
        return { data: formattedPickup, error: null };
      }

      console.log('[PickupService] No active pickup found');
      return { data: null, error: null };

    } catch (error) {
      console.error('[PickupService] Error in getActivePickup:', error);
      return { 
        data: null, 
        error: {
          message: error.message || 'Failed to fetch active pickup',
          code: error.code || 'ACTIVE_PICKUP_ERROR'
        }
      };
    }
  },

  /**
   * Get specific pickup request by ID
   * @param {string} pickupId - Pickup request ID
   * @returns {Object} Pickup request details or null
   */
  async getPickupDetails(pickupId) {
    try {
      if (!pickupId) {
        throw new Error('Pickup ID is required');
      }

      console.log('[PickupService] Fetching pickup details for ID:', pickupId);

      // Note: coordinates field contains PostGIS POINT data which needs special handling
      // For now, we skip it and rely on location text or user geolocation
      const { data, error } = await supabase
        .from('pickup_requests')
        .select(`
          id, location, fee, status, collector_id, user_id,
          accepted_at, picked_up_at, disposed_at, created_at, updated_at,
          waste_type, bag_count, special_instructions, scheduled_date,
          preferred_time, points_earned
        `)
        .eq('id', pickupId)
        .single();

      if (error) {
        console.error('[PickupService] Error fetching pickup details:', error);
        throw error;
      }

      if (data) {
        // Fetch collector details separately if collector_id exists
        if (data.collector_id) {
          try {
            const { data: collectorData } = await supabase
              .from('collector_profiles')
              .select('user_id, first_name, last_name, email, phone, rating, vehicle_type, vehicle_plate, vehicle_color, profile_image_url, status, region')
              .eq('user_id', data.collector_id)
              .single();
            
            if (collectorData) {
              data.collector = {
                id: collectorData.user_id,
                ...collectorData
              };
            }
          } catch (collectorError) {
            console.warn('[PickupService] Could not fetch collector details:', collectorError);
            // Non-fatal, continue without collector data
          }
        }
        
        console.log('[PickupService] Found pickup:', data.id);
        return { data, error: null };
      }

      console.log('[PickupService] Pickup not found');
      return { data: null, error: null };

    } catch (error) {
      console.error('[PickupService] Error in getPickupDetails:', error);
      return {
        data: null,
        error: {
          message: error.message || 'Failed to fetch pickup details',
          code: error.code || 'GET_PICKUP_DETAILS_ERROR'
        }
      };
    }
  },

  /**
   * Get pickup history for a user
   * @param {string} userId - User ID
   * @param {number} limit - Number of records to fetch
   * @returns {Array} Array of completed pickup requests
   */
  async getPickupHistory(userId, limit = 5) {
    try {
      if (!userId) {
        throw new Error('User ID is required');
      }

      console.log('[PickupService] Fetching pickup history for user:', userId);

      const { data, error } = await supabase
        .from('pickup_requests')
        .select(`
          id, location, coordinates, fee, status, collector_id,
          accepted_at, picked_up_at, disposed_at, created_at, updated_at,
          waste_type, bag_count, special_instructions, scheduled_date,
          preferred_time, points_earned
        `)
        .eq('user_id', userId)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('[PickupService] Error fetching pickup history:', error);
        throw error;
      }

      const formattedHistory = data?.map(pickup => ({
        id: pickup.id,
        user_id: pickup.user_id,
        status: pickup.status,
        location: {
          latitude: pickup.locations?.latitude || pickup.latitude,
          longitude: pickup.locations?.longitude || pickup.longitude,
          address: pickup.locations?.address || pickup.address
        },
        bags: pickup.bag_count || 0,
        notes: pickup.special_instructions || '',
        waste_type: pickup.waste_type || 'general',
        collector_id: pickup.collector_id,
        collector_name: pickup.profiles ? 
          `${pickup.profiles.first_name || ''} ${pickup.profiles.last_name || ''}`.trim() : 
          'Unknown Collector',
        points_earned: pickup.points_earned || 0,
        completed_at: pickup.completed_at,
        created_at: pickup.created_at,
        updated_at: pickup.updated_at
      })) || [];

      console.log(`[PickupService] Found ${formattedHistory.length} completed pickups`);
      return { data: formattedHistory, error: null };

    } catch (error) {
      console.error('[PickupService] Error in getPickupHistory:', error);
      return { 
        data: [], 
        error: {
          message: error.message || 'Failed to fetch pickup history',
          code: error.code || 'PICKUP_HISTORY_ERROR'
        }
      };
    }
  },

  /**
   * Create a new pickup request
   * @param {string} userId - User ID
   * @param {Object} pickupData - Pickup request data
   * @returns {Object} Created pickup request
   */
  async createPickupRequest(userId, pickupData) {
    try {
      if (!userId || !pickupData.payment_method_id) {
        throw new Error('User ID and payment method are required');
      }

      console.log('[PickupService] Creating pickup request for user:', userId);

      // Determine if this is a scheduled pickup
      const isScheduled = pickupData.frequency || (pickupData.scheduled_date && !pickupData.immediate);
      const table = isScheduled ? 'scheduled_pickups' : 'pickup_requests';

      const requestData = {
        user_id: userId,
        location_id: pickupData.location_id,
        location: pickupData.location || null,
        coordinates: pickupData.coordinates || null,
        fee: pickupData.fee || 0,
        bag_count: pickupData.bags || 1,
        waste_type: pickupData.waste_type || 'general',
        special_instructions: pickupData.notes || '',
        payment_method_id: pickupData.payment_method_id,
        payment_type: pickupData.payment_type || 'postpaid',
        points_earned: 0, // Will be updated when pickup is completed
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      // Add scheduled pickup specific fields
      if (isScheduled) {
        requestData.schedule_type = pickupData.schedule_type || 'one_time';
        requestData.frequency = pickupData.frequency || null;
        requestData.pickup_date = pickupData.scheduled_date;
        requestData.preferred_time = pickupData.preferred_time;
      } else {
        requestData.scheduled_date = pickupData.immediate ? new Date().toISOString() : pickupData.scheduled_date;
        requestData.preferred_time = pickupData.preferred_time;
      }

      // Add location details if location_id is not provided
      if (!pickupData.location_id && pickupData.location) {
        requestData.latitude = pickupData.location.latitude;
        requestData.longitude = pickupData.location.longitude;
        requestData.address = pickupData.location.address;
      }

      // For prepaid pickups, verify batch/bags
      if (pickupData.payment_type === 'prepaid' && pickupData.batch_id) {
        const { data: batchData, error: batchError } = await supabase
          .from('bag_inventory')
          .select('id')
          .eq('batch_id', pickupData.batch_id)
          .eq('status', 'available')
          .limit(pickupData.bags);

        if (batchError || !batchData || batchData.length < pickupData.bags) {
          throw new Error('Insufficient available bags in batch');
        }

        requestData.batch_id = pickupData.batch_id;
      }

      const { data, error } = await supabase
        .from(table)
        .insert(requestData)
        .select()
        .single();

      if (error) {
        console.error(`[PickupService] Error creating ${isScheduled ? 'scheduled' : ''} pickup request:`, error);
        throw error;
      }

      // If prepaid, update bag statuses
      if (data && pickupData.payment_type === 'prepaid' && pickupData.batch_id) {
        await supabase
          .from('bag_inventory')
          .update({ status: 'assigned' })
          .eq('batch_id', pickupData.batch_id)
          .eq('status', 'available')
          .limit(pickupData.bags);
      }

      console.log('[PickupService] Successfully created pickup request:', data.id);
      return { data, error: null };

    } catch (error) {
      console.error('[PickupService] Error in createPickupRequest:', error);
      return { 
        data: null, 
        error: {
          message: error.message || 'Failed to create pickup request',
          code: error.code || 'CREATE_PICKUP_ERROR'
        }
      };
    }
  },

  /**
   * Update pickup request status
   * @param {string} pickupId - Pickup request ID
   * @param {string} status - New status
   * @param {Object} additionalData - Additional data to update
   * @returns {Object} Updated pickup request
   */
  async updatePickupStatus(pickupId, status, additionalData = {}) {
    try {
      if (!pickupId || !status) {
        throw new Error('Pickup ID and status are required');
      }

      console.log('[PickupService] Updating pickup status:', pickupId, status);

      const updateData = {
        status,
        updated_at: new Date().toISOString(),
        ...additionalData
      };

      // Add status-specific timestamps
      if (status === 'accepted' && !updateData.accepted_at) {
        updateData.accepted_at = new Date().toISOString();
      } else if (status === 'completed' && !updateData.completed_at) {
        updateData.completed_at = new Date().toISOString();
      } else if (status === 'in_transit' && !updateData.picked_up_at) {
        updateData.picked_up_at = new Date().toISOString();
      }

      const { data, error } = await supabase
        .from('pickup_requests')
        .update(updateData)
        .eq('id', pickupId)
        .select()
        .single();

      if (error) {
        console.error('[PickupService] Error updating pickup status:', error);
        throw error;
      }

      console.log('[PickupService] Successfully updated pickup status');
      return { data, error: null };

    } catch (error) {
      console.error('[PickupService] Error in updatePickupStatus:', error);
      return { 
        data: null, 
        error: {
          message: error.message || 'Failed to update pickup status',
          code: error.code || 'UPDATE_PICKUP_ERROR'
        }
      };
    }
  },

  /**
   * Cancel a pickup request
   * @param {string} pickupId - Pickup request ID
   * @param {string} reason - Cancellation reason
   * @returns {Object} Updated pickup request
   */
  async cancelPickupRequest(pickupId, reason = '') {
    try {
      return await this.updatePickupStatus(pickupId, 'cancelled', {
        cancellation_reason: reason
      });
    } catch (error) {
      console.error('[PickupService] Error in cancelPickupRequest:', error);
      return { 
        data: null, 
        error: {
          message: error.message || 'Failed to cancel pickup request',
          code: error.code || 'CANCEL_PICKUP_ERROR'
        }
      };
    }
  }
};

export default pickupService;
