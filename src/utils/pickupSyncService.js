import supabase from './supabaseClient.js';

/**
 * Service for handling synchronization of scheduled pickups
 * when the device comes back online after being offline
 */

/**
 * Process any pending pickup cancellations that couldn't be completed due to network issues
 * @param {string} userId - The current user ID
 * @returns {Promise<Array>} - Array of processed cancellation results
 */
export async function processPendingCancellations(userId) {
  if (!userId) {
    console.error('User ID required to process pending cancellations');
    return [];
  }

  try {
    // Get list of pending cancellations
    const pendingCancellations = JSON.parse(localStorage.getItem('pendingPickupCancellations') || '[]');
    
    if (pendingCancellations.length === 0) {
      return [];
    }
    
    console.log(`Processing ${pendingCancellations.length} pending cancellations`);
    
    const results = [];
    const timestamp = new Date().toISOString();
    
    // Process each pending cancellation
    for (const pickupId of pendingCancellations) {
      try {
        const { data, error } = await supabase
          .from('scheduled_pickups')
          .update({ 
            status: 'cancelled',
            updated_at: timestamp,
            cancelled_by: userId
          })
          .eq('id', pickupId)
          .select();
        
        if (error) {
          console.error('Error processing cancellation for pickup:', pickupId, error);
          results.push({ 
            id: pickupId, 
            success: false, 
            error: error.message 
          });
        } else {
          console.log('Successfully processed cancellation for pickup:', pickupId);
          results.push({ 
            id: pickupId, 
            success: true, 
            data 
          });
        }
      } catch (error) {
        console.error('Exception processing cancellation for pickup:', pickupId, error);
        results.push({ 
          id: pickupId, 
          success: false, 
          error: error.message 
        });
      }
    }
    
    // Clear successfully processed cancellations from pending list
    const successfulIds = results
      .filter(result => result.success)
      .map(result => result.id);
      
    const remainingPending = pendingCancellations.filter(id => !successfulIds.includes(id));
    localStorage.setItem('pendingPickupCancellations', JSON.stringify(remainingPending));
    
    return results;
  } catch (error) {
    console.error('Error processing pending cancellations:', error);
    return [];
  }
}

/**
 * Synchronize local pickup changes with the server
 * @param {string} userId - The current user ID
 * @returns {Promise<Object>} - Results of the sync operation
 */
export async function syncPickupsWithServer(userId) {
  if (!userId) {
    console.error('User ID required to sync pickups');
    return { success: false, error: 'No user ID provided' };
  }

  try {
    // Process any pending cancellations first
    const cancellationResults = await processPendingCancellations(userId);
    
    // Get the last sync timestamp
    const lastSync = localStorage.getItem('scheduledPickupsLastSyncTime');
    
    // Get latest pickups from server
    const query = supabase
      .from('scheduled_pickups')
      .select('*')
      .eq('user_id', userId);
      
    // Only filter by updated_at if we have a last sync timestamp
    if (lastSync) {
      query.gt('updated_at', lastSync);
    }
    
    const { data: serverPickups, error } = await query;
    
    if (error) {
      console.error('Error fetching pickups from server:', error);
      return { 
        success: false, 
        error: error.message,
        cancellationResults
      };
    }
    
    // Get current pickups from local storage
    const localPickupsStr = localStorage.getItem('scheduledPickups');
    let localPickups = [];
    
    if (localPickupsStr) {
      try {
        localPickups = JSON.parse(localPickupsStr);
      } catch (parseError) {
        console.error('Error parsing local pickups:', parseError);
        // If local data is corrupted, we'll use server data only
      }
    }
    
    // Create a map for faster lookups
    const localPickupsMap = new Map();
    localPickups.forEach(pickup => {
      localPickupsMap.set(pickup.id, pickup);
    });
    
    // Merge server changes with local pickups
    let hasChanges = false;
    
    if (serverPickups && serverPickups.length > 0) {
      serverPickups.forEach(serverPickup => {
        const localPickup = localPickupsMap.get(serverPickup.id);
        
        // If we have the pickup locally
        if (localPickup) {
          // Keep local changes for completed/cancelled pickups
          if ((localPickup.status === 'completed' || localPickup.status === 'cancelled') && 
              serverPickup.status === 'scheduled') {
            // Local status takes precedence - we'll need to sync this back to server later
          } else {
            // Server status takes precedence for other cases
            localPickupsMap.set(serverPickup.id, {
              ...localPickup,
              ...serverPickup
            });
            hasChanges = true;
          }
        } else {
          // New pickup from server - add it
          localPickupsMap.set(serverPickup.id, serverPickup);
          hasChanges = true;
        }
      });
    }
    
    // If we have changes, update localStorage
    if (hasChanges) {
      const mergedPickups = Array.from(localPickupsMap.values());
      localStorage.setItem('scheduledPickups', JSON.stringify(mergedPickups));
      
      const timestamp = new Date().toISOString();
      localStorage.setItem('scheduledPickupsLastUpdated', timestamp);
      localStorage.setItem('scheduledPickupsLastSyncTime', timestamp);
    }
    
    return {
      success: true,
      changes: hasChanges,
      cancellationResults
    };
  } catch (error) {
    console.error('Error syncing pickups with server:', error);
    return { 
      success: false, 
      error: error.message 
    };
  }
}

/**
 * Setup network status change listener to sync pickups when coming back online
 * @param {string} userId - The current user ID
 */
export function setupNetworkSyncListener(userId) {
  if (!userId) return;
  
  // Handle online status changes
  const handleOnline = async () => {
    console.log('Network connection restored. Syncing pickups...');
    try {
      const result = await syncPickupsWithServer(userId);
      if (result.success) {
        console.log('Pickup sync completed successfully', result);
        // Dispatch an event that components can listen for
        window.dispatchEvent(new CustomEvent('pickupsSynced', { 
          detail: { 
            success: true,
            changes: result.changes,
            timestamp: new Date().toISOString()
          } 
        }));
      } else {
        console.error('Pickup sync failed:', result.error);
      }
    } catch (error) {
      console.error('Error during pickup sync:', error);
    }
  };

  // Remove any existing listener first
  window.removeEventListener('online', handleOnline);
  
  // Add the listener
  window.addEventListener('online', handleOnline);
  
  // Return a cleanup function
  return () => {
    window.removeEventListener('online', handleOnline);
  };
}
