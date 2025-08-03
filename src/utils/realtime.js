import supabase from './supabaseClient.js';

// Keep track of active subscriptions to prevent duplicate subscriptions
const activeSubscriptions = {};

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
  
  // Check if subscription for this userId already exists
  const subscriptionKey = `pickup_${userId}`;
  if (activeSubscriptions[subscriptionKey]) {
    console.log(`Using existing subscription for pickups (${userId})`);
    return activeSubscriptions[subscriptionKey];
  }

  try {
    // Create a new channel with a unique name to prevent conflicts
    const channelName = `pickups_${userId}_${Date.now()}`;
    
    // Subscribe to changes in the digital_bins table
    const subscription = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'digital_bins', // Updated to use digital_bins table
          filter: `user_id=eq.${userId}`
        },
        (payload) => {
          // Only process the update if the callback is provided
          if (typeof onUpdate === 'function') {
            console.log('[Realtime] Pickup update received:', payload.eventType);
            onUpdate(payload);
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log(`[Realtime] Successfully subscribed to pickup updates for ${userId}`);
        } else if (status === 'CHANNEL_ERROR') {
          console.error('[Realtime] Error subscribing to digital bin updates. Check table permissions.');
        } else if (status === 'TIMED_OUT') {
          console.warn('[Realtime] Subscription timed out. Reconnecting...');
        } else if (status === 'CHANNEL_CLOSED') {
          console.log('[Realtime] Subscription closed');
          // Remove from active subscriptions
          delete activeSubscriptions[subscriptionKey];
        }
      });

    const subscriptionObject = {
      unsubscribe: () => {
        try {
          console.log(`[Realtime] Unsubscribing from pickup updates for ${userId}`);
          supabase.removeChannel(subscription);
          delete activeSubscriptions[subscriptionKey];
        } catch (error) {
          console.error('[Realtime] Error unsubscribing from updates:', error);
        }
      }
    };

    // Store the subscription
    activeSubscriptions[subscriptionKey] = subscriptionObject;
    return subscriptionObject;
  } catch (error) {
    console.error('[Realtime] Error creating subscription:', error);
    return { unsubscribe: () => {} };
  }
}

/**
 * Handle real-time update payload and update the local state
 * @param {object} payload - The payload from the real-time subscription
 * @param {Array} currentPickups - The current array of pickups in state
 * @returns {Array} The updated array of pickups
 */
