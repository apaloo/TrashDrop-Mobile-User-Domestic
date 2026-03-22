/**
 * Onboarding Service for TrashDrop
 * Implements the onboarding flow using existing infrastructure
 */

import supabase from '../utils/supabaseClient.js';

export const onboardingService = {
  /**
   * Get user's current onboarding state
   * Uses RPC function for consistent database state
   */
  async getUserState(userId) {
    console.log('[Onboarding] getUserState called for userId:', userId);
    
    try {
      // Use RPC function for consistent database state
      const { data, error } = await supabase
        .rpc('get_user_onboarding_state', { user_uuid: userId });
      
      if (error) {
        console.error('[Onboarding] RPC error getting user state:', error);
        // Fallback to manual calculation
        return this.calculateUserState(userId);
      }
      
      console.log('[Onboarding] User state from RPC:', data);
      return data;
    } catch (error) {
      console.error('[Onboarding] Error getting user state:', error);
      // Fallback to manual calculation
      return this.calculateUserState(userId);
    }
  },

  /**
   * Calculate user state manually (fallback method)
   * Uses same logic as userService to ensure consistency
   */
  async calculateUserState(userId) {
    try {
      console.log('[Onboarding] calculateUserState starting for userId:', userId);
      
      // Add timeout to prevent hanging
      const statePromise = this.performStateCalculation(userId);
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('State calculation timeout')), 5000); // 5 second timeout
      });
      
      try {
        const state = await Promise.race([statePromise, timeoutPromise]);
        console.log('[Onboarding] User state calculated successfully:', state);
        return state;
      } catch (timeoutError) {
        console.error('[Onboarding] State calculation timeout:', timeoutError);
        // Return default state on timeout
        return {
          state: 'NEW_USER',
          available_bags: 0,
          total_bags_scanned: 0,
          location_count: 0
        };
      }
    } catch (error) {
      console.error('[Onboarding] Error in calculateUserState:', error);
      return {
        state: 'NEW_USER',
        available_bags: 0,
        total_bags_scanned: 0,
        location_count: 0
      };
    }
  },

  // Temporary cleanup function for testing
  clearTestData(userId) {
    console.log('[Onboarding] Clearing test data for user:', userId);
    
    // Clear QR scan data
    const qrScanKey = `trashdrop_qr_scan_${userId}`;
    localStorage.removeItem(qrScanKey);
    
    // Clear location data
    const locationKey = `trashdrop_locations_${userId}`;
    localStorage.removeItem(locationKey);
    
    // Clear dismissal flag
    const dismissedKey = `trashdrop_onboarding_dismissed_${userId}`;
    localStorage.removeItem(dismissedKey);
    
    console.log('[Onboarding] Test data cleared');
    return 'Test data cleared successfully';
  },

  // Debug function to check current localStorage state
  debugLocalStorage(userId) {
    console.log('[Onboarding] Debug localStorage for user:', userId);
    
    const qrScanKey = `trashdrop_qr_scan_${userId}`;
    const qrScanData = JSON.parse(localStorage.getItem(qrScanKey) || 'null');
    
    const dismissedKey = `trashdrop_onboarding_dismissed_${userId}`;
    const hasDismissed = localStorage.getItem(dismissedKey);
    
    const locationKey = `trashdrop_locations_${userId}`;
    const locations = JSON.parse(localStorage.getItem(locationKey) || '[]');
    
    console.log('[Onboarding] LocalStorage state:', {
      qrScanKey,
      qrScanData,
      dismissedKey,
      hasDismissed,
      locationKey,
      locations
    });
    
    return {
      qrScanData,
      hasDismissed,
      locations
    };
  },

  // Main service methods for the actual calculation
  async performStateCalculation(userId) {
    console.log('[Onboarding] Starting state calculation for userId:', userId);
    
    try {
      // First check if QR has been scanned
      const qrScanKey = `trashdrop_qr_scan_${userId}`;
      const qrScanData = JSON.parse(localStorage.getItem(qrScanKey) || 'null');
      
      if (qrScanData && qrScanData.processed) {
        console.log('[Onboarding] QR scan found, user is ready for pickup');
        return {
          state: 'READY_FOR_PICKUP',
          available_bags: 0,
          total_bags_scanned: 1,
          location_count: 0
        };
      }
      
      // Next try to get location count from localStorage as fallback
      const cacheKey = `trashdrop_locations_${userId}`;
      const cachedLocations = JSON.parse(localStorage.getItem(cacheKey) || '[]');
      const localLocationCount = cachedLocations.length;
      
      console.log('[Onboarding] LocalStorage fallback - found locations:', localLocationCount);
      
      // If we have locations in localStorage, use that as primary source
      if (localLocationCount > 0) {
        console.log('[Onboarding] Using localStorage for location count, skipping DB query');
        return {
          state: 'LOCATION_SET',
          available_bags: 0,
          total_bags_scanned: 0,
          location_count: localLocationCount
        };
      }
      
      // Otherwise try database queries with timeout
      console.log('[Onboarding] No local locations, trying database queries...');
      
      // Add timeout to each database query
      const batchesPromise = supabase
        .from('batches')
        .select('bag_count')
        .eq('created_by', userId);
      
      const locationsPromise = supabase
        .from('locations')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);
      
      const bagsPromise = supabase
        .from('bag_inventory')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);
      
      // Add 3-second timeout to each query
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Database query timeout')), 3000);
      });
      
      // Execute queries with timeout
      const [batches, locations, bags] = await Promise.all([
        Promise.race([batchesPromise, timeoutPromise]),
        Promise.race([locationsPromise, timeoutPromise]),
        Promise.race([bagsPromise, timeoutPromise])
      ]);
      
      const availableBags = batches?.data?.reduce((sum, batch) => sum + (batch.bag_count || 0), 0) || 0;
      const locationCount = locations?.count || 0;
      const totalBagsScanned = bags?.count || 0;
      
      // Determine state
      let state;
      if (totalBagsScanned > 0) {
        state = 'READY_FOR_PICKUP';
      } else if (availableBags > 0) {
        state = 'READY_FOR_PICKUP';
      } else if (locationCount > 0) {
        state = 'LOCATION_SET';
      } else {
        state = 'NEW_USER';
      }
      
      console.log('[Onboarding] Database query successful:', {
        state,
        availableBags,
        totalBagsScanned,
        locationCount
      });
      
      return {
        state,
        available_bags: availableBags,
        total_bags_scanned: totalBagsScanned,
        location_count: locationCount
      };
      
    } catch (error) {
      console.error('[Onboarding] Database queries failed:', error);
      
      // Final fallback - check localStorage again
      const cacheKey = `trashdrop_locations_${userId}`;
      const cachedLocations = JSON.parse(localStorage.getItem(cacheKey) || '[]');
      const localLocationCount = cachedLocations.length;
      
      if (localLocationCount > 0) {
        console.log('[Onboarding] Final fallback - using localStorage locations');
        return {
          state: 'LOCATION_SET',
          available_bags: 0,
          total_bags_scanned: 0,
          location_count: localLocationCount
        };
      }
      
      // Ultimate fallback - return NEW_USER
      console.log('[Onboarding] Ultimate fallback - no locations found anywhere');
      return {
        state: 'NEW_USER',
        available_bags: 0,
        total_bags_scanned: 0,
        location_count: 0
      };
    }
  },

  /**
   * Start onboarding process
   * Uses RPC function to track onboarding start
   */
  async startOnboarding(userId) {
    try {
      console.log('[Onboarding] Start onboarding called for user:', userId);
      
      const { data, error } = await supabase
        .rpc('start_onboarding', { user_uuid: userId });
      
      if (error) {
        console.error('[Onboarding] Error starting onboarding:', error);
        throw error;
      }
      
      console.log('[Onboarding] Onboarding started successfully:', data);
      return data;
    } catch (error) {
      console.error('[Onboarding] Error starting onboarding:', error);
      throw error;
    }
  },

  /**
   * Set whether user has bags
   * Uses RPC function to record user selection
   */
  async setHasBags(userId, hasBags) {
    try {
      console.log('[Onboarding] setHasBags called:', { userId, hasBags });
      
      const { data, error } = await supabase
        .rpc('set_has_bags', { user_uuid: userId, has_bags: hasBags });
      
      if (error) {
        console.error('[Onboarding] Error setting has bags:', error);
        throw error;
      }
      
      console.log('[Onboarding] Has bags set successfully:', data);
      return data;
    } catch (error) {
      console.error('[Onboarding] Error setting has bags:', error);
      throw error;
    }
  },

  /**
   * Add user location
   * Uses RPC function to create location in bin_locations table
   */
  async addUserLocation(userId, name, address, latitude, longitude) {
    try {
      console.log('[Onboarding] addUserLocation called:', { userId, name, address, latitude, longitude });
      
      const { data, error } = await supabase
        .rpc('add_user_location', {
          user_uuid: userId,
          name: name,
          address: address,
          lat: latitude,
          lng: longitude
        });
      
      if (error) {
        console.error('[Onboarding] Error adding user location:', error);
        throw error;
      }
      
      console.log('[Onboarding] Location added successfully:', data);
      return data;
    } catch (error) {
      console.error('[Onboarding] Error adding user location:', error);
      throw error;
    }
  },

  /**
   * Process QR code scan
   * Uses RPC function to activate batch and update user stats
   */
  async processQRScan(userId, qrCode) {
    try {
      console.log('[Onboarding] processQRScan called:', { userId, qrCode });
      
      const { data, error } = await supabase
        .rpc('process_qr_scan', { user_uuid: userId, qr: qrCode });
      
      if (error) {
        console.error('[Onboarding] Error processing QR scan:', error);
        throw error;
      }
      
      console.log('[Onboarding] QR scan processed successfully:', data);
      return data;
    } catch (error) {
      console.error('[Onboarding] Error processing QR scan:', error);
      throw error;
    }
  },

  /**
   * Create digital bin
   * Uses RPC function to create digital bin with proper expiration
   */
  async createDigitalBin(userId, locationId, fee) {
    try {
      console.log('[Onboarding] createDigitalBin called:', { userId, locationId, fee });
      
      const { data, error } = await supabase
        .rpc('create_digital_bin', {
          user_uuid: userId,
          location_id: locationId,
          fee: fee
        });
      
      if (error) {
        console.error('[Onboarding] Error creating digital bin:', error);
        throw error;
      }
      
      console.log('[Onboarding] Digital bin created successfully:', data);
      return data;
    } catch (error) {
      console.error('[Onboarding] Error creating digital bin:', error);
      throw error;
    }
  },

  /**
   * Create onboarding pickup request
   * Uses RPC function to create pickup request in pickup_requests table
   */
  async createOnboardingPickup(userId, locationId, bagCount = 1) {
    try {
      console.log('[Onboarding] createOnboardingPickup called:', { userId, locationId, bagCount });
      
      const { data, error } = await supabase
        .rpc('create_onboarding_pickup', {
          user_uuid: userId,
          location_id: locationId,
          bag_count: bagCount
        });
      
      if (error) {
        console.error('[Onboarding] Error creating pickup:', error);
        throw error;
      }
      
      console.log('[Onboarding] Pickup created successfully:', data);
      return data;
    } catch (error) {
      console.error('[Onboarding] Error creating pickup:', error);
      throw error;
    }
  },

  /**
   * Get user's "has bags" selection from user_activity
   * Returns the most recent has_bags selection made by the user
   */
  async getUserHasBagsSelection(userId) {
    try {
      console.log('[Onboarding] getUserHasBagsSelection called for userId:', userId);
      
      const { data, error } = await supabase
        .rpc('get_user_has_bags_selection', { user_uuid: userId });
      
      if (error) {
        console.error('[Onboarding] Error getting user bags selection:', error);
        throw error;
      }
      
      console.log('[Onboarding] User bags selection from RPC:', data);
      return data;
    } catch (error) {
      console.error('[Onboarding] Error getting user bags selection:', error);
      throw error;
    }
  },

  /**
   * Check if user should see onboarding
   * Entry condition: available_bags = 0 AND total_bags_scanned = 0 AND not dismissed AND state is NEW_USER
   */
  async shouldShowOnboarding(userId) {
    console.log('[Onboarding] shouldShowOnboarding called with userId:', userId);
    
    try {
      // Check if user has dismissed onboarding
      const dismissedKey = `trashdrop_onboarding_dismissed_${userId}`;
      const hasDismissed = localStorage.getItem(dismissedKey);
      
      if (hasDismissed) {
        console.log('[Onboarding] User has dismissed onboarding, not showing');
        return false;
      }
      
      const state = await this.getUserState(userId);
      console.log('[Onboarding] User state for shouldShowOnboarding:', state);
      
      // Only show onboarding if user is truly new (NEW_USER state) and has no bags/scans
      // Users who have reached LOCATION_SET or beyond should not see onboarding again
      const shouldShow = state.state === 'NEW_USER' && 
                         (state.available_bags === 0 || state.available_bags === null) && 
                         (state.total_bags_scanned === 0 || state.total_bags_scanned === null) && 
                         !hasDismissed;
      
      console.log('[Onboarding] shouldShowOnboarding check:', {
        userId,
        state: state.state,
        available_bags: state.available_bags,
        total_bags_scanned: state.total_bags_scanned,
        hasDismissed: !!hasDismissed,
        shouldShow
      });
      
      // Auto-dismiss if user has progressed beyond NEW_USER state
      if (!shouldShow && state.state !== 'NEW_USER' && !hasDismissed) {
        console.log('[Onboarding] Auto-dismissing onboarding for user who has progressed');
        this.dismissOnboarding(userId);
      }
      
      return shouldShow;
    } catch (error) {
      console.error('[Onboarding] Error checking shouldShowOnboarding:', error);
      return false;
    }
  },

  /**
   * Dismiss onboarding permanently for user
   */
  dismissOnboarding(userId) {
    console.log('[Onboarding] Dismissing onboarding for user:', userId);
    const dismissedKey = `trashdrop_onboarding_dismissed_${userId}`;
    localStorage.setItem(dismissedKey, 'true');
    console.log('[Onboarding] Onboarding dismissed permanently');
  },

  /**
   * Get next action based on user state
   */
  async getNextAction(userId) {
    try {
      const state = await this.getUserState(userId);
      
      switch (state.state) {
        case 'NEW_USER':
          return {
            action: 'start_cleanup',
            title: 'Start a Cleanup',
            description: 'Begin your first waste collection',
            primary: true
          };
          
        case 'LOCATION_SET':
          return {
            action: 'scan_qr',
            title: 'Scan QR Code',
            description: 'Scan your bag QR code to get started',
            primary: true
          };
          
        case 'READY_FOR_PICKUP':
          return {
            action: 'request_pickup',
            title: 'Request Pickup',
            description: 'Schedule collection for your bags',
            primary: true
          };
          
        default:
          return {
            action: 'start_cleanup',
            title: 'Start a Cleanup',
            description: 'Begin your waste collection journey',
            primary: true
          };
      }
    } catch (error) {
      console.error('[Onboarding] Error getting next action:', error);
      return {
        action: 'start_cleanup',
        title: 'Start a Cleanup',
        description: 'Begin your waste collection journey',
        primary: true
      };
    }
  }
};

export default onboardingService;
