import React, { useState, useCallback } from 'react';
import { 
  cacheUserStats, 
  getCachedUserStats, 
  cacheUserActivity, 
  getCachedUserActivity,
  isOnline 
} from '../utils/offlineStorage.js';
import performanceMonitor from '../utils/performanceMonitor.js';

/**
 * Development component for testing performance optimizations
 * Only renders in development mode
 */
const PerformanceTester = ({ userId = 'test-user' }) => {
  const [testResults, setTestResults] = useState([]);
  const [isRunning, setIsRunning] = useState(false);

  const runTest = useCallback(async (testName, testFunction) => {
    setIsRunning(true);
    
    try {
      performanceMonitor.startTimer(testName);
      const startMemory = performance.memory ? performance.memory.usedJSHeapSize : 0;
      const startTime = Date.now();
      
      const result = await testFunction();
      
      const endTime = Date.now();
      const endMemory = performance.memory ? performance.memory.usedJSHeapSize : 0;
      const duration = performanceMonitor.endTimer(testName);
      
      const testResult = {
        name: testName,
        duration: duration || (endTime - startTime),
        memoryDelta: endMemory - startMemory,
        success: true,
        result,
        timestamp: new Date().toLocaleTimeString()
      };
      
      setTestResults(prev => [...prev, testResult]);
      return testResult;
    } catch (error) {
      const testResult = {
        name: testName,
        duration: 0,
        memoryDelta: 0,
        success: false,
        error: error.message,
        timestamp: new Date().toLocaleTimeString()
      };
      
      setTestResults(prev => [...prev, testResult]);
      return testResult;
    } finally {
      setIsRunning(false);
    }
  }, []);

  const testCacheOperations = useCallback(async () => {
    const testData = {
      points: 150,
      pickups: 8,
      reports: 12,
      batches: 3,
      totalBags: 15
    };

    // Test cache write
    await runTest('Cache Write (Stats)', async () => {
      await cacheUserStats(userId, testData);
      return testData;
    });

    // Test cache read
    await runTest('Cache Read (Stats)', async () => {
      const cached = await getCachedUserStats(userId);
      return cached;
    });

    // Test activity cache
    const activityData = Array.from({ length: 10 }, (_, i) => ({
      id: `activity-${i}`,
      type: i % 2 === 0 ? 'pickup' : 'report',
      details: `Test activity ${i}`,
      created_at: new Date().toISOString(),
      points: Math.floor(Math.random() * 50)
    }));

    await runTest('Cache Write (Activity)', async () => {
      await cacheUserActivity(userId, activityData);
      return activityData.length;
    });

    await runTest('Cache Read (Activity)', async () => {
      const cached = await getCachedUserActivity(userId, 10);
      return cached.length;
    });
  }, [userId, runTest]);

  const testCalculationPerformance = useCallback(async () => {
    const stats = { batches: 15, pickups: 23, points: 1234 };
    
    // Test without memoization
    await runTest('Calculations (No Memo)', async () => {
      const iterations = 1000;
      let sum = 0;
      for (let i = 0; i < iterations; i++) {
        sum += Math.floor(stats.batches / 2) + 1;
        sum += Math.floor(stats.pickups / 5) + 1;
        sum += Math.floor(stats.points / 100) + 1;
        sum += (stats.batches % 2) * 50;
        sum += (stats.pickups % 5) * 20;
        sum += stats.points % 100;
      }
      return iterations;
    });

    // Test with memoization simulation
    await runTest('Calculations (Memoized)', async () => {
      // Simulate memoized calculations
      const memoized = {
        batchLevel: Math.floor(stats.batches / 2) + 1,
        pickupLevel: Math.floor(stats.pickups / 5) + 1,
        pointsLevel: Math.floor(stats.points / 100) + 1,
        batchProgress: (stats.batches % 2) * 50,
        pickupProgress: (stats.pickups % 5) * 20,
        pointsProgress: stats.points % 100,
      };
      
      const iterations = 1000;
      let sum = 0;
      for (let i = 0; i < iterations; i++) {
        // Just access the memoized values
        const { batchLevel, pickupLevel, pointsLevel } = memoized;
        sum += batchLevel + pickupLevel + pointsLevel;
      }
      return iterations;
    });
  }, [runTest]);

  const testNetworkVsCache = useCallback(async () => {
    // Simulate network delay
    const simulateNetworkDelay = (ms = 500) => 
      new Promise(resolve => setTimeout(resolve, ms));

    await runTest('Network Request (Simulated)', async () => {
      await simulateNetworkDelay(500);
      return 'Network data';
    });

    await runTest('Cache Access', async () => {
      const cached = await getCachedUserStats(userId);
      return cached ? 'Cached data' : 'No cache';
    });
  }, [userId, runTest]);

  const runAllTests = useCallback(async () => {
    setTestResults([]);
    console.log('🧪 Starting performance tests...');
    
    await testCacheOperations();
    await testCalculationPerformance();
    await testNetworkVsCache();
    
    console.log('✅ Performance tests completed');
  }, [testCacheOperations, testCalculationPerformance, testNetworkVsCache]);

  const clearResults = useCallback(() => {
    setTestResults([]);
  }, []);

  const getResultColor = (result) => {
    if (!result.success) return 'text-red-600';
    if (result.duration < 10) return 'text-green-600';
    if (result.duration < 50) return 'text-yellow-600';
    return 'text-orange-600';
  };

  // Only show in development
  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  return (
    <div className="fixed top-4 left-4 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg p-4 text-xs max-w-md z-50 max-h-96 overflow-y-auto">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-gray-800 dark:text-white">Performance Tests</h3>
        <div className="flex gap-1">
          <button
            onClick={runAllTests}
            disabled={isRunning}
            className="px-2 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600 disabled:opacity-50"
          >
            {isRunning ? 'Running...' : 'Run Tests'}
          </button>
          <button
            onClick={clearResults}
            className="px-2 py-1 bg-gray-500 text-white rounded text-xs hover:bg-gray-600"
          >
            Clear
          </button>
        </div>
      </div>

      <div className="space-y-1 max-h-72 overflow-y-auto">
        {testResults.map((result, index) => (
          <div
            key={index}
            className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-700 rounded"
          >
            <div className="flex-1">
              <div className={`font-medium ${getResultColor(result)}`}>
                {result.name}
              </div>
              <div className="text-gray-500 dark:text-gray-400">
                {result.timestamp}
              </div>
            </div>
            <div className="text-right">
              {result.success ? (
                <>
                  <div className={`font-mono ${getResultColor(result)}`}>
                    {result.duration.toFixed(2)}ms
                  </div>
                  {result.memoryDelta !== 0 && (
                    <div className="text-gray-400 text-xs">
                      {(result.memoryDelta / 1024).toFixed(1)}KB
                    </div>
                  )}
                </>
              ) : (
                <div className="text-red-500 text-xs">
                  Error
                </div>
              )}
            </div>
          </div>
        ))}
        
        {testResults.length === 0 && (
          <div className="text-center text-gray-500 dark:text-gray-400 py-4">
            No test results yet. Click "Run Tests" to start.
          </div>
        )}
      </div>

      <div className="mt-3 pt-2 border-t border-gray-200 dark:border-gray-600">
        <div className="text-xs text-gray-500 dark:text-gray-400">
          Online: {isOnline() ? '🟢' : '🔴'} | 
          Cache: {typeof indexedDB !== 'undefined' ? '✅' : '❌'}
        </div>
      </div>
    </div>
  );
};

export default PerformanceTester;
