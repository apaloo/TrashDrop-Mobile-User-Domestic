import React, { useEffect } from 'react';

/**
 * Component specifically for optimizing Dashboard performance
 * Implements techniques to improve Largest Contentful Paint (LCP)
 */
const DashboardOptimizer = () => {
  useEffect(() => {
    // Run in both development and production for testing
    // Enable console logs in development to help debug performance

    // Eagerly render stats cards with inline critical CSS
    const injectCriticalStyles = () => {
      const criticalStyles = `
        .dashboard-card {
          content-visibility: auto;
          contain-intrinsic-size: 280px 200px;
        }
        .activity-card {
          content-visibility: auto;
          contain-intrinsic-size: auto 400px;
        }
      `;
      const styleTag = document.createElement('style');
      styleTag.textContent = criticalStyles;
      document.head.appendChild(styleTag);
      
      // Add display: block to ensure proper rendering before styles load
      document.querySelectorAll('.dashboard-card').forEach(card => {
        card.style.display = 'block';
      });
    };
    
    // Apply inline styles immediately
    injectCriticalStyles();
    
    // Optimize the critical DOM elements in the Dashboard that affect LCP
    const optimizeDashboard = () => {
      // Apply priority to stats cards which are likely the LCP elements
      const statsCards = document.querySelectorAll('.dashboard-card, [class*="from-emerald-700"], [class*="from-teal-600"], [class*="from-amber-700"]');
      statsCards.forEach(card => {
        if ('fetchPriority' in card) {
          card.fetchPriority = 'high';
        }
        
        // Add prerender attribute to critical cards
        card.setAttribute('importance', 'high');
        
        // Ensure critical elements have high loading priority
        const svgs = card.querySelectorAll('svg');
        svgs.forEach(svg => {
          if ('fetchPriority' in svg) {
            svg.fetchPriority = 'high';
          }
          svg.setAttribute('importance', 'high');
        });
      });

      // Optimize action buttons - second most important content
      const actionButtons = document.querySelectorAll('button.w-full');
      actionButtons.forEach(button => {
        if ('fetchPriority' in button) {
          button.fetchPriority = 'high';
        }
      });
      
      // Defer non-critical elements (like the activity section)
      const activitySection = document.querySelector('[class*="from-purple-800"]');
      if (activitySection) {
        activitySection.setAttribute('loading', 'lazy');
        const activityItems = activitySection.querySelectorAll('[class*="bg-purple-900"]');
        activityItems.forEach(item => {
          item.setAttribute('loading', 'lazy');
        });
      }
    };

    // Use requestIdleCallback to optimize when browser is idle
    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => {
        optimizeDashboard();
      });
    } else {
      // Fallback for browsers without requestIdleCallback
      setTimeout(optimizeDashboard, 200);
    }

    // Apply preconnect and preload for critical domains and resources
    const addPreconnect = (domain) => {
      const link = document.createElement('link');
      link.rel = 'preconnect';
      link.href = domain;
      link.crossOrigin = 'anonymous';
      document.head.appendChild(link);
    };
    
    const preloadAsset = (href, as) => {
      const link = document.createElement('link');
      link.rel = 'preload';
      link.href = href;
      link.as = as;
      if (as === 'font') {
        link.crossOrigin = 'anonymous';
      }
      document.head.appendChild(link);
    };

    // Preconnect to Supabase - critical for data fetching
    if (window.SUPABASE_URL) {
      addPreconnect(window.SUPABASE_URL);
    }
    
    // Preconnect to font providers if any
    addPreconnect('https://fonts.gstatic.com');
    
    // Find and preload the most important assets
    const criticalImages = document.querySelectorAll('.dashboard-card svg');
    criticalImages.forEach(svg => {
      // Can't directly preload inline SVG, but we can optimize their rendering
      svg.style.willChange = 'transform';
      svg.style.transform = 'translateZ(0)';
    });
    
    // Preload any critical CSS files
    const stylesheets = Array.from(document.styleSheets);
    stylesheets.forEach(stylesheet => {
      try {
        if (stylesheet.href && !stylesheet.href.includes('chrome-extension')) {
          preloadAsset(stylesheet.href, 'style');
        }
      } catch (e) {
        // Ignore cross-origin stylesheet errors
      }
    });
    
    // Measure and report LCP for debugging
    if (process.env.NODE_ENV !== 'production' && 'PerformanceObserver' in window) {
      try {
        const lcpObserver = new PerformanceObserver((entryList) => {
          const entries = entryList.getEntries();
          const lcpEntry = entries[entries.length - 1];
          console.log(`[DashboardOptimizer] LCP: ${lcpEntry.startTime.toFixed(1)}ms`, lcpEntry);
          
          // Log LCP element for debugging
          const lcpElement = lcpEntry.element;
          if (lcpElement) {
            console.log('[DashboardOptimizer] LCP Element:', lcpElement);
          }
        });
        lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
      } catch (e) {
        console.warn('[DashboardOptimizer] LCP observation error:', e);
      }
    }

    // Clean up function
    return () => {
      // Nothing to clean up
    };
  }, []);

  return null; // This component doesn't render anything
};

export default DashboardOptimizer;
