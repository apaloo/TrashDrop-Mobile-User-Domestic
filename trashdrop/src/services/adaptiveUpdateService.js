/**
 * Adaptive Update Service - Connection-aware real-time updates
 * Adjusts update frequency and timeout based on network quality
 */

/**
 * Network quality configurations
 */
export const NETWORK_STRATEGIES = {
  '4g': {
    name: '4g',
    interval: 5000, // 5 seconds
    timeout: 3000,  // 3 seconds
    retryAttempts: 3,
    retryDelay: 1000,
    batchSize: 10,
    enableRealtime: true,
    quality: 'excellent'
  },
  '3g': {
    name: '3g',
    interval: 10000, // 10 seconds
    timeout: 5000,   // 5 seconds
    retryAttempts: 3,
    retryDelay: 2000,
    batchSize: 5,
    enableRealtime: true,
    quality: 'good'
  },
  '2g': {
    name: '2g',
    interval: 30000, // 30 seconds
    timeout: 10000,  // 10 seconds
    retryAttempts: 2,
    retryDelay: 5000,
    batchSize: 3,
    enableRealtime: false,
    quality: 'fair'
  },
  'slow-2g': {
    name: 'slow-2g',
    interval: 60000, // 60 seconds
    timeout: 15000,  // 15 seconds
    retryAttempts: 1,
    retryDelay: 10000,
    batchSize: 1,
    enableRealtime: false,
    quality: 'poor'
  },
  'offline': {
    name: 'offline',
    interval: 0,     // No updates
    timeout: 0,
    retryAttempts: 0,
    retryDelay: 0,
    batchSize: 0,
    enableRealtime: false,
    quality: 'offline'
  }
};

/**
 * Adaptive Update Service
 */
