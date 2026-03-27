/**
 * Seamless Background Caching Utility
 * Prevents data disappearing during fetches by maintaining current UI state
 * while updating data in the background
 */

class SeamlessCache {
  constructor(options = {}) {
    this.cache = new Map();
    this.updateQueue = new Map();
    this.subscribers = new Map();
    this.updateInProgress = new Set();
    
    this.options = {
      defaultTTL: 30000, // 30 seconds
      backgroundUpdateDelay: 100, // 100ms delay to avoid flicker
      staleWhileRevalidate: true,
      ...options
    };
  }

  /**
   * Get cached data with seamless background update
   * @param {string} key - Cache key
   * @param {Function} fetchFn - Function to fetch fresh data
   * @param {Object} options - Cache options
   * @returns {Promise} Cached data (immediate) and updates in background
   */
  async get(key, fetchFn, options = {}) {
    const opts = { ...this.options, ...options };
    const cached = this.cache.get(key);
    const now = Date.now();
    
    // Return cached data immediately if available
    if (cached && cached.data && (now - cached.timestamp) < opts.ttl) {
      console.log(`[SeamlessCache] 📋 Using fresh cache for ${key}`);
      
      // Start background update if getting stale
      if (opts.staleWhileRevalidate && (now - cached.timestamp) > opts.ttl * 0.8) {
        this.backgroundUpdate(key, fetchFn, opts);
      }
      
      return cached.data;
    }

    // If we have any cached data (even stale), return it immediately
    if (cached && cached.data) {
      console.log(`[SeamlessCache] 🔄 Using stale cache for ${key}, updating in background`);
      this.backgroundUpdate(key, fetchFn, opts);
      return cached.data;
    }

    // No cache available, fetch with loading state
    console.log(`[SeamlessCache] ⏳ No cache for ${key}, fetching fresh data`);
    return this.freshFetch(key, fetchFn, opts);
  }

  /**
   * Perform background update without affecting UI
   * @param {string} key - Cache key
   * @param {Function} fetchFn - Function to fetch fresh data
   * @param {Object} options - Cache options
   */
  async backgroundUpdate(key, fetchFn, options) {
    if (this.updateInProgress.has(key)) {
      console.log(`[SeamlessCache] ⏸️ Update already in progress for ${key}`);
      return;
    }

    this.updateInProgress.add(key);
    
    try {
      // Add small delay to prevent rapid updates
      await new Promise(resolve => setTimeout(resolve, options.backgroundUpdateDelay));
      
      console.log(`[SeamlessCache] 🔄 Background updating ${key}`);
      const freshData = await fetchFn();
      
      // Cache the fresh data
      this.cache.set(key, {
        data: freshData,
        timestamp: Date.now(),
        ttl: options.ttl
      });

      // Notify subscribers of background update
      this.notifySubscribers(key, freshData, 'background');
      
      console.log(`[SeamlessCache] ✅ Background update complete for ${key}`);
      
    } catch (error) {
      console.error(`[SeamlessCache] ❌ Background update failed for ${key}:`, error);
      // Don't update cache on error, keep existing data
    } finally {
      this.updateInProgress.delete(key);
    }
  }

  /**
   * Fresh fetch when no cache exists
   * @param {string} key - Cache key
   * @param {Function} fetchFn - Function to fetch fresh data
   * @param {Object} options - Cache options
   */
  async freshFetch(key, fetchFn, options) {
    try {
      console.log(`[SeamlessCache] 🔍 Fresh fetching ${key}`);
      const data = await fetchFn();
      
      // Cache the data
      this.cache.set(key, {
        data,
        timestamp: Date.now(),
        ttl: options.ttl
      });

      // Notify subscribers
      this.notifySubscribers(key, data, 'fresh');
      
      return data;
      
    } catch (error) {
      console.error(`[SeamlessCache] ❌ Fresh fetch failed for ${key}:`, error);
      throw error;
    }
  }

  /**
   * Optimistic update - update UI immediately, confirm with server later
   * @param {string} key - Cache key
   * @param {Function} updateFn - Function to apply optimistic update
   * @param {Function} confirmFn - Function to confirm with server
   */
  async optimisticUpdate(key, updateFn, confirmFn) {
    const current = this.cache.get(key)?.data;
    if (!current) {
      console.warn(`[SeamlessCache] ⚠️ No current data for optimistic update ${key}`);
      return current;
    }

    // Apply optimistic update immediately
    const optimisticData = updateFn(current);
    
    // Update cache with optimistic data
    this.cache.set(key, {
      data: optimisticData,
      timestamp: Date.now(),
      ttl: this.options.defaultTTL,
      optimistic: true
    });

    // Notify subscribers of optimistic update
    this.notifySubscribers(key, optimisticData, 'optimistic');

    // Confirm with server in background
    try {
      console.log(`[SeamlessCache] 🔄 Confirming optimistic update for ${key}`);
      const confirmedData = await confirmFn();
      
      // Update cache with confirmed data
      this.cache.set(key, {
        data: confirmedData,
        timestamp: Date.now(),
        ttl: this.options.defaultTTL,
        optimistic: false
      });

      // Notify subscribers of confirmation
      this.notifySubscribers(key, confirmedData, 'confirmed');
      
      return confirmedData;
      
    } catch (error) {
      console.error(`[SeamlessCache] ❌ Optimistic update failed for ${key}:`, error);
      
      // Rollback to original data
      this.cache.set(key, {
        data: current,
        timestamp: Date.now(),
        ttl: this.options.defaultTTL,
        optimistic: false
      });

      // Notify subscribers of rollback
      this.notifySubscribers(key, current, 'rollback');
      
      throw error;
    }
  }

