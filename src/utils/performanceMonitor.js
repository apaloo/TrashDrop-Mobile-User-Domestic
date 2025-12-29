/**
 * Performance monitoring utility for TrashDrops app
 * Tracks key metrics and helps identify bottlenecks
 */

class PerformanceMonitor {
  constructor() {
    this.metrics = new Map();
    this.isEnabled = process.env.NODE_ENV === 'development';
  }

  // Start timing an operation
  startTimer(name) {
    if (!this.isEnabled) return;
    
    this.metrics.set(name, {
      startTime: performance.now(),
      name
    });
  }

  // End timing and log the result
  endTimer(name) {
    if (!this.isEnabled) return;
    
    const metric = this.metrics.get(name);
    if (!metric) {
      console.warn(`No timer found for: ${name}`);
      return;
    }

    const duration = performance.now() - metric.startTime;
    console.log(`🚀 Performance: ${name} took ${duration.toFixed(2)}ms`);
    
    // Track slow operations
    if (duration > 1000) {
      console.warn(`⚠️ Slow operation detected: ${name} took ${duration.toFixed(2)}ms`);
    }
    
    this.metrics.delete(name);
    return duration;
  }

  // Measure React component render time
  measureComponent(componentName, renderFunction) {
    if (!this.isEnabled) return renderFunction();
    
    this.startTimer(`${componentName} render`);
    const result = renderFunction();
    this.endTimer(`${componentName} render`);
    
    return result;
  }

  // Measure async operations
  async measureAsync(name, asyncFunction) {
    if (!this.isEnabled) return asyncFunction();
    
    this.startTimer(name);
    try {
      const result = await asyncFunction();
      this.endTimer(name);
      return result;
    } catch (error) {
      this.endTimer(name);
      throw error;
    }
  }

  // Log memory usage
  logMemoryUsage(context = '') {
    if (!this.isEnabled || !performance.memory) return;
    
    const memory = performance.memory;
    console.log(`📊 Memory Usage ${context}:`, {
      used: `${(memory.usedJSHeapSize / 1024 / 1024).toFixed(2)} MB`,
      total: `${(memory.totalJSHeapSize / 1024 / 1024).toFixed(2)} MB`,
      limit: `${(memory.jsHeapSizeLimit / 1024 / 1024).toFixed(2)} MB`
    });
  }

  // Measure bundle load time
  measureBundleLoad() {
    if (!this.isEnabled) return;
    
    window.addEventListener('load', () => {
      const navigation = performance.getEntriesByType('navigation')[0];
      if (navigation) {
        console.log('📦 Bundle Load Performance:', {
          'DNS Lookup': `${navigation.domainLookupEnd - navigation.domainLookupStart}ms`,
          'Connection': `${navigation.connectEnd - navigation.connectStart}ms`,
          'Request/Response': `${navigation.responseEnd - navigation.requestStart}ms`,
          'DOM Processing': `${navigation.loadEventEnd - navigation.responseEnd}ms`,
          'Total Load Time': `${navigation.loadEventEnd - navigation.navigationStart}ms`
        });
      }
    });
  }

  // Track database operations
  measureDBOperation(operation, tableName) {
    if (!this.isEnabled) return operation;
    
    const operationName = `DB: ${tableName}`;
    this.startTimer(operationName);
    
    if (operation && typeof operation.then === 'function') {
      return operation.finally(() => {
        this.endTimer(operationName);
      });
    } else {
      this.endTimer(operationName);
      return operation;
    }
  }

  // Clear all metrics
  clear() {
    this.metrics.clear();
  }

  // Get all active timers
  getActiveTimers() {
    return Array.from(this.metrics.keys());
  }
}

// Create singleton instance
const performanceMonitor = new PerformanceMonitor();

// Initialize bundle load monitoring
performanceMonitor.measureBundleLoad();

export default performanceMonitor;
