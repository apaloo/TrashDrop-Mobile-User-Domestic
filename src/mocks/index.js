/**
 * Mock data index file
 * Centralizes all mock data for the application
 */

import userMocks from './data/userMocks.js';
import statsMocks from './data/statsMocks.js';
import activityMocks from './data/activityMocks.js';
import pickupMocks from './data/pickupMocks.js';

// Export all mocks
const mocks = {
  user: userMocks,
  stats: statsMocks,
  activity: activityMocks,
  pickups: pickupMocks
};

export default mocks;
