import supabase from './supabaseClient.js';

// Track active subscriptions to prevent duplicates
const activeSubscriptions = new Map();

// Debug logging for real-time events
const logRealtimeEvent = (type, payload) => {
  console.log(`[Realtime] ${type}:`, {
    timestamp: new Date().toISOString(),
    ...payload
  });
};

/**
 * Subscribe to real-time updates for digital bins
 * @param {string} userId - The ID of the current user
 * @param {Function} onUpdate - Callback function when an update is received
 * @returns {object} The subscription object with an unsubscribe method
 */
export function subscribeToBinUpdates(userId, onUpdate) {
  if (!userId) {
    console.error('[Realtime] User ID is required for real-time updates');
    return { unsubscribe: () => {}, status: 'error' };
  }

  // Validate Supabase client
  if (!supabase?.realtime) {
    console.error('[Realtime] Supabase realtime client not available');
    return { unsubscribe: () => {}, status: 'error' };  
  }
  
  try {
    const subscriptionKey = `bin_updates_${userId}`;
    
    // If there's an existing subscription for this user, return it
    if (activeSubscriptions.has(subscriptionKey)) {
      logRealtimeEvent('Using existing subscription', { userId });
      return activeSubscriptions.get(subscriptionKey);
    }

    logRealtimeEvent('Creating new subscription', { userId });
    
    console.log('[Realtime] Creating new subscription for user:', userId);
    
    // Subscribe to changes in digital_bins table for this user
    const subscription = supabase
      .channel('digital_bins_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'digital_bins',
          filter: `user_id=eq.${userId}`
        },
        (payload) => {
          logRealtimeEvent('Received bin update', payload);
          try {
            onUpdate(payload);
          } catch (error) {
            console.error('[Realtime] Error in update handler:', error);
          }
        }
      )
      .subscribe((status, error) => {
        if (error) {
          console.error('[Realtime] Subscription error:', error);
          return;
        }
        logRealtimeEvent('Subscription status changed', { status });
      });
    
    // Create subscription object with unsubscribe method and status
    const subscriptionObject = {
      unsubscribe: () => {
        logRealtimeEvent('Unsubscribing', { userId });
        if (subscription) {
          try {
            supabase.removeChannel(subscription);
            activeSubscriptions.delete(subscriptionKey);
            logRealtimeEvent('Unsubscribed successfully', { userId });
          } catch (error) {
            console.error('[Realtime] Error unsubscribing from updates:', error);
          }
        }
      },
      status: 'subscribed'
    };

    // Store the subscription
    activeSubscriptions.set(subscriptionKey, subscriptionObject);
    return subscriptionObject;
  } catch (error) {
    console.error('[Realtime] Error creating subscription:', error);
    return { unsubscribe: () => {} };
  }
}

/**
 * Handle real-time updates for digital bins
 * @param {object} payload - The update payload from Supabase
 * @param {Array} currentBins - Current list of digital bins
 * @param {Function} setCurrentBins - Function to update the bins list
 */
export function handleBinUpdate(payload, currentBins, setCurrentBins) {
  if (!payload || !currentBins || !setCurrentBins) {
    console.error('[Realtime] Missing required parameters for handling bin update');
    return;
  }

  // Validate payload structure
  if (!payload.eventType || (!payload.new && !payload.old)) {
    console.error('[Realtime] Invalid payload structure:', payload);
    return;
  }

  try {
    const { eventType, new: newBin, old: oldBin } = payload;
    
    switch (eventType) {
      case 'INSERT':
        setCurrentBins([...currentBins, newBin]);
        break;
        
      case 'UPDATE':
        setCurrentBins(currentBins.map(bin => 
          bin.location_id === newBin.location_id ? { ...bin, ...newBin } : bin
        ));
        break;
        
      case 'DELETE':
        setCurrentBins(currentBins.filter(bin => bin.location_id !== oldBin.location_id));
        break;
        
      default:
        console.warn('[Realtime] Unknown event type:', eventType);
    }
  } catch (error) {
    console.error('[Realtime] Error handling bin update:', error);
  }
}
