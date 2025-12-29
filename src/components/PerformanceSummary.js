import React from 'react';
import { usePerformance } from './AppPerformanceProvider.js';

/**
 * Development-only component to show performance metrics
 * Only renders in development mode
 */
const PerformanceSummary = () => {
  const {
    performanceMetrics,
    isSlowDevice,
    connectionType,
    getPerformanceScore
  } = usePerformance();

  // Only show in development
  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  const score = getPerformanceScore();
  const getScoreColor = (score) => {
    if (score >= 90) return 'text-green-600';
    if (score >= 70) return 'text-yellow-600';
    return 'text-red-600';
  };

  const formatMs = (ms) => ms ? `${ms.toFixed(2)}ms` : 'N/A';
  const formatScore = (value) => value ? value.toFixed(3) : 'N/A';

  return (
    <div className="fixed bottom-4 right-4 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg p-4 text-xs max-w-sm z-50">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-bold text-gray-800 dark:text-white">Performance Metrics</h3>
        <div className={`font-bold ${getScoreColor(score)}`}>
          Score: {score}/100
        </div>
      </div>
      
      <div className="space-y-1">
        <div className="flex justify-between">
          <span className="text-gray-600 dark:text-gray-400">Page Load:</span>
          <span className="font-mono">{formatMs(performanceMetrics.pageLoadTime)}</span>
        </div>
        
        <div className="flex justify-between">
          <span className="text-gray-600 dark:text-gray-400">Time to Interactive:</span>
          <span className="font-mono">{formatMs(performanceMetrics.timeToInteractive)}</span>
        </div>
        
        <div className="flex justify-between">
          <span className="text-gray-600 dark:text-gray-400">LCP:</span>
          <span className={`font-mono ${performanceMetrics.largestContentfulPaint > 2500 ? 'text-red-500' : 'text-green-500'}`}>
            {formatMs(performanceMetrics.largestContentfulPaint)}
          </span>
        </div>
        
        <div className="flex justify-between">
          <span className="text-gray-600 dark:text-gray-400">CLS:</span>
          <span className={`font-mono ${performanceMetrics.cumulativeLayoutShift > 0.1 ? 'text-red-500' : 'text-green-500'}`}>
            {formatScore(performanceMetrics.cumulativeLayoutShift)}
          </span>
        </div>
        
        <div className="flex justify-between">
          <span className="text-gray-600 dark:text-gray-400">FID:</span>
          <span className={`font-mono ${performanceMetrics.firstInputDelay > 100 ? 'text-red-500' : 'text-green-500'}`}>
            {formatMs(performanceMetrics.firstInputDelay)}
          </span>
        </div>
        
        <hr className="my-2 border-gray-200 dark:border-gray-600" />
        
        <div className="flex justify-between">
          <span className="text-gray-600 dark:text-gray-400">Device:</span>
          <span className={`${isSlowDevice ? 'text-orange-500' : 'text-green-500'}`}>
            {isSlowDevice ? 'Slow' : 'Fast'}
          </span>
        </div>
        
        <div className="flex justify-between">
          <span className="text-gray-600 dark:text-gray-400">Connection:</span>
          <span className={`${connectionType === '2g' || connectionType === 'slow-2g' ? 'text-red-500' : 'text-green-500'}`}>
            {connectionType}
          </span>
        </div>
      </div>
      
      <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-600">
        <div className="text-xs text-gray-500 dark:text-gray-400">
          🚀 Dashboard optimizations active:
        </div>
        <ul className="text-xs text-green-600 dark:text-green-400 mt-1 space-y-1">
          <li>✅ IndexedDB caching</li>
          <li>✅ Skeleton loading</li>
          <li>✅ Memoized calculations</li>
          <li>✅ Parallel data fetching</li>
          <li>✅ Offline support</li>
          <li>✅ Service worker</li>
        </ul>
      </div>
    </div>
  );
};

export default PerformanceSummary;
