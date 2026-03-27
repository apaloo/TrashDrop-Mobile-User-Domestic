/**
 * Request Deduplication Utility
 * Prevents duplicate concurrent requests and improves performance
 * Uses Map-based caching with TTL for automatic cleanup
 */

class RequestDeduplicator {
  constructor() {
    this.requestCache = new Map();
    this.defaultTTL = 5000; // 5 seconds default TTL
    this.cleanupInterval = 10000; // Clean up every 10 seconds
    this.maxCacheSize = 100; // Maximum number of cached requests
    
    // Start automatic cleanup
    this.startCleanup();
  }

  /**
   * Generate a unique key for a request
   * @param {string} method - Request method/function name
   * @param {Array} args - Arguments array
   * @returns {string} Unique cache key
   */
  generateKey(method, args) {
    const argsStr = JSON.stringify(args);
    return `${method}:${argsStr}`;
  }

  /**
   * Execute a request with deduplication
   * @param {string} method - Request method identifier
   * @param {Array} args - Arguments for the request
   * @param {Function} requestFn - The request function to execute
   * @param {number} ttl - Time to live for cache (optional)
   * @returns {Promise} Request result
   */
  async deduplicate(method, args, requestFn, ttl = this.defaultTTL) {
    const key = this.generateKey(method, args);
    
    // Check if we have a cached request in progress
    const cached = this.requestCache.get(key);
    if (cached && cached.promise && !cached.completed) {
      console.log(`[RequestDeduplicator] 🔄 Reusing existing request for ${method}`);
      return cached.promise;
    }

    // Check if we have a recent completed result
    if (cached && cached.completed && (Date.now() - cached.timestamp < ttl)) {
      console.log(`[RequestDeduplicator] ⚡ Using cached result for ${method} (${Math.round((Date.now() - cached.timestamp)/1000)}s old)`);
      return cached.result;
    }

    // Create new request
    console.log(`[RequestDeduplicator] 🚀 Creating new request for ${method}`);
    const promise = requestFn();
    
    // Cache the request
    const cacheEntry = {
      promise,
      timestamp: Date.now(),
      completed: false,
      result: null,
      ttl,
      method,
      args
    };
    
    this.requestCache.set(key, cacheEntry);
    
    try {
      const result = await promise;
      
      // Update cache with successful result
      cacheEntry.completed = true;
      cacheEntry.result = result;
      cacheEntry.completedAt = Date.now();
      
      console.log(`[RequestDeduplicator] ✅ Request completed for ${method}`);
      
      return result;
    } catch (error) {
      // Remove failed request from cache
      this.requestCache.delete(key);
      console.error(`[RequestDeduplicator] ❌ Request failed for ${method}:`, error);
      throw error;
    }
  }

  /**
   * Clear cache for a specific method or all methods
   * @param {string} method - Method to clear (optional, clears all if not provided)
   */
  clearCache(method = null) {
    if (method) {
      // Clear specific method
      const keysToDelete = [];
      for (const [key, entry] of this.requestCache) {
        if (entry.method === method) {
          keysToDelete.push(key);
        }
      }
      keysToDelete.forEach(key => this.requestCache.delete(key));
      console.log(`[RequestDeduplicator] 🧹 Cleared cache for method: ${method} (${keysToDelete.length} entries)`);
    } else {
      // Clear all cache
      const size = this.requestCache.size;
      this.requestCache.clear();
      console.log(`[RequestDeduplicator] 🧹 Cleared all cache (${size} entries)`);
    }
  }

  /**
   * Start automatic cleanup of expired entries
   */
  startCleanup() {
    setInterval(() => {
      this.cleanup();
    }, this.cleanupInterval);
  }

