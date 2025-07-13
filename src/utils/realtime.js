import { supabase } from './supabaseClient';

/**
 * Subscribe to real-time updates for scheduled pickups
 * @param {string} userId - The ID of the current user
 * @param {Function} onUpdate - Callback function when an update is received
 * @returns {object} The subscription object with an unsubscribe method
 */
export function subscribeToPickupUpdates(userId, onUpdate) {
  if (!userId) {
    console.error('User ID is required for real-time updates');
    return { unsubscribe: () => {} };
  }

  // Subscribe to changes in the scheduled_pickups table
  const subscription = supabase
    .channel('scheduled_pickups_changes')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'scheduled_pickups',
        filter: `user_id=eq.${userId}`
      },
      (payload) => {
        // Only process the update if the callback is provided
        if (typeof onUpdate === 'function') {
          onUpdate(payload);
        }
      }
    )
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR') {
        console.error('Error subscribing to real-time updates');
      } else if (status === 'TIMED_OUT') {
        console.warn('Real-time subscription timed out. Reconnecting...');
      } else if (status === 'CHANNEL_CLOSED') {
        console.log('Real-time subscription closed');
      }
    });

  return {
    unsubscribe: () => {
      try {
        supabase.removeChannel(subscription);
      } catch (error) {
        console.error('Error unsubscribing from real-time updates:', error);
      }
    }
  };
}

/**
 * Handle real-time update payload and update the local state
 * @param {object} payload - The payload from the real-time subscription
 * @param {Array} currentPickups - The current array of pickups in state
 * @returns {Array} The updated array of pickups
 */
export function handlePickupUpdate(payload, currentPickups) {
  if (!currentPickups) return [];
  
  const { eventType, new: newRecord, old: oldRecord } = payload;
  
  switch (eventType) {
    case 'INSERT':
      // Add the new pickup to the beginning of the array
      return [newRecord, ...currentPickups];
      
    case 'UPDATE':
      // Update the existing pickup
      return currentPickups.map(pickup => 
        pickup.id === newRecord.id ? { ...pickup, ...newRecord } : pickup
      );
      
    case 'DELETE':
      // Remove the deleted pickup
      return currentPickups.filter(pickup => pickup.id !== oldRecord.id);
      
    default:
      return currentPickups;
  }
}