export function handlePickupUpdate(payload, currentPickups) {
  if (!currentPickups) return [];
  if (!payload) return currentPickups;
  
  const { eventType, new: newRecord, old: oldRecord } = payload;
  console.log(`[Realtime] Handling ${eventType} event for pickup data`);
  
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

/**
 * Subscribe to real-time updates for user stats
 * @param {string} userId - The ID of the current user
 * @param {Function} onUpdate - Callback function when an update is received
 * @returns {object} The subscription object with an unsubscribe method
 */
export function subscribeToStatsUpdates(userId, onUpdate) {
  if (!userId) {
    console.error('[Realtime] User ID is required for stats updates');
    return { unsubscribe: () => {} };
  }

  // Check if subscription for this userId already exists
  const subscriptionKey = `stats_${userId}`;
  if (activeSubscriptions[subscriptionKey]) {
    console.log(`[Realtime] Using existing subscription for stats (${userId})`);
    return activeSubscriptions[subscriptionKey];
  }

  try {
    // Create a new channel with a unique name to prevent conflicts
    const channelName = `stats_${userId}_${Date.now()}`;
    
    // Subscribe to changes in multiple tables that affect stats
    const subscription = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_stats',
          filter: `user_id=eq.${userId}`
        },
        (payload) => {
          if (typeof onUpdate === 'function') {
            console.log('[Realtime] User stats update received');
            onUpdate('user_stats', payload);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_activity',
          filter: `user_id=eq.${userId}`
        },
        (payload) => {
          if (typeof onUpdate === 'function') {
            console.log('[Realtime] User activity update received');
            onUpdate('user_activity', payload);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${userId}`
        },
        (payload) => {
          if (typeof onUpdate === 'function') {
            console.log('[Realtime] User profile update received');
            onUpdate('profiles', payload);
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log(`[Realtime] Successfully subscribed to stats updates for ${userId}`);
        } else if (status === 'CHANNEL_ERROR') {
          console.error('[Realtime] Error subscribing to stats updates');
        } else if (status === 'TIMED_OUT') {
          console.warn('[Realtime] Stats subscription timed out. Reconnecting...');
        } else if (status === 'CHANNEL_CLOSED') {
          console.log('[Realtime] Stats subscription closed');
          // Remove from active subscriptions
          delete activeSubscriptions[subscriptionKey];
        }
      });

    const subscriptionObject = {
      unsubscribe: () => {
        try {
          console.log(`[Realtime] Unsubscribing from stats updates for ${userId}`);
          supabase.removeChannel(subscription);
          delete activeSubscriptions[subscriptionKey];
        } catch (error) {
          console.error('[Realtime] Error unsubscribing from stats updates:', error);
        }
      }
    };

    // Store the subscription
    activeSubscriptions[subscriptionKey] = subscriptionObject;
    return subscriptionObject;
  } catch (error) {
    console.error('[Realtime] Error creating stats subscription:', error);
    return { unsubscribe: () => {} };
  }
}

/**
 * Handle stats update payload and update the local state
 * @param {string} tableType - The table that was updated (user_stats, user_activity, profiles)
 * @param {object} payload - The payload from the real-time subscription
 * @param {object} currentStats - The current stats state object
 * @returns {object} The updated stats object
 */
export function handleStatsUpdate(tableType, payload, currentStats) {
  if (!currentStats || !payload) return currentStats || {};
  
  const { eventType, new: newRecord } = payload;
  console.log(`[Realtime] Handling ${eventType} event for ${tableType}`);
  
  // Create a copy of the current stats to avoid direct mutation
  const updatedStats = { ...currentStats };
  
  switch (tableType) {
    case 'user_stats':
      // Update specific stats from the user_stats table
      if (newRecord) {
        updatedStats.points = newRecord.points || updatedStats.points;
        updatedStats.pickups = newRecord.pickups || updatedStats.pickups;
        updatedStats.reports = newRecord.reports || updatedStats.reports;
        updatedStats.batches = newRecord.batches || updatedStats.batches;
        updatedStats.total_bags = newRecord.total_bags || updatedStats.total_bags;
      }
      break;
      
    case 'profiles':
      // Update points from profiles table
      if (newRecord && newRecord.points !== undefined) {
        updatedStats.points = newRecord.points;
      }
      break;
      
    case 'user_activity':
      // For activity updates, we don't directly update stats but might want to
      // refresh certain sections of the UI
      if (eventType === 'INSERT' && updatedStats.recentActivity) {
        // Add the new activity to recent activities if present
        updatedStats.recentActivity = [
          newRecord,
          ...updatedStats.recentActivity.slice(0, 4)
        ];
      }
      break;
      
    default:
      return currentStats;
  }
  
  return updatedStats;
}

/**
 * Subscribe to real-time updates for rewards data
 * @param {string} userId - The ID of the current user
 * @param {Function} onUpdate - Callback function when an update is received
 * @returns {object} The subscription object with an unsubscribe method
 */
export function subscribeToRewardsUpdates(userId, onUpdate) {
  if (!userId) {
    console.error('[Realtime] User ID is required for rewards updates');
    return { unsubscribe: () => {} };
  }

  // Check if subscription for this userId already exists
  const subscriptionKey = `rewards_${userId}`;
  if (activeSubscriptions[subscriptionKey]) {
    console.log(`[Realtime] Using existing subscription for rewards (${userId})`);
    return activeSubscriptions[subscriptionKey];
  }

  try {
    // Create a new channel with a unique name to prevent conflicts
    const channelName = `rewards_${userId}_${Date.now()}`;
    
    // Subscribe to changes in multiple tables that affect rewards
    const subscription = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rewards',
          filter: `active=eq.true`
        },
        (payload) => {
          if (typeof onUpdate === 'function') {
            console.log('[Realtime] Rewards update received');
            onUpdate('rewards', payload);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'reward_redemptions',
          filter: `user_id=eq.${userId}`
        },
        (payload) => {
          if (typeof onUpdate === 'function') {
            console.log('[Realtime] Reward redemption update received');
            onUpdate('reward_redemptions', payload);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${userId}`
        },
        (payload) => {
          if (typeof onUpdate === 'function') {
            console.log('[Realtime] User profile points update received');
            onUpdate('profiles', payload);
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log(`[Realtime] Successfully subscribed to rewards updates for ${userId}`);
        } else if (status === 'CHANNEL_ERROR') {
          console.error('[Realtime] Error subscribing to rewards updates');
        } else if (status === 'TIMED_OUT') {
          console.warn('[Realtime] Rewards subscription timed out. Reconnecting...');
        } else if (status === 'CHANNEL_CLOSED') {
          console.log('[Realtime] Rewards subscription closed');
          // Remove from active subscriptions
          delete activeSubscriptions[subscriptionKey];
        }
      });

    const subscriptionObject = {
      unsubscribe: () => {
        try {
          console.log(`[Realtime] Unsubscribing from rewards updates for ${userId}`);
          supabase.removeChannel(subscription);
          delete activeSubscriptions[subscriptionKey];
        } catch (error) {
          console.error('[Realtime] Error unsubscribing from rewards updates:', error);
        }
      }
    };

    // Store the subscription
    activeSubscriptions[subscriptionKey] = subscriptionObject;
    return subscriptionObject;
  } catch (error) {
    console.error('[Realtime] Error creating rewards subscription:', error);
    return { unsubscribe: () => {} };
  }
}

/**
 * Handle rewards update payload and update the local state
 * @param {string} tableType - The table that was updated (rewards, reward_redemptions, profiles)
 * @param {object} payload - The payload from the real-time subscription
 * @param {object} currentData - The current rewards data state object
 * @returns {object} The updated rewards data object
 */
export function handleRewardsUpdate(tableType, payload, currentData) {
  if (!currentData || !payload) return currentData || {};
  
  const { eventType, new: newRecord, old: oldRecord } = payload;
  console.log(`[Realtime] Handling ${eventType} event for ${tableType}`);
  
  // Create a copy of the current data to avoid direct mutation
  const updatedData = { ...currentData };
  
  switch (tableType) {
    case 'rewards':
      // Update available rewards list
      if (updatedData.availableRewards && Array.isArray(updatedData.availableRewards)) {
        if (eventType === 'INSERT') {
          // Add the new reward
          updatedData.availableRewards = [newRecord, ...updatedData.availableRewards];
        } else if (eventType === 'UPDATE') {
          // Update the existing reward
          updatedData.availableRewards = updatedData.availableRewards.map(reward => 
            reward.id === newRecord.id ? newRecord : reward
          );
        } else if (eventType === 'DELETE') {
          // Remove the deleted reward
          updatedData.availableRewards = updatedData.availableRewards.filter(reward => 
            reward.id !== oldRecord.id
          );
        }
      }
      break;
      
    case 'reward_redemptions':
      // Update redemption history list
      if (updatedData.redemptionHistory && Array.isArray(updatedData.redemptionHistory)) {
        if (eventType === 'INSERT') {
          // Add the new redemption
          updatedData.redemptionHistory = [newRecord, ...updatedData.redemptionHistory];
        } else if (eventType === 'UPDATE') {
          // Update existing redemption
          updatedData.redemptionHistory = updatedData.redemptionHistory.map(redemption => 
            redemption.id === newRecord.id ? newRecord : redemption
          );
        }
      }
      break;
      
    case 'profiles':
      // Update user points
      if (newRecord && newRecord.points !== undefined) {
        updatedData.userPoints = newRecord.points;
      }
      break;
      
    default:
      return currentData;
  }
  
  return updatedData;
}

/**
 * Subscribe to real-time updates for dumping reports
 * @param {string} userId - The ID of the current user
 * @param {Function} onUpdate - Callback function when an update is received
 * @returns {object} The subscription object with an unsubscribe method
 */
export function subscribeToDumpingReports(userId, onUpdate) {
  if (!userId) {
    console.error('User ID is required for dumping reports updates');
    return { unsubscribe: () => {} };
  }
  
  // Check if subscription for this userId already exists
  const subscriptionKey = `dumping_reports_${userId}`;
  if (activeSubscriptions[subscriptionKey]) {
    console.log(`Using existing subscription for dumping reports (${userId})`);
    return activeSubscriptions[subscriptionKey];
  }

  try {
    // Create a new channel with a unique name to prevent conflicts
    const channelName = `dumping_reports_${userId}_${Date.now()}`;
    
    // Subscribe to changes in the illegal_dumping_mobile table
    const subscription = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'illegal_dumping_mobile',
          filter: `reported_by=eq.${userId}`
        },
        (payload) => {
          // Only process the update if the callback is provided
          if (typeof onUpdate === 'function') {
            console.log('[Realtime] Dumping report update received:', payload.eventType);
            onUpdate(payload);
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log(`[Realtime] Successfully subscribed to dumping reports for ${userId}`);
        } else if (status === 'CHANNEL_ERROR') {
          console.error('[Realtime] Error subscribing to dumping reports');
        } else if (status === 'TIMED_OUT') {
          console.warn('[Realtime] Dumping reports subscription timed out. Reconnecting...');
        } else if (status === 'CHANNEL_CLOSED') {
          console.log('[Realtime] Dumping reports subscription closed');
          // Remove from active subscriptions
          delete activeSubscriptions[subscriptionKey];
        }
      });

    const subscriptionObject = {
      unsubscribe: () => {
        try {
          console.log(`[Realtime] Unsubscribing from dumping reports for ${userId}`);
          supabase.removeChannel(subscription);
          delete activeSubscriptions[subscriptionKey];
        } catch (error) {
          console.error('[Realtime] Error unsubscribing from dumping reports:', error);
        }
      }
    };

    // Store the subscription
    activeSubscriptions[subscriptionKey] = subscriptionObject;
    return subscriptionObject;
  } catch (error) {
    console.error('[Realtime] Error creating dumping reports subscription:', error);
    return { unsubscribe: () => {} };
  }
}

/**
 * Handle dumping reports update payload and trigger stats refresh
 * @param {object} payload - The payload from the real-time subscription
 * @param {Function} refreshStats - Function to refresh dashboard stats
 * @returns {void}
 */
export function handleDumpingReportUpdate(payload, refreshStats) {
  if (!payload) return;
  
  const { eventType, new: newRecord, old: oldRecord } = payload;
  console.log(`[Realtime] Handling dumping report ${eventType} event`);
  
  // Trigger stats refresh when a new report is created
  if (eventType === 'INSERT' && typeof refreshStats === 'function') {
    console.log('[Realtime] New dumping report created, refreshing stats');
    refreshStats();
  }
  
  // Also refresh on status updates
  if (eventType === 'UPDATE' && typeof refreshStats === 'function') {
    console.log('[Realtime] Dumping report updated, refreshing stats');
    refreshStats();
  }
}