  /**
   * Clean up expired cache entries
   */
  cleanup() {
    const now = Date.now();
    const keysToDelete = [];
    
    for (const [key, entry] of this.requestCache) {
      const age = now - entry.timestamp;
      const completedAge = entry.completedAt ? now - entry.completedAt : Infinity;
      
      // Remove if:
      // 1. Entry is older than TTL and completed
      // 2. Entry is older than 2x TTL and still pending (stuck)
      // 3. Cache is too large
      if ((entry.completed && completedAge > entry.ttl) ||
          (!entry.completed && age > entry.ttl * 2) ||
          this.requestCache.size > this.maxCacheSize) {
        keysToDelete.push(key);
      }
    }
    
    keysToDelete.forEach(key => this.requestCache.delete(key));
    
    if (keysToDelete.length > 0) {
      console.log(`[RequestDeduplicator] 🧹 Cleaned up ${keysToDelete.length} expired cache entries`);
    }
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  getStats() {
    const now = Date.now();
    let pending = 0;
    let completed = 0;
    let expired = 0;
    let totalSize = this.requestCache.size;
    
    for (const [key, entry] of this.requestCache) {
      const age = now - entry.timestamp;
      const completedAge = entry.completedAt ? now - entry.completedAt : Infinity;
      
      if (!entry.completed) {
        pending++;
      } else if (completedAge > entry.ttl) {
        expired++;
      } else {
        completed++;
      }
    }
    
    return {
      totalEntries: totalSize,
      pendingRequests: pending,
      completedRequests: completed,
      expiredEntries: expired,
      hitRate: completed / (totalSize || 1),
      memoryUsage: totalSize * 1024, // Estimated
      maxCacheSize: this.maxCacheSize,
      defaultTTL: this.defaultTTL
    };
  }

  /**
   * Check if a request is cached
   * @param {string} method - Request method
   * @param {Array} args - Arguments
   * @returns {boolean} Whether request is cached
   */
  isCached(method, args) {
    const key = this.generateKey(method, args);
    const cached = this.requestCache.get(key);
    
    if (!cached) return false;
    
    const now = Date.now();
    const completedAge = cached.completedAt ? now - cached.completedAt : Infinity;
    
    return cached.completed && completedAge < cached.ttl;
  }

  /**
   * Force refresh a cached request
   * @param {string} method - Request method
   * @param {Array} args - Arguments
   */
  forceRefresh(method, args) {
    const key = this.generateKey(method, args);
    this.requestCache.delete(key);
    console.log(`[RequestDeduplicator] 🔄 Forced refresh for ${method}`);
  }
}

// Create singleton instance
const requestDeduplicator = new RequestDeduplicator();

// Convenience wrapper for common dashboard requests
export const deduplicatedRequests = {
  /**
   * Deduplicated user stats request
   * @param {string} userId - User ID
   * @param {Function} requestFn - Request function
   * @returns {Promise} User stats
   */
  async getUserStats(userId, requestFn) {
    return requestDeduplicator.deduplicate('getUserStats', [userId], requestFn, 30000); // 30s cache
  },

  /**
   * Deduplicated recent activity request
   * @param {string} userId - User ID
   * @param {number} limit - Activity limit
   * @param {Function} requestFn - Request function
   * @returns {Promise} Recent activities
   */
  async getRecentActivity(userId, limit, requestFn) {
    return requestDeduplicator.deduplicate('getRecentActivity', [userId, limit], requestFn, 15000); // 15s cache
  },

  /**
   * Deduplicated active pickup request
   * @param {string} userId - User ID
   * @param {Function} requestFn - Request function
   * @returns {Promise} Active pickup
   */
  async getActivePickup(userId, requestFn) {
    return requestDeduplicator.deduplicate('getActivePickup', [userId], requestFn, 10000); // 10s cache
  },

  /**
   * Deduplicated notifications request
   * @param {string} userId - User ID
   * @param {Function} requestFn - Request function
   * @returns {Promise} Notifications
   */
  async getNotifications(userId, requestFn) {
    return requestDeduplicator.deduplicate('getNotifications', [userId], requestFn, 20000); // 20s cache
  }
};

export default requestDeduplicator;

// Development utilities
if (process.env.NODE_ENV === 'development') {
  // Expose to window for debugging
  window.requestDeduplicator = requestDeduplicator;
  window.deduplicatedRequests = deduplicatedRequests;
  
  // Add performance monitoring
  window.getDeduplicationStats = () => {
    console.log('[RequestDeduplicator] Stats:', requestDeduplicator.getStats());
    return requestDeduplicator.getStats();
  };
  
  window.clearDeduplicationCache = (method) => {
    requestDeduplicator.clearCache(method);
  };
}
