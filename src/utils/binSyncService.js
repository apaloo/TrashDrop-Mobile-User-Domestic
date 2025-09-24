import supabase from './supabaseClient.js';

/**
 * Service for handling synchronization of digital bins
 * when the device comes back online after being offline
 */

/**
 * Process any pending bin location cancellations that couldn't be completed due to network issues
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
    const pendingCancellations = JSON.parse(localStorage.getItem('pendingBinCancellations') || '[]');
    
    if (pendingCancellations.length === 0) {
      return [];
    }
    
    console.log(`Processing ${pendingCancellations.length} pending cancellations`);
    
    const results = [];
    const timestamp = new Date().toISOString();
    
    // Process each pending cancellation
    for (const locationId of pendingCancellations) {
      try {
        const { data, error } = await supabase
          .from('digital_bins')
          .update({ 
            status: 'cancelled',
            updated_at: timestamp,
            cancelled_by: userId
          })
          .eq('location_id', locationId)
          .select();
        
        if (error) {
          console.error('Error processing cancellation for bin:', locationId, error);
          results.push({ 
            id: locationId, 
            success: false, 
            error: error.message 
          });
        } else {
          console.log('Successfully processed cancellation for bin:', locationId);
          results.push({ 
            id: locationId, 
            success: true, 
            data 
          });
        }
      } catch (error) {
        console.error('Exception processing cancellation for bin:', locationId, error);
        results.push({ 
          id: locationId, 
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
    localStorage.setItem('pendingBinCancellations', JSON.stringify(remainingPending));
    
    return results;
  } catch (error) {
    console.error('Error processing pending cancellations:', error);
    return [];
  }
}

/**
 * Synchronize local bin changes with the server
 * @param {string} userId - The current user ID
 * @returns {Promise<Object>} - Results of the sync operation
 */
export async function syncBinsWithServer(userId) {
  if (!userId) {
    console.error('User ID required to sync bins');
    return { success: false, error: 'No user ID provided' };
  }

  try {
    // Process any pending cancellations first
    const cancellationResults = await processPendingCancellations(userId);
    
    // Get the last sync timestamp
    const lastSync = localStorage.getItem('digitalBinsLastSyncTime');
    
    // Get latest bins from server
    const query = supabase
      .from('digital_bins')
      .select('*')
      .eq('user_id', userId);
      
    // Only filter by updated_at if we have a last sync timestamp
    if (lastSync) {
      query.gt('updated_at', lastSync);
    }
    
    const { data: serverBins, error } = await query;
    
    if (error) {
      console.error('Error fetching bins from server:', error);
      return { 
        success: false, 
        error: error.message,
        cancellationResults
      };
    }
    
    // SERVER-FIRST: Transform and store server data directly
    if (serverBins && serverBins.length > 0) {
      // Transform server data to consistent format
      const transformedBins = serverBins.map(bin => ({
        ...bin,
        status: bin.is_active ? 'active' : 'cancelled'
      }));
      
      // Store server data as single source of truth
      localStorage.setItem('digitalBins', JSON.stringify(transformedBins));
      
      const timestamp = new Date().toISOString();
      localStorage.setItem('digitalBinsLastUpdated', timestamp);
      localStorage.setItem('digitalBinsLastSyncTime', timestamp);
      
      console.log(`[BinSync] Updated storage with ${transformedBins.length} bins from server`);
    } else {
      // No server data - clear local storage
      localStorage.setItem('digitalBins', JSON.stringify([]));
      console.log('[BinSync] No server data - cleared local storage');
    }
    
    return {
      success: true,
      changes: serverBins && serverBins.length > 0,
      cancellationResults
    };
  } catch (error) {
    console.error('Error syncing bins with server:', error);
    return { 
      success: false, 
      error: error.message 
    };
  }
}

/**
 * Setup network status change listener to sync bins when coming back online
 * @param {string} userId - The current user ID
 * @returns {Function} Cleanup function to remove event listener
 */
export function setupNetworkSyncListener(userId) {
  if (!userId) return () => {};
  
  // Handle online status changes
  const handleOnline = async () => {
    console.log('Network connection restored. Syncing bins...');
    try {
      const result = await syncBinsWithServer(userId);
      if (result.success) {
        console.log('Bin sync completed successfully', result);
        // Dispatch an event that components can listen for
        window.dispatchEvent(new CustomEvent('binsSync', { 
          detail: { 
            success: true,
            changes: result.changes,
            timestamp: new Date().toISOString()
          } 
        }));
      } else {
        console.error('Bin sync failed:', result.error);
      }
    } catch (error) {
      console.error('Error during bin sync:', error);
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
