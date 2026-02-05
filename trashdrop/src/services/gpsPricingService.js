/**
 * GPS-based Pricing Service
 * Provides location-specific pricing for waste collection services
 * 
 * This service queries the pricing_zones table to find location-specific pricing.
 * Falls back to default BASE_COSTS if no zone is found within range.
 */

import supabase from '../utils/supabaseClient.js';

/**
 * Default fallback prices by bin size (in GHS)
 * Used when no GPS pricing zone is found
 */
const DEFAULT_PRICES = {
  50: 10,
  60: 15,
  80: 18,
  90: 22,
  100: 25,
  120: 30,
  240: 40,
  260: 50,
  320: 65,
  340: 55,
  360: 75,
  660: 100,
  1100: 150
};

/**
 * Maximum distance in km to search for a pricing zone
 */
const MAX_SEARCH_DISTANCE_KM = 10;

/**
 * RPC timeout in milliseconds (5 seconds for good UX)
 */
const RPC_TIMEOUT_MS = 5000;

/**
 * Maximum retries for transient failures
 */
const MAX_RETRIES = 2;

/**
 * Cache for pricing lookups to reduce database queries
 * Key: `${lat}_${lng}` (rounded to 4 decimal places)
 * Value: { zone, timestamp, isError }
 */
const pricingCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const ERROR_CACHE_TTL_MS = 30 * 1000; // 30 seconds for error states

/**
 * Circuit Breaker State
 * Prevents hammering a failing service
 */
const circuitBreaker = {
  failures: 0,
  lastFailure: null,
  isOpen: false,
  threshold: 3,           // Open after 3 consecutive failures
  resetTimeout: 60000     // Try again after 60 seconds
};

/**
 * Metrics for monitoring
 */
const metrics = {
  totalRequests: 0,
  cacheHits: 0,
  rpcCalls: 0,
  rpcSuccesses: 0,
  rpcFailures: 0,
  circuitBreakerTrips: 0,
  lastReset: Date.now()
};

/**
 * Check if circuit breaker allows requests
 */
const isCircuitClosed = () => {
  if (!circuitBreaker.isOpen) return true;
  
  // Check if enough time has passed to try again
  const timeSinceFailure = Date.now() - circuitBreaker.lastFailure;
  if (timeSinceFailure >= circuitBreaker.resetTimeout) {
    console.log('[GPSPricing] Circuit breaker half-open, allowing test request');
    return true; // Half-open state - allow one request through
  }
  
  return false;
};

/**
 * Record a successful RPC call (resets circuit breaker)
 */
const recordSuccess = () => {
  metrics.rpcSuccesses++;
  if (circuitBreaker.isOpen) {
    console.log('[GPSPricing] Circuit breaker closed after successful request');
  }
  circuitBreaker.failures = 0;
  circuitBreaker.isOpen = false;
  circuitBreaker.lastFailure = null;
};

/**
 * Record a failed RPC call (may trip circuit breaker)
 */
const recordFailure = () => {
  metrics.rpcFailures++;
  circuitBreaker.failures++;
  circuitBreaker.lastFailure = Date.now();
  
  if (circuitBreaker.failures >= circuitBreaker.threshold && !circuitBreaker.isOpen) {
    circuitBreaker.isOpen = true;
    metrics.circuitBreakerTrips++;
    console.warn(`[GPSPricing] Circuit breaker OPEN after ${circuitBreaker.failures} failures. Will retry in ${circuitBreaker.resetTimeout/1000}s`);
  }
};

/**
 * Generate cache key from coordinates
 */
const getCacheKey = (latitude, longitude) => {
  const lat = parseFloat(latitude).toFixed(4);
  const lng = parseFloat(longitude).toFixed(4);
  return `${lat}_${lng}`;
};

/**
 * Check if cached entry is still valid
 */
const isCacheValid = (cacheEntry) => {
  if (!cacheEntry) return false;
  const ttl = cacheEntry.isError ? ERROR_CACHE_TTL_MS : CACHE_TTL_MS;
  return (Date.now() - cacheEntry.timestamp) < ttl;
};

/**
 * Helper to create a timeout promise
 */
const withTimeout = (promise, timeoutMs, errorMessage = 'Operation timed out') => {
  return Promise.race([
    promise,
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
    )
  ]);
};

/**
 * Helper to retry an async operation
 */
const withRetry = async (operation, maxRetries = MAX_RETRIES, delayMs = 500) => {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        console.log(`[GPSPricing] Retry ${attempt + 1}/${maxRetries} after error:`, error.message);
        await new Promise(resolve => setTimeout(resolve, delayMs * (attempt + 1)));
      }
    }
  }
  throw lastError;
};

/**
 * Find the nearest pricing zone for given GPS coordinates
 * 
 * @param {number} latitude - GPS latitude
 * @param {number} longitude - GPS longitude
 * @param {number} maxDistanceKm - Maximum search distance (default: 10km)
 * @returns {Promise<Object|null>} Pricing zone data or null if not found
 */
