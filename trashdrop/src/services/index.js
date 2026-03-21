/**
 * Services index file
 * Centralizes all database services for easy import
 */

import userService from './userService.js';
import pickupService from './pickupService.js';
import activityService from './activityService.js';
import rewardsService from './rewardsService.js';
import onboardingService from './onboardingService.js';

export {
  userService,
  pickupService,
  activityService,
  rewardsService,
  onboardingService
};

// Default export for convenience
export default {
  user: userService,
  pickup: pickupService,
  activity: activityService,
  rewards: rewardsService,
  onboarding: onboardingService
};
