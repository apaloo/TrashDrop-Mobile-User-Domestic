import React, { useEffect, useState } from 'react';
import performanceTracker from '../utils/performanceTracker';

/**
 * Performance monitoring component for development use
 * Shows app performance metrics in a collapsible panel
 */
const PerformanceMonitor = ({ visible = false }) => {
  const [isVisible, setIsVisible] = useState(visible);
  const [metrics, setMetrics] = useState({});
  const [marks, setMarks] = useState({});
  const [navigationTiming, setNavigationTiming] = useState({});
  
  useEffect(() => {
    // Only collect metrics in development mode
    if (process.env.NODE_ENV !== 'development') return;
    
    const updateMetrics = () => {
      setMarks(performanceTracker.getMarks());
      setNavigationTiming(performanceTracker.captureNavigationTiming());
    };
    
    // Update immediately
    updateMetrics();
    
    // Update periodically
    const intervalId = setInterval(updateMetrics, 2000);
    
    return () => clearInterval(intervalId);
  }, []);
  
  if (!isVisible || process.env.NODE_ENV !== 'development') return null;
  
  return (
    <div className="fixed bottom-0 right-0 z-50 w-96 max-w-full bg-white dark:bg-gray-800 shadow-lg border border-gray-200 dark:border-gray-700 rounded-tl-lg overflow-hidden">
      <div 
        className="flex items-center justify-between bg-primary text-white p-2 cursor-pointer"
        onClick={() => setIsVisible(false)}
      >
        <h3 className="text-sm font-semibold">Performance Monitor</h3>
        <button className="text-xs bg-white bg-opacity-20 px-2 py-1 rounded">Close</button>
      </div>
      
      <div className="p-3 text-sm overflow-auto max-h-96">
        <div className="mb-4">
          <h4 className="text-gray-700 dark:text-gray-300 font-medium mb-1">App Startup</h4>
          <div className="grid grid-cols-2 gap-1">
            {marks['startup_splash'] && (
              <div className="flex justify-between bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                <span>Splash Screen:</span>
                <span className="font-mono">{marks['startup_splash'].duration?.toFixed(2)}ms</span>
              </div>
            )}
            {marks['startup_initialization'] && (
              <div className="flex justify-between bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                <span>App Init:</span>
                <span className="font-mono">{marks['startup_initialization'].duration?.toFixed(2)}ms</span>
              </div>
            )}
            {marks['startup_first_contentful_paint'] && (
              <div className="flex justify-between bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                <span>First Content:</span>
                <span className="font-mono">{marks['startup_first_contentful_paint'].duration?.toFixed(2)}ms</span>
              </div>
            )}
          </div>
        </div>
        
        <div className="mb-4">
          <h4 className="text-gray-700 dark:text-gray-300 font-medium mb-1">Authentication</h4>
          <div className="grid grid-cols-2 gap-1">
            {marks['auth_login'] && (
              <div className="flex justify-between bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                <span>Login:</span>
                <span className="font-mono">{marks['auth_login'].duration?.toFixed(2)}ms</span>
              </div>
            )}
            {marks['auth_validation'] && (
              <div className="flex justify-between bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                <span>Validation:</span>
                <span className="font-mono">{marks['auth_validation'].duration?.toFixed(2)}ms</span>
              </div>
            )}
            {marks['auth_logout'] && (
              <div className="flex justify-between bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                <span>Logout:</span>
                <span className="font-mono">{marks['auth_logout'].duration?.toFixed(2)}ms</span>
              </div>
            )}
          </div>
        </div>
        
        <div className="mb-4">
          <h4 className="text-gray-700 dark:text-gray-300 font-medium mb-1">Navigation Timing</h4>
          <div className="grid grid-cols-2 gap-1">
            {Object.entries(navigationTiming).filter(([key]) => key !== 'error').map(([key, value]) => (
              <div key={key} className="flex justify-between bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                <span>{key}:</span>
                <span className="font-mono">{value?.toFixed(2)}ms</span>
              </div>
            ))}
          </div>
        </div>
        
        <div className="mb-4">
          <h4 className="text-gray-700 dark:text-gray-300 font-medium mb-1">Screen Transitions</h4>
          <div className="grid grid-cols-2 gap-1">
            {Object.entries(marks)
              .filter(([key]) => key.startsWith('screen_transition_'))
              .map(([key, value]) => (
                <div key={key} className="flex justify-between bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                  <span>{key.replace('screen_transition_', '')}:</span>
                  <span className="font-mono">{value.duration?.toFixed(2)}ms</span>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PerformanceMonitor;
