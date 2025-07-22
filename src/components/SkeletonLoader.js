import React from 'react';

/**
 * Skeleton loading components for better UX during data loading
 */

export const StatCardSkeleton = () => (
  <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded-lg animate-pulse min-w-[280px] flex-shrink-0 md:flex-1 snap-center">
    <div className="flex justify-between items-center mb-2">
      <div className="h-4 bg-gray-300 dark:bg-gray-600 rounded w-24"></div>
      <div className="h-5 bg-gray-300 dark:bg-gray-600 rounded-full w-10"></div>
    </div>
    <div className="h-8 bg-gray-300 dark:bg-gray-600 rounded w-16 mb-2"></div>
    <div className="w-full h-2 bg-gray-200 dark:bg-gray-600 rounded-full mb-1"></div>
    <div className="h-3 bg-gray-300 dark:bg-gray-600 rounded w-32"></div>
  </div>
);

export const ActivityItemSkeleton = () => (
  <div className="flex items-center space-x-3 animate-pulse">
    <div className="w-10 h-10 bg-gray-300 dark:bg-gray-600 rounded-full"></div>
    <div className="flex-1">
      <div className="h-4 bg-gray-300 dark:bg-gray-600 rounded w-3/4 mb-1"></div>
      <div className="h-3 bg-gray-300 dark:bg-gray-600 rounded w-1/2"></div>
    </div>
    <div className="h-6 bg-gray-300 dark:bg-gray-600 rounded-full w-12"></div>
  </div>
);

export const DashboardSkeleton = () => (
  <div className="space-y-6 pb-28 md:pb-6">
    {/* Stats Cards Skeleton */}
    <div className="bg-white dark:bg-gray-800 pt-2 px-6 pb-6 rounded-lg shadow-md mb-6">
      <div className="flex md:grid md:grid-cols-4 gap-4 mb-6 overflow-x-auto pb-4 snap-x snap-mandatory scroll-pl-6 touch-pan-x">
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </div>
    </div>

    {/* Active Pickup Skeleton */}
    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md animate-pulse">
      <div className="h-5 bg-gray-300 dark:bg-gray-600 rounded w-32 mb-4"></div>
      <div className="space-y-3">
        <div className="h-4 bg-gray-300 dark:bg-gray-600 rounded w-full"></div>
        <div className="h-4 bg-gray-300 dark:bg-gray-600 rounded w-3/4"></div>
        <div className="h-4 bg-gray-300 dark:bg-gray-600 rounded w-1/2"></div>
      </div>
    </div>

    {/* Recent Activity Skeleton */}
    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
      <div className="h-5 bg-gray-300 dark:bg-gray-600 rounded w-32 mb-4 animate-pulse"></div>
      <div className="space-y-4">
        <ActivityItemSkeleton />
        <ActivityItemSkeleton />
        <ActivityItemSkeleton />
      </div>
    </div>

    {/* Map Skeleton */}
    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
      <div className="h-5 bg-gray-300 dark:bg-gray-600 rounded w-48 mb-4 animate-pulse"></div>
      <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse flex items-center justify-center">
        <div className="text-gray-500 dark:text-gray-400">Loading map...</div>
      </div>
    </div>
  </div>
);

export default DashboardSkeleton;