export const adaptiveUpdateService = {
  currentStrategy: null,
  networkMonitor: null,
  subscriptions: new Map(),
  updateQueue: [],
  isOnline: navigator.onLine,

  /**
   * Initialize adaptive update service
   */
  initialize() {
    console.log('[AdaptiveUpdateService] Initializing adaptive update service');
    
    // Set initial strategy
    this.updateStrategy();
    
    // Monitor network changes
    this.setupNetworkMonitoring();
    
    // Monitor online/offline status
    this.setupConnectivityMonitoring();
    
    return this.getCurrentStrategy();
  },

  /**
   * Get current network strategy
   * @returns {Object} Current network strategy
   */
  getCurrentStrategy() {
    if (!this.currentStrategy) {
      this.updateStrategy();
    }
    return this.currentStrategy;
  },

  /**
   * Update strategy based on current network conditions
   */
  updateStrategy() {
    const connection = this.getConnectionInfo();
    const effectiveType = connection?.effectiveType || '4g';
    const downlink = connection?.downlink;
    const rtt = connection?.rtt;
    
    // Determine strategy based on network quality
    let strategyName = effectiveType;
    
    // Adjust strategy based on additional metrics
    if (downlink && downlink < 0.1) {
      strategyName = 'slow-2g';
    } else if (rtt && rtt > 1000) {
      strategyName = '2g';
    }
    
    // Check if offline
    if (!this.isOnline) {
      strategyName = 'offline';
    }
    
    const newStrategy = NETWORK_STRATEGIES[strategyName] || NETWORK_STRATEGIES['3g'];
    
    // Only update if strategy changed
    if (!this.currentStrategy || this.currentStrategy.name !== newStrategy.name) {
      const oldStrategy = this.currentStrategy?.name || 'unknown';
      this.currentStrategy = newStrategy;
      
      console.log(`[AdaptiveUpdateService] Strategy changed: ${oldStrategy} → ${newStrategy.name}`);
      console.log(`[AdaptiveUpdateService] Update interval: ${newStrategy.interval}ms, Quality: ${newStrategy.quality}`);
      
      // Notify all subscriptions of strategy change
      this.notifyStrategyChange(oldStrategy, newStrategy);
    }
    
    return this.currentStrategy;
  },

  /**
   * Get connection information
   * @returns {Object} Connection information
   */
  getConnectionInfo() {
    // Get connection API if available
    const connection = navigator.connection || 
                      navigator.mozConnection || 
                      navigator.webkitConnection;
    
    if (connection) {
      return {
        effectiveType: connection.effectiveType,
        downlink: connection.downlink,
        rtt: connection.rtt,
        saveData: connection.saveData
      };
    }
    
    // Fallback: estimate based on performance
    return this.estimateConnectionQuality();
  },

  /**
   * Estimate connection quality based on performance
   * @returns {Object} Estimated connection info
   */
  estimateConnectionQuality() {
    // Simple estimation based on navigator.connection if not available
    // This is a basic fallback - in production, you'd want more sophisticated detection
    const start = performance.now();
    
    return {
      effectiveType: '4g', // Assume good connection as fallback
      downlink: 10,
      rtt: 50,
      saveData: false,
      estimated: true
    };
  },

  /**
   * Set up network monitoring
   */
  setupNetworkMonitoring() {
    const connection = this.getConnectionInfo();
    
    if (connection && connection.addEventListener) {
      connection.addEventListener('change', () => {
        console.log('[AdaptiveUpdateService] Network conditions changed');
        this.updateStrategy();
      });
    }
  },

  /**
   * Set up connectivity monitoring
   */
  setupConnectivityMonitoring() {
    window.addEventListener('online', () => {
      console.log('[AdaptiveUpdateService] Connection restored');
      this.isOnline = true;
      this.updateStrategy();
      this.processQueuedUpdates();
    });

    window.addEventListener('offline', () => {
      console.log('[AdaptiveUpdateService] Connection lost');
      this.isOnline = false;
      this.updateStrategy();
    });
  },

  /**
   * Create adaptive subscription
   * @param {string} id - Subscription ID
   * @param {Function} updateFunction - Update function to call
   * @param {Object} options - Subscription options
   * @returns {Object} Subscription controller
   */
  createSubscription(id, updateFunction, options = {}) {
    const strategy = this.getCurrentStrategy();
    
    const subscription = {
      id,
      updateFunction,
      options: {
        priority: 'normal', // 'high', 'normal', 'low'
        batchable: true,
        ...options
      },
      interval: null,
      isActive: true,
      lastUpdate: 0,
      retryCount: 0,
      strategy
    };

    this.subscriptions.set(id, subscription);
    
    // Start updates if online
    if (this.isOnline && strategy.interval > 0) {
      this.startUpdates(id);
    }

    return {
      id,
      update: () => this.triggerUpdate(id),
      pause: () => this.pauseSubscription(id),
      resume: () => this.resumeSubscription(id),
      cancel: () => this.cancelSubscription(id),
      getStrategy: () => this.getCurrentStrategy()
    };
  },

  /**
   * Start updates for a subscription
   * @param {string} id - Subscription ID
   */
  startUpdates(id) {
    const subscription = this.subscriptions.get(id);
    if (!subscription || !subscription.isActive) return;

    const strategy = this.getCurrentStrategy();
    
    // Clear existing interval
    if (subscription.interval) {
      clearInterval(subscription.interval);
    }

    // Set new interval based on strategy
    if (strategy.interval > 0) {
      subscription.interval = setInterval(() => {
        this.triggerUpdate(id);
      }, strategy.interval);
      
      console.log(`[AdaptiveUpdateService] Started updates for ${id} (${strategy.interval}ms interval)`);
    }
  },

  /**
   * Trigger update for subscription
   * @param {string} id - Subscription ID
   */
  async triggerUpdate(id) {
    const subscription = this.subscriptions.get(id);
    if (!subscription || !subscription.isActive) return;

    const strategy = this.getCurrentStrategy();
    const now = Date.now();
    
    // Throttle updates based on strategy
    if (now - subscription.lastUpdate < strategy.interval) {
      return;
    }

    try {
      console.log(`[AdaptiveUpdateService] Triggering update for ${id} (${strategy.quality})`);
      
      // Create timeout promise
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Update timeout')), strategy.timeout);
      });

      // Execute update with timeout
      await Promise.race([
        subscription.updateFunction(),
        timeoutPromise
      ]);

      // Update successful
      subscription.lastUpdate = now;
      subscription.retryCount = 0;
      
    } catch (error) {
      console.error(`[AdaptiveUpdateService] Update failed for ${id}:`, error.message);
      
      // Retry logic
      if (subscription.retryCount < strategy.retryAttempts) {
        subscription.retryCount++;
        
        console.log(`[AdaptiveUpdateService] Retrying ${id} (${subscription.retryCount}/${strategy.retryAttempts})`);
        
        setTimeout(() => {
          this.triggerUpdate(id);
        }, strategy.retryDelay);
      } else {
        console.error(`[AdaptiveUpdateService] Max retries exceeded for ${id}`);
        
        // Could implement fallback behavior here
        if (subscription.options.onMaxRetries) {
          subscription.options.onMaxRetries(error);
        }
      }
    }
  },

  /**
   * Pause subscription
   * @param {string} id - Subscription ID
   */
  pauseSubscription(id) {
    const subscription = this.subscriptions.get(id);
    if (!subscription) return;

    subscription.isActive = false;
    
    if (subscription.interval) {
      clearInterval(subscription.interval);
      subscription.interval = null;
    }
    
    console.log(`[AdaptiveUpdateService] Paused subscription ${id}`);
  },

  /**
   * Resume subscription
   * @param {string} id - Subscription ID
   */
  resumeSubscription(id) {
    const subscription = this.subscriptions.get(id);
    if (!subscription) return;

    subscription.isActive = true;
    
    if (this.isOnline) {
      this.startUpdates(id);
    }
    
    console.log(`[AdaptiveUpdateService] Resumed subscription ${id}`);
  },

  /**
   * Cancel subscription
   * @param {string} id - Subscription ID
   */
  cancelSubscription(id) {
    const subscription = this.subscriptions.get(id);
    if (!subscription) return;

    this.pauseSubscription(id);
    this.subscriptions.delete(id);
    
    console.log(`[AdaptiveUpdateService] Cancelled subscription ${id}`);
  },

  /**
   * Notify subscriptions of strategy change
   * @param {string} oldStrategy - Old strategy name
   * @param {Object} newStrategy - New strategy object
   */
  notifyStrategyChange(oldStrategy, newStrategy) {
    this.subscriptions.forEach((subscription, id) => {
      if (!subscription.isActive) return;

      // Restart updates with new strategy
      if (subscription.interval) {
        clearInterval(subscription.interval);
      }
      
      if (this.isOnline && newStrategy.interval > 0) {
        this.startUpdates(id);
      } else if (newStrategy.interval === 0) {
        console.log(`[AdaptiveUpdateService] Pausing ${id} due to network quality`);
      }

      // Call strategy change callback if provided
      if (subscription.options.onStrategyChange) {
        subscription.options.onStrategyChange(oldStrategy, newStrategy);
      }
    });
  },

  /**
   * Queue update for when offline
   * @param {string} subscriptionId - Subscription ID
   * @param {Object} updateData - Update data
   */
  queueUpdate(subscriptionId, updateData) {
    this.updateQueue.push({
      subscriptionId,
      data: updateData,
      timestamp: Date.now()
    });
    
    console.log(`[AdaptiveUpdateService] Queued update for ${subscriptionId}`);
  },

  /**
   * Process queued updates when coming back online
   */
  processQueuedUpdates() {
    if (this.updateQueue.length === 0) return;

    console.log(`[AdaptiveUpdateService] Processing ${this.updateQueue.length} queued updates`);
    
    const strategy = this.getCurrentStrategy();
    const batchSize = strategy.batchSize;
    
    // Process updates in batches
    const batch = this.updateQueue.splice(0, batchSize);
    
    batch.forEach(({ subscriptionId, data }) => {
      const subscription = this.subscriptions.get(subscriptionId);
      if (subscription && subscription.isActive) {
        try {
          subscription.updateFunction(data);
        } catch (error) {
          console.error(`[AdaptiveUpdateService] Failed to process queued update for ${subscriptionId}:`, error);
        }
      }
    });

    // Continue processing if more items remain
    if (this.updateQueue.length > 0) {
      setTimeout(() => this.processQueuedUpdates(), strategy.retryDelay);
    }
  },

  /**
   * Get service statistics
   * @returns {Object} Service statistics
   */
  getStats() {
    return {
      currentStrategy: this.getCurrentStrategy(),
      isOnline: this.isOnline,
      activeSubscriptions: this.subscriptions.size,
      queuedUpdates: this.updateQueue.length,
      subscriptions: Array.from(this.subscriptions.values()).map(sub => ({
        id: sub.id,
        isActive: sub.isActive,
        lastUpdate: sub.lastUpdate,
        retryCount: sub.retryCount
      }))
    };
  },

  /**
   * Cleanup all subscriptions
   */
  cleanup() {
    console.log('[AdaptiveUpdateService] Cleaning up all subscriptions');
    
    this.subscriptions.forEach((subscription, id) => {
      this.cancelSubscription(id);
    });
    
    this.updateQueue = [];
    this.currentStrategy = null;
  }
};

export default adaptiveUpdateService;
