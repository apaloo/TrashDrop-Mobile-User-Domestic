/**
 * Pickup service for handling pickup request database operations
 * Supports both one-time and scheduled pickups with payment integration
 */

import supabase from '../utils/supabaseClient.js';

/**
 * Parse PostGIS POINT format to {latitude, longitude}
 * @param {string} pointString - PostGIS POINT string like "POINT(lng lat)" or EWKB hex
 * @returns {Object|null} - {latitude, longitude} or null
 */
const parsePostGISPoint = (pointString) => {
  if (!pointString || typeof pointString !== 'string') return null;
  
  // Check if it's EWKB hex format (starts with 0101000020)
  if (pointString.match(/^0101000020/i)) {
    try {
      // EWKB format: 01 (little endian) 01000000 (point) 20 (has SRID) E6100000 (SRID 4326) + coordinates
      // Skip to coordinate data (after SRID): 01 01000000 20 E6100000 = 18 chars
      const coordHex = pointString.substring(18);
      
      // Extract longitude (8 bytes = 16 hex chars)
      const lngHex = coordHex.substring(0, 16);
      // Extract latitude (next 8 bytes = 16 hex chars)
      const latHex = coordHex.substring(16, 32);
      
      // Convert hex to double (little endian)
      const lngBuffer = new ArrayBuffer(8);
      const lngView = new DataView(lngBuffer);
      for (let i = 0; i < 8; i++) {
        lngView.setUint8(i, parseInt(lngHex.substring(i * 2, i * 2 + 2), 16));
      }
      const longitude = lngView.getFloat64(0, true); // true = little endian
      
      const latBuffer = new ArrayBuffer(8);
      const latView = new DataView(latBuffer);
      for (let i = 0; i < 8; i++) {
        latView.setUint8(i, parseInt(latHex.substring(i * 2, i * 2 + 2), 16));
      }
      const latitude = latView.getFloat64(0, true);
      
      console.log('[parsePostGISPoint] Parsed EWKB:', { longitude, latitude });
      
      return { longitude, latitude };
    } catch (err) {
      console.error('[parsePostGISPoint] Error parsing EWKB:', err);
      return null;
    }
  }
  
  // Match WKT POINT(lng lat) format
  const match = pointString.match(/POINT\s*\(\s*([+-]?\d+\.?\d*)\s+([+-]?\d+\.?\d*)\s*\)/i);
  if (match) {
    return {
      longitude: parseFloat(match[1]),
      latitude: parseFloat(match[2])
    };
  }
  
  return null;
};

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
      
      // Check one-time pickups
      const { data: oneTimeData, error: oneTimeError } = await supabase
        .from('pickup_requests')
        .select(`
          id, location, fee, status, collector_id,
          accepted_at, picked_up_at, disposed_at, created_at, updated_at,
          waste_type, bag_count, special_instructions, scheduled_date,
          preferred_time, points_earned
        `)
        .eq('user_id', userId)
        .in('status', activeStatuses)
        .order('created_at', { ascending: false })
        .limit(1);
      
      // Fetch coordinates for active pickup - try RPC first, fallback to ::text
      if (oneTimeData && oneTimeData.length > 0) {
        try {
          const { data: coordResult } = await supabase
            .rpc('get_request_coordinates_wkt', { request_id: oneTimeData[0].id });
          
          if (coordResult) {
            oneTimeData[0].coordinates = coordResult;
            console.log('[PickupService] Fetched active pickup coordinates via RPC (WKT):', coordResult);
          }
        } catch (coordError) {
          console.warn('[PickupService] RPC not available, using ::text fallback');
          // Fallback: fetch as text (returns EWKB hex)
          try {
            const { data: textResult } = await supabase
              .from('pickup_requests')
              .select('coordinates::text')
              .eq('id', oneTimeData[0].id)
              .single();
            
            if (textResult?.coordinates) {
              oneTimeData[0].coordinates = textResult.coordinates;
              console.log('[PickupService] Fetched active pickup coordinates as EWKB:', textResult.coordinates);
            }
          } catch (textError) {
            console.warn('[PickupService] Could not fetch coordinates:', textError);
          }
        }
      }

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

      // Check digital bins (active bins)
      const { data: digitalBinData, error: digitalBinError } = await supabase
        .from('digital_bins')
        .select(`
          id, user_id, location_id, qr_code_url, frequency, waste_type, bag_count,
          bin_size_liters, is_urgent, is_active, status, expires_at, collected_at,
          collector_id, created_at, updated_at
        `)
        .eq('user_id', userId)
        .eq('is_active', true)
        .in('status', ['available', 'in_service', 'accepted'])
        .order('created_at', { ascending: false })
        .limit(1);

      if (digitalBinError) {
        console.error('[PickupService] Error fetching active digital bin:', digitalBinError);
        // Non-fatal, continue without digital bin data
      }

      // Fetch location details for digital bin if exists
      if (digitalBinData?.[0]?.location_id) {
        try {
          const { data: binLocationData } = await supabase
            .from('bin_locations')
            .select('location_name, address')
            .eq('id', digitalBinData[0].location_id)
            .single();
          
          if (binLocationData) {
            // Fetch coordinates - try RPC first, fallback to ::text
            try {
              const { data: coordResult } = await supabase
                .rpc('get_bin_coordinates_wkt', { bin_location_id: digitalBinData[0].location_id });
              
              if (coordResult) {
                binLocationData.coordinates = coordResult;
                const coords = parsePostGISPoint(coordResult);
                binLocationData.latitude = coords?.latitude;
                binLocationData.longitude = coords?.longitude;
                console.log('[PickupService] Fetched bin location via RPC (WKT):', binLocationData);
              }
            } catch (coordError) {
              console.warn('[PickupService] RPC not available, using ::text fallback');
              // Fallback: fetch as text (returns EWKB hex)
              try {
                const { data: textResult } = await supabase
                  .from('bin_locations')
                  .select('coordinates::text')
                  .eq('id', digitalBinData[0].location_id)
                  .single();
                
                if (textResult?.coordinates) {
                  binLocationData.coordinates = textResult.coordinates;
                  const coords = parsePostGISPoint(textResult.coordinates);
                  binLocationData.latitude = coords?.latitude;
                  binLocationData.longitude = coords?.longitude;
                  console.log('[PickupService] Fetched bin location as EWKB:', binLocationData);
                }
              } catch (textError) {
                console.warn('[PickupService] Could not fetch bin coordinates:', textError);
              }
            }
            
            digitalBinData[0].location = binLocationData;
          }
        } catch (locationError) {
          console.warn('[PickupService] Could not fetch bin location:', locationError);
        }
      }

      // Prioritize: one-time pickup > digital bin > scheduled pickup
      const activePickup = oneTimeData?.[0] || digitalBinData?.[0] || scheduledData?.[0];

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

        // Get location details if available (for non-digital-bin pickups)
        let location = null;
        if (activePickup.location_id && !activePickup.qr_code_url) {
          const { data: locationData } = await supabase
            .from('locations')
            .select('location_name, address, latitude, longitude, location_type')
            .eq('id', activePickup.location_id)
            .single();
          location = locationData;
        }

        // Determine if this is a digital bin
        const isDigitalBin = !!activePickup.qr_code_url;

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
          is_digital_bin: isDigitalBin,
          qr_code_url: activePickup.qr_code_url,
          bin_size_liters: activePickup.bin_size_liters,
          is_urgent: activePickup.is_urgent,
          schedule_type: activePickup.schedule_type,
          frequency: activePickup.frequency,
          created_at: activePickup.created_at,
          updated_at: activePickup.updated_at,
          accepted_at: activePickup.accepted_at,
          picked_up_at: activePickup.picked_up_at,
          disposed_at: activePickup.disposed_at,
          expires_at: activePickup.expires_at,
          collected_at: activePickup.collected_at
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

      console.log('[PickupService] Fetching fresh pickup details for ID:', pickupId);

      // Fetch basic data first
      const { data, error } = await supabase
        .from('pickup_requests')
        .select(`
          id, location, fee, status, collector_id, user_id,
          accepted_at, picked_up_at, disposed_at, created_at, updated_at,
          waste_type, bag_count, special_instructions, scheduled_date,
          preferred_time, points_earned
        `)
        .eq('id', pickupId)
        .maybeSingle();
      
      // Fetch coordinates - try RPC first, fallback to ::text
      if (data) {
        try {
          const { data: coordResult } = await supabase
            .rpc('get_request_coordinates_wkt', { request_id: pickupId });
          
          if (coordResult) {
            data.coordinates = coordResult;
            console.log('[PickupService] Fetched coordinates via RPC (WKT):', coordResult);
          }
        } catch (coordError) {
          console.warn('[PickupService] RPC not available, using ::text fallback');
          // Fallback: fetch as text (returns EWKB hex which we can parse)
          try {
            const { data: textResult } = await supabase
              .from('pickup_requests')
              .select('coordinates::text')
              .eq('id', pickupId)
              .single();
            
            if (textResult?.coordinates) {
              data.coordinates = textResult.coordinates;
              console.log('[PickupService] Fetched coordinates as EWKB:', textResult.coordinates);
            }
          } catch (textError) {
            console.warn('[PickupService] Could not fetch coordinates:', textError);
          }
        }
      }

      // If not found in pickup_requests, try digital_bins table
      if (!data && !error) {
        console.log('[PickupService] Not found in pickup_requests, checking digital_bins...');
        
        // Fetch fresh digital bin data
        const { data: digitalBinData, error: digitalBinError } = await supabase
          .from('digital_bins')
          .select(`
            id, user_id, location_id, qr_code_url, frequency, waste_type, bag_count,
            bin_size_liters, is_urgent, is_active, status, expires_at, collected_at,
            collector_id, created_at, updated_at
          `)
          .eq('id', pickupId)
          .maybeSingle();
        
        if (digitalBinError) {
          console.error('[PickupService] Error fetching digital bin:', digitalBinError);
          throw digitalBinError;
        }
        
        if (digitalBinData) {
          // Fetch location details for digital bin
          let location = null;
          if (digitalBinData.location_id) {
            try {
              // Fetch bin location basic data
              const { data: binLocationData } = await supabase
                .from('bin_locations')
                .select('id, location_name, address')
                .eq('id', digitalBinData.location_id)
                .maybeSingle();
              
              // Fetch coordinates - try RPC first, fallback to ::text
              if (binLocationData) {
                try {
                  const { data: coordResult } = await supabase
                    .rpc('get_bin_coordinates_wkt', { bin_location_id: digitalBinData.location_id });
                  
                  if (coordResult) {
                    binLocationData.coordinates = coordResult;
                    console.log('[PickupService] Fetched bin coordinates via RPC (WKT):', coordResult);
                  }
                } catch (coordError) {
                  console.warn('[PickupService] RPC not available, using ::text fallback');
                  // Fallback: fetch as text (returns EWKB hex)
                  try {
                    const { data: textResult } = await supabase
                      .from('bin_locations')
                      .select('coordinates::text')
                      .eq('id', digitalBinData.location_id)
                      .single();
                    
                    if (textResult?.coordinates) {
                      binLocationData.coordinates = textResult.coordinates;
                      console.log('[PickupService] Fetched bin coordinates as EWKB:', textResult.coordinates);
                    }
                  } catch (textError) {
                    console.warn('[PickupService] Could not fetch bin coordinates:', textError);
                  }
                }
              }
              
              if (binLocationData) {
                // Parse PostGIS coordinates to lat/lng
                const coords = parsePostGISPoint(binLocationData.coordinates);
                location = {
                  ...binLocationData,
                  latitude: coords?.latitude,
                  longitude: coords?.longitude
                };
                console.log('[PickupService] Parsed bin location:', location);
              }
            } catch (locationError) {
              console.warn('[PickupService] Could not fetch bin location:', locationError);
            }
          }
          
          // Fetch collector details if exists
          let collector = null;
          if (digitalBinData.collector_id) {
            try {
              const { data: collectorData } = await supabase
                .from('collector_profiles')
                .select('user_id, first_name, last_name, email, phone, rating, vehicle_type, vehicle_plate, vehicle_color, profile_image_url, status, region')
                .eq('user_id', digitalBinData.collector_id)
                .maybeSingle();
              
              if (collectorData) {
                collector = {
                  id: collectorData.user_id,
                  ...collectorData
                };
              }
            } catch (collectorError) {
              console.warn('[PickupService] Could not fetch collector details:', collectorError);
            }
          }
          
          // Format digital bin as pickup data
          const formattedData = {
            id: digitalBinData.id,
            user_id: digitalBinData.user_id,
            collector_id: digitalBinData.collector_id,
            collector: collector,
            status: digitalBinData.status,
            location: location,
            fee: 0,
            bag_count: digitalBinData.bag_count || 0,
            waste_type: digitalBinData.waste_type || 'general',
            special_instructions: '',
            points_earned: 15, // Digital bin points
            is_digital_bin: true,
            qr_code_url: digitalBinData.qr_code_url,
            frequency: digitalBinData.frequency,
            bin_size_liters: digitalBinData.bin_size_liters,
            is_urgent: digitalBinData.is_urgent,
            is_active: digitalBinData.is_active,
            expires_at: digitalBinData.expires_at,
            collected_at: digitalBinData.collected_at,
            created_at: digitalBinData.created_at,
            updated_at: digitalBinData.updated_at
          };
          
          console.log('[PickupService] Found digital bin:', formattedData.id);
          return { data: formattedData, error: null };
        }
      }

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
              .maybeSingle();
            
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
