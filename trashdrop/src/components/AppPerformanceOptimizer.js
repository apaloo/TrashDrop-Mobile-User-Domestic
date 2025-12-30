import React, { useEffect } from 'react';

/**
 * Component for optimizing app performance, particularly LCP (Largest Contentful Paint)
 * Implements best practices for web performance
 */
const AppPerformanceOptimizer = () => {
  useEffect(() => {
    // Only run optimizations in production
    if (process.env.NODE_ENV !== 'production') return;

    // Preload critical assets that might impact LCP
    const preloadCriticalAssets = () => {
      // List of critical stylesheets, images, or other assets needed for LCP
      const criticalAssets = [
        // Add paths to critical assets here, such as:
        // '/static/images/logo.png',
        // '/static/css/critical.css',
      ];

      criticalAssets.forEach(asset => {
        const link = document.createElement('link');
        link.rel = 'preload';
        
        // Determine correct as attribute based on file extension
        if (asset.endsWith('.css')) {
          link.as = 'style';
        } else if (asset.endsWith('.js')) {
          link.as = 'script';
        } else if (['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'].some(ext => asset.endsWith(ext))) {
          link.as = 'image';
        } else if (['.woff', '.woff2', '.ttf', '.otf'].some(ext => asset.endsWith(ext))) {
          link.as = 'font';
          link.crossOrigin = 'anonymous';
        }
        
        link.href = asset;
        document.head.appendChild(link);
      });
    };

    // Apply priority hints to LCP elements
    const applyPriorityHints = () => {
      // Dashboard cards and other large visible elements
      const lcpElements = document.querySelectorAll('.dashboard-card, .stats-card, .activity-card');
      lcpElements.forEach(element => {
        if ('fetchPriority' in element) {
          element.fetchPriority = 'high';
        }
      });

      // Dashboard hero images or icons if present
      const heroImages = document.querySelectorAll('.hero-image, .dashboard-hero img');
      heroImages.forEach(img => {
        if ('fetchPriority' in img) {
          img.fetchPriority = 'high';
        }
        img.loading = 'eager'; // Force eager loading for above-the-fold images
      });
    };

    // Optimize image loading and decoding
    const optimizeImages = () => {
      // All non-critical images should use lazy loading
      const nonCriticalImages = document.querySelectorAll('img:not(.hero-image):not(.dashboard-hero img)');
      nonCriticalImages.forEach(img => {
        img.loading = 'lazy';
        img.decoding = 'async';
      });
    };

    // Optimize CSS by removing unused styles after initial render
    const optimizeCss = () => {
      // Wait for LCP to complete before removing unused CSS
      // This ensures critical path rendering is not affected
      const lcpObserver = new PerformanceObserver(entryList => {
        const entries = entryList.getEntries();
        if (entries.length > 0) {
          const lcpTime = entries[0].startTime;
          
          // After LCP, we can remove unused CSS
          if (lcpTime && lcpTime < 5000) { // If LCP happened within reasonable time
            // This would be where we'd implement dynamic CSS cleanup
            // For now we just log that LCP completed
            console.log(`[Performance] LCP completed at ${lcpTime}ms`);
          }
        }
      });
      
      try {
        // Start observing LCP events
        lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
      } catch (e) {
        console.warn('[Performance] LCP observation not supported', e);
      }
    };

    // Implementing requestIdleCallback for non-critical operations
    const scheduleNonCriticalOperations = () => {
      const idleCallback = window.requestIdleCallback || ((cb) => setTimeout(cb, 1));
      idleCallback(() => {
        // Non-critical operations go here
        optimizeImages();
        optimizeCss();
      });
    };

    // Execute optimizations
    preloadCriticalAssets();
    
    // Schedule priority hints for after first paint
    setTimeout(applyPriorityHints, 0);
    
    // Schedule non-critical operations
    scheduleNonCriticalOperations();

    return () => {
      // Clean up any observers if component unmounts
      try {
        const observers = PerformanceObserver.supportedEntryTypes || [];
        if (observers.includes('largest-contentful-paint')) {
          // Disconnect any performance observers
          PerformanceObserver.disconnect();
        }
      } catch (e) {
        // Ignore cleanup errors
      }
    };
  }, []);

  return null; // This is a utility component with no UI
};

export default AppPerformanceOptimizer;
