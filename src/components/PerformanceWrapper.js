import React, { memo, Profiler } from 'react';
import performanceMonitor from '../utils/performanceMonitor.js';

/**
 * Wrapper component for performance monitoring
 * Tracks render times and re-renders in development mode
 */
const PerformanceWrapper = memo(({ 
  children, 
  name, 
  enableProfiling = process.env.NODE_ENV === 'development' 
}) => {
  // Profiler callback to log render performance
  const onRenderCallback = (id, phase, actualDuration, baseDuration, startTime, commitTime) => {
    if (!enableProfiling) return;
    
    console.log(`🔍 Profiler: ${id}`, {
      phase,
      actualDuration: `${actualDuration.toFixed(2)}ms`,
      baseDuration: `${baseDuration.toFixed(2)}ms`,
      startTime: `${startTime.toFixed(2)}ms`,
      commitTime: `${commitTime.toFixed(2)}ms`
    });
    
    // Log slow renders
    if (actualDuration > 16) { // 16ms is one frame at 60fps
      console.warn(`🐌 Slow render detected in ${id}: ${actualDuration.toFixed(2)}ms`);
    }
  };

  if (enableProfiling && name) {
    return (
      <Profiler id={name} onRender={onRenderCallback}>
        {children}
      </Profiler>
    );
  }

  return children;
});

PerformanceWrapper.displayName = 'PerformanceWrapper';

/**
 * Higher-order component for automatic performance monitoring
 */
export const withPerformanceMonitoring = (WrappedComponent, componentName) => {
  const MonitoredComponent = memo((props) => {
    return (
      <PerformanceWrapper name={componentName || WrappedComponent.displayName || WrappedComponent.name}>
        <WrappedComponent {...props} />
      </PerformanceWrapper>
    );
  });
  
  MonitoredComponent.displayName = `withPerformanceMonitoring(${componentName || WrappedComponent.displayName || WrappedComponent.name})`;
  
  return MonitoredComponent;
};

/**
 * Hook for tracking component lifecycle performance
 */
export const usePerformanceTracker = (componentName) => {
  const renderCountRef = React.useRef(0);
  const lastRenderTimeRef = React.useRef(null);
  
  React.useEffect(() => {
    renderCountRef.current += 1;
    const now = Date.now();
    
    if (process.env.NODE_ENV === 'development') {
      if (lastRenderTimeRef.current) {
        const timeSinceLastRender = now - lastRenderTimeRef.current;
        if (timeSinceLastRender < 100) { // Less than 100ms between renders
          console.warn(`⚡ Fast re-render detected in ${componentName}: ${timeSinceLastRender}ms since last render (render #${renderCountRef.current})`);
        }
      }
      
      if (renderCountRef.current > 10) {
        console.warn(`🔄 High render count in ${componentName}: ${renderCountRef.current} renders`);
      }
    }
    
    lastRenderTimeRef.current = now;
  });
  
  return {
    renderCount: renderCountRef.current,
    resetCounter: () => {
      renderCountRef.current = 0;
      lastRenderTimeRef.current = null;
    }
  };
};

export default PerformanceWrapper;
