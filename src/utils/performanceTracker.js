/**
 * Performance Tracker
 * 
 * A utility for tracking key performance metrics in the app,
 * especially focused on startup time, screen transitions,
 * and authentication flow timing.
 */

// Capture navigation timing data
const captureNavigationTiming = () => {
  try {
    if (!window.performance || !window.performance.timing) {
      return { error: 'Navigation Timing API not supported' };
    }

    const timing = window.performance.timing;
    const navigationStart = timing.navigationStart;

    return {
      // Total page load time
      totalLoadTime: timing.loadEventEnd - navigationStart,
      
      // DNS lookup time
      dnsLookup: timing.domainLookupEnd - timing.domainLookupStart,
      
      // Connection time
      connection: timing.connectEnd - timing.connectStart,
      
      // Server response time
      serverResponse: timing.responseEnd - timing.requestStart,
      
      // DOM processing time
      domProcessing: timing.domComplete - timing.domLoading,
      
      // DOM content loaded
      domContentLoaded: timing.domContentLoadedEventEnd - navigationStart
    };
  } catch (error) {
    console.error('[PerformanceTracker] Error capturing navigation timing:', error);
    return { error: error.message };
  }
};

// Performance marks for tracking app-specific events
const marks = {};

// Determine if we should track performance details
const shouldTrackPerformance = () => {
  return process.env.NODE_ENV === 'development' || 
         window.location.search.includes('perf=true');
};

// Start timing for an event
const startMark = (name) => {
  try {
    if (!name) return;
    marks[name] = {
      start: performance.now(),
      name
    };
  } catch (error) {
    if (shouldTrackPerformance()) {
      console.error(`[PerformanceTracker] Error starting mark "${name}":`, error);
    }
  }
};

// End timing for an event and return the duration
const endMark = (name) => {
  try {
    if (!marks[name]) {
      console.warn(`[PerformanceTracker] No start mark found for "${name}"`);
      return null;
    }
    
    const end = performance.now();
    const duration = end - marks[name].start;
    
    // Store the result
    marks[name].end = end;
    marks[name].duration = duration;
    
    // Log only in development or when performance tracking is explicitly enabled
    if (shouldTrackPerformance()) {
      console.log(`[PerformanceTracker] ${name}: ${duration.toFixed(2)}ms`);
    }
    
    return duration;
  } catch (error) {
    console.error(`[PerformanceTracker] Error ending mark "${name}":`, error);
    return null;
  }
};

// Get all performance marks
const getMarks = () => {
  return { ...marks };
};

// Track a specific screen transition
const trackScreenTransition = (fromScreen, toScreen) => {
  const markName = `screen_transition_${fromScreen}_to_${toScreen}`;
  startMark(markName);
  
  // Use requestAnimationFrame to ensure we capture the time after the screen has rendered
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      endMark(markName);
    });
  });
};

// Track authentication flow steps
const trackAuth = {
  startLogin: () => startMark('auth_login'),
  endLogin: () => endMark('auth_login'),
  startValidation: () => startMark('auth_validation'),
  endValidation: () => endMark('auth_validation'),
  startLogout: () => startMark('auth_logout'),
  endLogout: () => endMark('auth_logout')
};

// Track app startup phases
const trackStartup = {
  splashScreen: () => startMark('startup_splash'),
  splashToContent: () => endMark('startup_splash'),
  appInitialization: () => startMark('startup_initialization'),
  appInitialized: () => endMark('startup_initialization'),
  firstContentfulPaint: () => {
    // Record when meaningful content is first displayed
    if (!marks['startup_first_contentful_paint']) {
      startMark('startup_first_contentful_paint');
      endMark('startup_first_contentful_paint');
    }
  }
};

// Report critical metrics to analytics (mock implementation)
const reportMetrics = (metrics) => {
  // This would typically send data to an analytics service
  if (shouldTrackPerformance()) {
    console.log('[PerformanceTracker] Reporting metrics:', metrics);
  }
  
  // Always send to analytics service if available, regardless of environment
  if (window.analyticsService && typeof window.analyticsService.trackPerformance === 'function') {
    window.analyticsService.trackPerformance(metrics);
  }
};

// Automatically track initial page load
if (typeof window !== 'undefined' && window.performance) {
  window.addEventListener('load', () => {
    setTimeout(() => {
      const metrics = captureNavigationTiming();
      // Only log in development
      if (shouldTrackPerformance()) {
        console.log('[PerformanceTracker] Initial page load metrics:', metrics);
      }
      
      // Always report to analytics
      reportMetrics({
        type: 'initial_load',
        data: metrics
      });
    }, 0);
  });
}

export default {
  startMark,
  endMark,
  getMarks,
  trackScreenTransition,
  trackAuth,
  trackStartup,
  captureNavigationTiming,
  reportMetrics
};
