/**
 * Pickup mock data
 * Contains mock pickup data for testing and development
 */

const pickupMocks = {
  // Active pickup for test user
  activePickup: {
    id: 'pickup-12345-003',
    user_id: '12345678-1234-5678-1234-567812345678',
    status: 'waiting_for_collector',
    location: {
      latitude: 5.632583,
      longitude: -0.172204,
      address: '123 Main Street, Accra'
    },
    bags: 2,
    notes: 'Near the blue building',
    estimated_pickup_time: new Date(Date.now() + 3600000).toISOString(), // 1 hour from now
    created_at: new Date(Date.now() - 1800000).toISOString(), // 30 mins ago
    updated_at: new Date(Date.now() - 1800000).toISOString()
  },
  
  // Historical pickups
  completedPickups: [
    {
      id: 'pickup-12345-001',
      user_id: '12345678-1234-5678-1234-567812345678',
      status: 'completed',
      location: {
        latitude: 5.635583,
        longitude: -0.173204,
        address: '456 Park Avenue, Accra'
      },
      bags: 3,
      notes: 'Left by the gate',
      collector_id: 'collector-54321-001',
      collector_name: 'James Wilson',
      completed_at: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
      created_at: new Date(Date.now() - 90000000).toISOString(), // ~1 day and 1 hour ago
      updated_at: new Date(Date.now() - 86400000).toISOString()
    },
    {
      id: 'pickup-12345-002',
      user_id: '12345678-1234-5678-1234-567812345678',
      status: 'completed',
      location: {
        latitude: 5.638583,
        longitude: -0.174204,
        address: '789 River Road, Accra'
      },
      bags: 2,
      notes: 'Behind the blue shed',
      collector_id: 'collector-54321-002',
      collector_name: 'Sarah Johnson',
      completed_at: new Date(Date.now() - 259200000).toISOString(), // 3 days ago
      created_at: new Date(Date.now() - 262800000).toISOString(), // ~3 days and 1 hour ago
      updated_at: new Date(Date.now() - 259200000).toISOString()
    }
  ],
  
  // Function to get active pickup for a user
  getActivePickupForUser: (userId) => {
    if (userId === '12345678-1234-5678-1234-567812345678') {
      return pickupMocks.activePickup;
    }
    return null;
  },
  
  // Function to get pickup history for a user
  getPickupHistoryForUser: (userId, limit = 5) => {
    if (userId === '12345678-1234-5678-1234-567812345678') {
      return pickupMocks.completedPickups.slice(0, limit);
    }
    return [];
  }
};

export default pickupMocks;
