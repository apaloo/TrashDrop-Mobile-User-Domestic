# Performance Monitoring Guide

## Overview
The TrashDrop app now includes a comprehensive performance monitoring system that helps identify bottlenecks, track app startup time, and measure authentication flow performance. This system is especially valuable for diagnosing and resolving issues like screen transitions and splash screen delays.

## Key Features

### 1. Performance Metrics Tracked
- **Splash Screen Time**: How long the splash screen is displayed
- **App Initialization**: Time to initialize the core app components
- **Authentication Flow**: Login, validation, and session refresh timing
- **Screen Transitions**: Time to navigate between different screens
- **First Contentful Paint**: When meaningful content first appears

### 2. Development Tools
- **Performance Monitor Panel**: Real-time metrics display (dev mode only)
- **Console Logging**: Detailed timing logs in the browser console
- **Navigation Timing**: Browser performance API metrics

## How to Use

### Viewing Performance Metrics
In development mode, a floating performance button appears in the bottom-right corner of the screen:

1. Click the button to toggle the performance monitor panel
2. View real-time metrics for:
   - App startup phases
   - Authentication timing
   - Screen transitions
   - Navigation timing metrics

### Interpreting the Results

#### Splash Screen Metrics
- **Splash Screen**: Time from app start until splash screen disappears
- **Target**: < 500ms for returning users, < 1500ms for new users

#### Authentication Metrics
- **Login**: Time from credentials submission to authentication complete
- **Validation**: Time to validate existing credentials
- **Target**: Login < 2000ms, Validation < 1000ms

#### Screen Transitions
- **Format**: `screen_transition_[from]_to_[to]`
- **Target**: < 300ms for transitions

## Implementation Details

### 1. Performance Tracker Utility
The `performanceTracker.js` utility provides methods for:
- Starting/ending timing measurements
- Tracking specific app events
- Capturing navigation timing
- Reporting metrics

```javascript
// Example usage
import performanceTracker from './utils/performanceTracker';

// Start timing
performanceTracker.startMark('my_operation');

// End timing and get duration
const duration = performanceTracker.endMark('my_operation');

// Track auth flow
performanceTracker.trackAuth.startLogin();
// ... authentication logic ...
performanceTracker.trackAuth.endLogin();
```

### 2. Integration Points

The performance tracking is integrated at key points:

- **Splash Screen**: In `public/index.html`
  ```javascript
  // Start splash screen timing
  window.performanceTracker.trackStartup.splashScreen();
  
  // End splash screen timing when hidden
  window.performanceTracker.trackStartup.splashToContent();
  ```

- **App Initialization**: In `App.js` (AppContent component)
  ```javascript
  useEffect(() => {
    performanceTracker.trackStartup.appInitialization();
    
    return () => {
      performanceTracker.trackStartup.appInitialized();
    };
  }, []);
  ```

- **Screen Transitions**: In `App.js`
  ```javascript
  useEffect(() => {
    const currentPath = location.pathname;
    const pathSegment = currentPath.split('/')[1] || 'root';
    
    performanceTracker.trackScreenTransition('previous', pathSegment);
  }, [location.pathname]);
  ```

### 3. Performance Monitor Component
The `PerformanceMonitor.js` component provides a UI for:
- Displaying current performance metrics
- Showing historical timing data
- Tracking real-time updates

## Best Practices

1. **Key Areas to Monitor**:
   - Initial app load time
   - Authentication flow speed
   - Transitions between main screens

2. **Performance Targets**:
   - App Initialization: < 2000ms
   - Screen Transitions: < 300ms
   - Authentication: < 1500ms
   - Total Startup (Cold): < 3000ms
   - Total Startup (Warm): < 1000ms

3. **Improving Performance**:
   - Reduce unnecessary re-renders
   - Optimize authentication checks
   - Use lazy loading for non-critical components
   - Minimize API calls during startup

## Troubleshooting

If you encounter performance issues:

1. Use the performance monitor to identify slow operations
2. Check console for detailed timing logs
3. Look for operations taking > 500ms
4. Optimize critical startup path components

## Conclusion

The performance monitoring system provides valuable insights into app performance, helping to maintain a smooth and responsive user experience. By tracking key metrics and setting performance targets, we can ensure the app remains fast and responsive across all devices and network conditions.