export const findNearestPricingZone = async (latitude, longitude, maxDistanceKm = MAX_SEARCH_DISTANCE_KM) => {
  metrics.totalRequests++;
  
  // Validate coordinates
  if (!latitude || !longitude || isNaN(latitude) || isNaN(longitude)) {
    console.warn('[GPSPricing] Invalid coordinates:', { latitude, longitude });
    return null;
  }

  // Check cache first
  const cacheKey = getCacheKey(latitude, longitude);
  const cachedEntry = pricingCache.get(cacheKey);
  if (isCacheValid(cachedEntry)) {
    metrics.cacheHits++;
    console.log('[GPSPricing] Cache hit for:', cacheKey);
    return cachedEntry.zone;
  }

  // Check circuit breaker before making RPC call
  if (!isCircuitClosed()) {
    console.warn('[GPSPricing] Circuit breaker OPEN - skipping RPC call, using default pricing');
    return null; // Will trigger fallback to default pricing
  }

  try {
    metrics.rpcCalls++;
    console.log('[GPSPricing] Querying for nearest zone:', { latitude, longitude, maxDistanceKm });

    // Call the database function with timeout and retry
    const rpcOperation = async () => {
      const rpcPromise = supabase.rpc('find_nearest_pricing_zone', {
        p_latitude: latitude,
        p_longitude: longitude,
        p_max_distance_km: maxDistanceKm
      });
      
      // Apply timeout to prevent indefinite hanging
      const result = await withTimeout(
        rpcPromise,
        RPC_TIMEOUT_MS,
        'GPS pricing lookup timed out'
      );
      
      if (result.error) {
        throw new Error(result.error.message || 'Database error');
      }
      
      return result.data;
    };

    // Execute with retry logic for transient failures
    const data = await withRetry(rpcOperation);

    // Record success - resets circuit breaker
    recordSuccess();

    if (!data || data.length === 0) {
      console.log('[GPSPricing] No zone found within', maxDistanceKm, 'km');
      // Cache the null result to avoid repeated queries
      pricingCache.set(cacheKey, { zone: null, timestamp: Date.now(), isError: false });
      return null;
    }

    const zone = data[0];
    console.log('[GPSPricing] Found zone:', zone.suburb, 'at', zone.distance_km?.toFixed(2), 'km');

    // Cache the result
    pricingCache.set(cacheKey, { zone, timestamp: Date.now(), isError: false });

    return zone;
  } catch (error) {
    // Record failure - may trip circuit breaker
    recordFailure();
    console.error('[GPSPricing] Error finding pricing zone:', error.message);
    // Cache the error state briefly to prevent hammering on failures
    pricingCache.set(cacheKey, { zone: null, timestamp: Date.now(), isError: true });
    return null;
  }
};

/**
 * Get price for a specific bin size at a location
 * Falls back to default pricing if no zone is found
 * 
 * @param {number} latitude - GPS latitude
 * @param {number} longitude - GPS longitude
 * @param {number} binSize - Bin size in liters (50, 60, 80, 90, 100, 120, 240, 260, 320, 340, 360, 660, 1100)
 * @returns {Promise<Object>} Price info with source indicator
 */
export const getLocationPrice = async (latitude, longitude, binSize) => {
  // Validate bin size
  const validSizes = [50, 60, 80, 90, 100, 120, 240, 260, 320, 340, 360, 660, 1100];
  if (!validSizes.includes(binSize)) {
    console.warn('[GPSPricing] Invalid bin size:', binSize, '- using default 120L');
    binSize = 120;
  }

  // Try to find GPS-based pricing
  const zone = await findNearestPricingZone(latitude, longitude);

  if (zone) {
    // Map bin size to zone price column
    const priceKey = `price_${binSize}l`;
    const price = zone[priceKey];

    if (price !== undefined && price !== null) {
      return {
        price: parseFloat(price),
        source: 'gps',
        zone: {
          region: zone.region,
          district: zone.district,
          community: zone.community,
          suburb: zone.suburb,
          distance_km: zone.distance_km
        }
      };
    }
  }

  // Fallback to default pricing
  const defaultPrice = DEFAULT_PRICES[binSize] || DEFAULT_PRICES[120];
  return {
    price: defaultPrice,
    source: 'default',
    zone: null
  };
};

/**
 * Get all bin size prices for a location
 * Useful for displaying price options to user
 * 
 * @param {number} latitude - GPS latitude
 * @param {number} longitude - GPS longitude
 * @returns {Promise<Object>} All prices with source indicator
 */
export const getAllPricesForLocation = async (latitude, longitude) => {
  const zone = await findNearestPricingZone(latitude, longitude);

  const prices = {};
  const binSizes = [50, 60, 80, 90, 100, 120, 240, 260, 320, 340, 360, 660, 1100];

  if (zone) {
    binSizes.forEach(size => {
      const priceKey = `price_${size}l`;
      prices[size] = parseFloat(zone[priceKey]) || DEFAULT_PRICES[size];
    });

    return {
      prices,
      source: 'gps',
      zone: {
        region: zone.region,
        district: zone.district,
        community: zone.community,
        suburb: zone.suburb,
        distance_km: zone.distance_km
      }
    };
  }

  // Return default prices
  binSizes.forEach(size => {
    prices[size] = DEFAULT_PRICES[size];
  });

  return {
    prices,
    source: 'default',
    zone: null
  };
};

