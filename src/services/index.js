/**
 * Services index file
 * Centralizes all database services for easy import
 */

import userService from './userService.js';
import pickupService from './pickupService.js';
import activityService from './activityService.js';
import rewardsService from './rewardsService.js';
import welcomeDiscountService from './welcomeDiscountService.js';

export {
  userService,
  pickupService,
  activityService,
  rewardsService,
  welcomeDiscountService
};

// Default export for convenience
export default {
  user: userService,
  pickup: pickupService,
  activity: activityService,
  rewards: rewardsService,
  welcomeDiscount: welcomeDiscountService
};