  /**
   * Subscribe to data updates
   * @param {string} key - Cache key
   * @param {Function} callback - Update callback
   * @returns {Function} Unsubscribe function
   */
  subscribe(key, callback) {
    if (!this.subscribers.has(key)) {
      this.subscribers.set(key, new Set());
    }
    
    this.subscribers.get(key).add(callback);
    
    // Return unsubscribe function
    return () => {
      const subs = this.subscribers.get(key);
      if (subs) {
        subs.delete(callback);
        if (subs.size === 0) {
          this.subscribers.delete(key);
        }
      }
    };
  }

  /**
   * Notify all subscribers of data changes
   * @param {string} key - Cache key
   * @param {*} data - New data
   * @param {string} type - Update type (background, fresh, optimistic, confirmed, rollback)
   */
  notifySubscribers(key, data, type) {
    const subs = this.subscribers.get(key);
    if (subs) {
      subs.forEach(callback => {
        try {
          callback(data, type);
        } catch (error) {
          console.error(`[SeamlessCache] ❌ Subscriber callback error for ${key}:`, error);
        }
      });
    }
  }

  /**
   * Preload data in background
   * @param {string} key - Cache key
   * @param {Function} fetchFn - Function to fetch data
   * @param {Object} options - Cache options
   */
  async preload(key, fetchFn, options = {}) {
    if (this.cache.has(key)) {
      console.log(`[SeamlessCache] 📋 Data already cached for ${key}, skipping preload`);
      return;
    }

    // Use requestIdleCallback for non-blocking preload
    const preloadFn = async () => {
      try {
        console.log(`[SeamlessCache] 🚀 Preloading ${key}`);
        const data = await fetchFn();
        
        this.cache.set(key, {
          data,
          timestamp: Date.now(),
          ttl: options.ttl || this.options.defaultTTL,
          preloaded: true
        });
        
        console.log(`[SeamlessCache] ✅ Preload complete for ${key}`);
      } catch (error) {
        console.error(`[SeamlessCache] ❌ Preload failed for ${key}:`, error);
      }
    };

    if ('requestIdleCallback' in window) {
      requestIdleCallback(preloadFn);
    } else {
      setTimeout(preloadFn, 100);
    }
  }

  /**
   * Invalidate cache entry
   * @param {string} key - Cache key
   */
  invalidate(key) {
    console.log(`[SeamlessCache] 🗑️ Invalidating cache for ${key}`);
    this.cache.delete(key);
    this.updateInProgress.delete(key);
  }

  /**
   * Clear all cache
   */
  clear() {
    console.log(`[SeamlessCache] 🧹 Clearing all cache`);
    this.cache.clear();
    this.updateInProgress.clear();
    this.subscribers.clear();
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache stats
   */
  getStats() {
    const now = Date.now();
    let freshCount = 0;
    let staleCount = 0;
    
    this.cache.forEach((cached) => {
      if ((now - cached.timestamp) < this.options.defaultTTL) {
        freshCount++;
      } else {
        staleCount++;
      }
    });

    return {
      totalEntries: this.cache.size,
      freshEntries: freshCount,
      staleEntries: staleCount,
      updatesInProgress: this.updateInProgress.size,
      subscriberCount: Array.from(this.subscribers.values()).reduce((sum, subs) => sum + subs.size, 0)
    };
  }

  /**
   * Check if cache entry exists and is fresh
   * @param {string} key - Cache key
   * @returns {boolean} Whether cache is fresh
   */
  isFresh(key) {
    const cached = this.cache.get(key);
    if (!cached) return false;
    
    return (Date.now() - cached.timestamp) < this.options.defaultTTL;
  }

  /**
   * Get cached data without triggering updates
   * @param {string} key - Cache key
   * @returns {*} Cached data or undefined
   */
  peek(key) {
    return this.cache.get(key)?.data;
  }
}

// Create singleton instance
const seamlessCache = new SeamlessCache({
  defaultTTL: 30000, // 30 seconds
  backgroundUpdateDelay: 150, // 150ms delay
  staleWhileRevalidate: true
});

export default seamlessCache;
export { SeamlessCache };
