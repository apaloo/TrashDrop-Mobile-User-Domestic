import React, { createContext, useContext, useEffect, useState } from 'react';
import performanceMonitor from '../utils/performanceMonitor.js';

/**
 * App-level performance monitoring and optimization provider
 */
const PerformanceContext = createContext(null);

export const usePerformance = () => {
  const context = useContext(PerformanceContext);
  if (!context) {
    throw new Error('usePerformance must be used within AppPerformanceProvider');
  }
  return context;
};

export const AppPerformanceProvider = ({ children }) => {
  const [performanceMetrics, setPerformanceMetrics] = useState({
    pageLoadTime: null,
    timeToInteractive: null,
    largestContentfulPaint: null,
    cumulativeLayoutShift: null,
    firstInputDelay: null
  });
  const [isSlowDevice, setIsSlowDevice] = useState(false);
  const [connectionType, setConnectionType] = useState('unknown');

  // Detect device performance capabilities
  useEffect(() => {
    const detectDevicePerformance = () => {
      // Check CPU cores
      const cores = navigator.hardwareConcurrency || 1;
      
      // Check memory (if available)
      const memory = navigator.deviceMemory || 1;
      
      // Simple performance test
      const start = performance.now();
      let sum = 0;
      for (let i = 0; i < 100000; i++) {
        sum += Math.random();
      }
      const testDuration = performance.now() - start;
      
      // Determine if device is slow
      const slow = cores < 4 || memory < 2 || testDuration > 50;
      setIsSlowDevice(slow);
      
      if (slow) {
        console.warn('🐌 Slow device detected, enabling performance optimizations');
      }
    };

    detectDevicePerformance();
  }, []);

  // Monitor network connection
  useEffect(() => {
    const updateConnectionInfo = () => {
      if ('connection' in navigator) {
        const connection = navigator.connection;
        setConnectionType(connection.effectiveType || 'unknown');
        
        if (connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g') {
          console.warn('📡 Slow connection detected, enabling data-saving optimizations');
        }
      }
    };

    updateConnectionInfo();
    
    if ('connection' in navigator) {
      navigator.connection.addEventListener('change', updateConnectionInfo);
      return () => {
        navigator.connection.removeEventListener('change', updateConnectionInfo);
      };
    }
  }, []);

  // Collect Web Vitals
  useEffect(() => {
    const collectWebVitals = () => {
      // Largest Contentful Paint
      if ('PerformanceObserver' in window) {
        try {
          const lcpObserver = new PerformanceObserver((entryList) => {
            const entries = entryList.getEntries();
            const lastEntry = entries[entries.length - 1];
            setPerformanceMetrics(prev => ({
              ...prev,
              largestContentfulPaint: lastEntry.startTime
            }));
          });
          lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });

          // Cumulative Layout Shift
          const clsObserver = new PerformanceObserver((entryList) => {
            let clsValue = 0;
            for (const entry of entryList.getEntries()) {
              if (!entry.hadRecentInput) {
                clsValue += entry.value;
              }
            }
            setPerformanceMetrics(prev => ({
              ...prev,
              cumulativeLayoutShift: clsValue
            }));
          });
          clsObserver.observe({ entryTypes: ['layout-shift'] });

          // First Input Delay
          const fidObserver = new PerformanceObserver((entryList) => {
            const firstEntry = entryList.getEntries()[0];
            setPerformanceMetrics(prev => ({
              ...prev,
              firstInputDelay: firstEntry.processingStart - firstEntry.startTime
            }));
          });
          fidObserver.observe({ entryTypes: ['first-input'] });

        } catch (error) {
          console.warn('Performance Observer not fully supported:', error);
        }
      }

      // Navigation timing
      window.addEventListener('load', () => {
        setTimeout(() => {
          const navigation = performance.getEntriesByType('navigation')[0];
          if (navigation) {
            setPerformanceMetrics(prev => ({
              ...prev,
              pageLoadTime: navigation.loadEventEnd - navigation.navigationStart,
              timeToInteractive: navigation.domInteractive - navigation.navigationStart
            }));
          }
        }, 0);
      });
    };

    collectWebVitals();
  }, []);

  // Log performance warnings
  useEffect(() => {
    const { largestContentfulPaint, cumulativeLayoutShift, firstInputDelay } = performanceMetrics;
    
    if (largestContentfulPaint && largestContentfulPaint > 2500) {
      console.warn(`🚨 Poor LCP: ${largestContentfulPaint.toFixed(2)}ms (should be < 2500ms)`);
    }
    
    if (cumulativeLayoutShift && cumulativeLayoutShift > 0.1) {
      console.warn(`🚨 Poor CLS: ${cumulativeLayoutShift.toFixed(3)} (should be < 0.1)`);
    }
    
    if (firstInputDelay && firstInputDelay > 100) {
      console.warn(`🚨 Poor FID: ${firstInputDelay.toFixed(2)}ms (should be < 100ms)`);
    }
  }, [performanceMetrics]);

  // Auto-optimize based on device/connection
  useEffect(() => {
    if (isSlowDevice || connectionType === '2g' || connectionType === 'slow-2g') {
      // Disable non-essential animations
      document.documentElement.style.setProperty('--animation-duration', '0s');
      
      // Reduce image quality for slow connections
      if (connectionType === '2g' || connectionType === 'slow-2g') {
        document.documentElement.classList.add('low-bandwidth');
      }
    }
  }, [isSlowDevice, connectionType]);

  const value = {
    performanceMetrics,
    isSlowDevice,
    connectionType,
    // Utility functions
    measureOperation: performanceMonitor.measureAsync,
    startTimer: performanceMonitor.startTimer,
    endTimer: performanceMonitor.endTimer,
    logMemoryUsage: performanceMonitor.logMemoryUsage,
    
    // Optimization hints
    shouldPreloadImages: !isSlowDevice && connectionType !== '2g' && connectionType !== 'slow-2g',
    shouldUseHeavyAnimations: !isSlowDevice,
    shouldLazyLoadImages: isSlowDevice || connectionType === '2g' || connectionType === 'slow-2g',
    maxConcurrentRequests: isSlowDevice ? 2 : 6,
    
    // Performance scores (0-100)
    getPerformanceScore: () => {
      const { largestContentfulPaint, cumulativeLayoutShift, firstInputDelay } = performanceMetrics;
      let score = 100;
      
      // LCP scoring
      if (largestContentfulPaint) {
        if (largestContentfulPaint > 4000) score -= 30;
        else if (largestContentfulPaint > 2500) score -= 15;
      }
      
      // CLS scoring
      if (cumulativeLayoutShift) {
        if (cumulativeLayoutShift > 0.25) score -= 25;
        else if (cumulativeLayoutShift > 0.1) score -= 10;
      }
      
      // FID scoring
      if (firstInputDelay) {
        if (firstInputDelay > 300) score -= 25;
        else if (firstInputDelay > 100) score -= 10;
      }
      
      return Math.max(0, score);
    }
  };

  return (
    <PerformanceContext.Provider value={value}>
      {children}
    </PerformanceContext.Provider>
  );
};

export default AppPerformanceProvider;
