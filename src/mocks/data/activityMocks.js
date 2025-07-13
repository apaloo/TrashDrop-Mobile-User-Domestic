/**
 * Activity mock data
 * Contains mock user activity data for testing and development
 */

const activityMocks = {
  // Recent activity for test user
  recentActivity: [
    {
      id: 'act-12345-001',
      user_id: '12345678-1234-5678-1234-567812345678',
      type: 'pickup',
      status: 'completed',
      details: 'Collected 3 bags from Park Street',
      pickup_id: 'pickup-12345-001',
      points: 50,
      created_at: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
      updated_at: new Date(Date.now() - 86400000).toISOString()
    },
    {
      id: 'act-12345-002',
      user_id: '12345678-1234-5678-1234-567812345678',
      type: 'report',
      status: 'completed',
      details: 'Reported illegal dumping near Central Ave',
      report_id: 'report-12345-001',
      points: 25,
      created_at: new Date(Date.now() - 172800000).toISOString(), // 2 days ago
      updated_at: new Date(Date.now() - 172800000).toISOString()
    },
    {
      id: 'act-12345-003',
      user_id: '12345678-1234-5678-1234-567812345678',
      type: 'pickup',
      status: 'completed',
      details: 'Collected 2 bags from River Walk',
      pickup_id: 'pickup-12345-002',
      points: 50,
      created_at: new Date(Date.now() - 259200000).toISOString(), // 3 days ago
      updated_at: new Date(Date.now() - 259200000).toISOString()
    }
  ],
  
  // Activity history (longer list if needed)
  activityHistory: [
    // Additional past activities can be added here
    {
      id: 'act-12345-004',
      user_id: '12345678-1234-5678-1234-567812345678',
      type: 'batch',
      status: 'completed',
      details: 'Processed batch of 5 bags',
      batch_id: 'batch-12345-001',
      points: 75,
      created_at: new Date(Date.now() - 604800000).toISOString(), // 1 week ago
      updated_at: new Date(Date.now() - 604800000).toISOString()
    }
  ],
  
  // Function to get activity for a specific user
  getActivityForUser: (userId, limit = 3) => {
    if (userId === '12345678-1234-5678-1234-567812345678') {
      return activityMocks.recentActivity.slice(0, limit);
    }
    
    // For other users, return empty array or create specific mock data
    return [];
  }
};

export default activityMocks;