/**
 * Get base cost for cost calculator integration
 * This function is designed to be a drop-in replacement for the static BASE_COSTS lookup
 * 
 * @param {number} binSize - Bin size in liters
 * @param {number|null} latitude - Optional GPS latitude
 * @param {number|null} longitude - Optional GPS longitude
 * @returns {Promise<number>} Base cost in GHS
 */
export const getBaseCost = async (binSize, latitude = null, longitude = null) => {
  // If coordinates provided, try GPS-based pricing
  if (latitude !== null && longitude !== null) {
    const priceInfo = await getLocationPrice(latitude, longitude, binSize);
    console.log('[GPSPricing] Base cost for', binSize, 'L:', priceInfo.price, 'GHS (source:', priceInfo.source, ')');
    return priceInfo.price;
  }

  // No coordinates - return default
  return DEFAULT_PRICES[binSize] || DEFAULT_PRICES[120];
};

/**
 * Clear pricing cache (useful for testing or manual refresh)
 */
export const clearPricingCache = () => {
  pricingCache.clear();
  console.log('[GPSPricing] Cache cleared');
};

/**
 * Get cache statistics (for debugging)
 */
export const getCacheStats = () => {
  let validEntries = 0;
  let expiredEntries = 0;

  pricingCache.forEach((entry) => {
    if (isCacheValid(entry)) {
      validEntries++;
    } else {
      expiredEntries++;
    }
  });

  return {
    totalEntries: pricingCache.size,
    validEntries,
    expiredEntries,
    ttlMs: CACHE_TTL_MS
  };
};

/**
 * Get metrics for monitoring and debugging
 * @returns {Object} Current metrics
 */
export const getMetrics = () => {
  const uptime = Date.now() - metrics.lastReset;
  const successRate = metrics.rpcCalls > 0 
    ? ((metrics.rpcSuccesses / metrics.rpcCalls) * 100).toFixed(1) 
    : 100;
  const cacheHitRate = metrics.totalRequests > 0
    ? ((metrics.cacheHits / metrics.totalRequests) * 100).toFixed(1)
    : 0;

  return {
    ...metrics,
    uptime_ms: uptime,
    success_rate: `${successRate}%`,
    cache_hit_rate: `${cacheHitRate}%`,
    circuit_breaker_status: circuitBreaker.isOpen ? 'OPEN' : 'CLOSED',
    circuit_breaker_failures: circuitBreaker.failures
  };
};

/**
 * Get health status of the GPS pricing service
 * @returns {Object} Health status
 */
export const getHealthStatus = () => {
  const recentFailureRate = metrics.rpcCalls > 0 
    ? (metrics.rpcFailures / metrics.rpcCalls) 
    : 0;

  let status = 'healthy';
  let message = 'GPS pricing service is operating normally';

  if (circuitBreaker.isOpen) {
    status = 'degraded';
    message = `Circuit breaker is open. Using default pricing. Will retry in ${Math.max(0, Math.ceil((circuitBreaker.resetTimeout - (Date.now() - circuitBreaker.lastFailure)) / 1000))}s`;
  } else if (recentFailureRate > 0.5) {
    status = 'warning';
    message = `High failure rate detected: ${(recentFailureRate * 100).toFixed(0)}%`;
  }

  return {
    status,
    message,
    circuitBreaker: {
      isOpen: circuitBreaker.isOpen,
      failures: circuitBreaker.failures,
      threshold: circuitBreaker.threshold,
      lastFailure: circuitBreaker.lastFailure
    },
    cache: getCacheStats(),
    metrics: getMetrics()
  };
};

/**
 * Reset metrics (useful for testing)
 */
export const resetMetrics = () => {
  metrics.totalRequests = 0;
  metrics.cacheHits = 0;
  metrics.rpcCalls = 0;
  metrics.rpcSuccesses = 0;
  metrics.rpcFailures = 0;
  metrics.circuitBreakerTrips = 0;
  metrics.lastReset = Date.now();
  console.log('[GPSPricing] Metrics reset');
};

/**
 * Force reset circuit breaker (for manual recovery)
 */
export const resetCircuitBreaker = () => {
  circuitBreaker.failures = 0;
  circuitBreaker.lastFailure = null;
  circuitBreaker.isOpen = false;
  console.log('[GPSPricing] Circuit breaker manually reset');
};

// Default export with all functions
export default {
  findNearestPricingZone,
  getLocationPrice,
  getAllPricesForLocation,
  getBaseCost,
  clearPricingCache,
  getCacheStats,
  getMetrics,
  getHealthStatus,
  resetMetrics,
  resetCircuitBreaker,
  DEFAULT_PRICES
};
