/**
 * Stats mock data
 * Contains mock user statistics data for testing and development
 */

const statsMocks = {
  // Default stats for test user
  defaultStats: {
    user_id: '12345678-1234-5678-1234-567812345678',
    total_points: 325,
    total_pickups: 7,
    total_reports: 4,
    total_bags_scanned: 12,
    scanned_batches: [{ id: 'b1' }, { id: 'b2' }, { id: 'b3' }],
    avg_response_time: 18, // in minutes
    completion_rate: 92.5, // percentage
    last_activity: new Date(Date.now() - 172800000).toISOString(), // 2 days ago
    updated_at: new Date().toISOString()
  },
  
  // Stats for other mock users
  userStats: [
    {
      user_id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      total_points: 450,
      total_pickups: 10,
      total_reports: 6,
      total_bags_scanned: 15,
      scanned_batches: [{ id: 'b1' }, { id: 'b2' }, { id: 'b3' }, { id: 'b4' }],
      avg_response_time: 15,
      completion_rate: 95,
      last_activity: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
      updated_at: new Date().toISOString()
    },
    {
      user_id: '550e8400-e29b-41d4-a716-446655440000',
      total_points: 225,
      total_pickups: 5,
      total_reports: 3,
      total_bags_scanned: 8,
      scanned_batches: [{ id: 'b1' }, { id: 'b2' }],
      avg_response_time: 20,
      completion_rate: 90,
      last_activity: new Date(Date.now() - 259200000).toISOString(), // 3 days ago
      updated_at: new Date().toISOString()
    }
  ],
  
  // Function to get stats for a specific user
  getStatsForUser: (userId) => {
    if (userId === '12345678-1234-5678-1234-567812345678') {
      return statsMocks.defaultStats;
    }
    
    const userStat = statsMocks.userStats.find(stat => stat.user_id === userId);
    return userStat || statsMocks.defaultStats;
  }
};

export default statsMocks;
