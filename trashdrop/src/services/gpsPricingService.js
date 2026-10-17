/**
 * GPS-based Pricing Service
 * Provides location-specific pricing for waste collection services
 * 
 * Prices come only from the pricing zone that covers the location (the
 * get_covering_pricing_zone RPC, which applies each zone's service_radius_km).
 * There are no default prices: a location outside every zone, a zone without a
 * price for the bin size, or a failed lookup raises PricingUnavailableError so
 * nothing is ever quoted or charged at a made-up rate.
 */

import supabase from '../utils/supabaseClient.js';

const BIN_SIZES = [50, 60, 80, 90, 100, 120, 240, 260, 320, 340, 360, 660, 1100];

/**
 * Why a location could not be priced
 *   no_location   — no coordinates to price
 *   not_covered   — outside every zone's service radius
 *   size_unpriced — the covering zone has no price for this bin size
 *   lookup_failed — the pricing lookup itself failed; retrying may work
 */
const PRICING_MESSAGES = {
  no_location: 'Set your bin location before we can price this pickup.',
  not_covered: "We haven't started operating at this location yet, so we can't price a pickup here.",
  size_unpriced: "This bin size isn't available in your area yet. Please choose another size.",
  lookup_failed: "We couldn't load prices for your location right now. Please try again in a moment."
};

export class PricingUnavailableError extends Error {
  constructor(reason, details = {}) {
    super(PRICING_MESSAGES[reason] || PRICING_MESSAGES.lookup_failed);
    this.name = 'PricingUnavailableError';
    this.reason = reason;
    Object.assign(this, details);
  }
}

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
 * Value: { zone, timestamp } (zone is null for a location outside coverage)
 */
const pricingCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

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
  return (Date.now() - cacheEntry.timestamp) < CACHE_TTL_MS;
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
 * Find the pricing zone that covers the given GPS coordinates
 *
 * @param {number} latitude - GPS latitude
 * @param {number} longitude - GPS longitude
 * @returns {Promise<Object|null>} The covering zone, or null when the location is outside every zone
 * @throws {PricingUnavailableError} lookup_failed when the lookup cannot be completed
 */
export const findCoveringPricingZone = async (latitude, longitude) => {
  metrics.totalRequests++;

  // Validate coordinates
  if (latitude == null || longitude == null || isNaN(latitude) || isNaN(longitude)) {
    throw new PricingUnavailableError('no_location');
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
    console.warn('[GPSPricing] Circuit breaker OPEN - skipping RPC call');
    throw new PricingUnavailableError('lookup_failed');
  }

  let data;
  try {
    metrics.rpcCalls++;
    console.log('[GPSPricing] Querying for covering zone:', { latitude, longitude });

    // Call the database function with timeout and retry
    const rpcOperation = async () => {
      const rpcPromise = supabase.rpc('get_covering_pricing_zone', {
        p_latitude: latitude,
        p_longitude: longitude
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
    data = await withRetry(rpcOperation);

    // Record success - resets circuit breaker
    recordSuccess();
  } catch (error) {
    // Record failure - may trip circuit breaker
    recordFailure();
    console.error('[GPSPricing] Error finding pricing zone:', error.message);
    // Failures are not cached, so "Try again" really retries; the circuit
    // breaker is what stops a failing service being hammered
    throw new PricingUnavailableError('lookup_failed');
  }

  const zone = Array.isArray(data) ? (data[0] || null) : (data || null);
  if (zone) {
    console.log('[GPSPricing] Covering zone:', zone.suburb);
  } else {
    console.log('[GPSPricing] Location is outside every service area');
  }

  pricingCache.set(cacheKey, { zone, timestamp: Date.now() });
  return zone;
};

// The zone's price for a bin size, or null when the zone has none
const zonePriceFor = (zone, binSize) => {
  const price = parseFloat(zone[`price_${binSize}l`]);
  return Number.isFinite(price) && price > 0 ? price : null;
};

const zoneSummary = (zone) => ({
  region: zone.region,
  district: zone.district,
  community: zone.community,
  suburb: zone.suburb
});

/**
 * Get price for a specific bin size at a location
 *
 * @param {number} latitude - GPS latitude
 * @param {number} longitude - GPS longitude
 * @param {number} binSize - Bin size in liters (50, 60, 80, 90, 100, 120, 240, 260, 320, 340, 360, 660, 1100)
 * @returns {Promise<Object>} { price, source: 'gps', zone }
 * @throws {PricingUnavailableError} when the location or size cannot be priced
 */
export const getLocationPrice = async (latitude, longitude, binSize) => {
  if (!BIN_SIZES.includes(binSize)) {
    throw new PricingUnavailableError('size_unpriced', { binSize });
  }

  const zone = await findCoveringPricingZone(latitude, longitude);
  if (!zone) {
    throw new PricingUnavailableError('not_covered');
  }

  const price = zonePriceFor(zone, binSize);
  if (price == null) {
    throw new PricingUnavailableError('size_unpriced', { binSize, zone: zoneSummary(zone) });
  }

  return {
    price,
    source: 'gps',
    zone: zoneSummary(zone)
  };
};

/**
 * Get all bin size prices for a location
 * Useful for displaying price options to user. Sizes the zone does not price
 * are left out rather than filled with a made-up rate.
 *
 * @param {number} latitude - GPS latitude
 * @param {number} longitude - GPS longitude
 * @returns {Promise<Object>} { prices: {size: price}, source: 'gps', zone }
 * @throws {PricingUnavailableError} when the location cannot be priced
 */
export const getAllPricesForLocation = async (latitude, longitude) => {
  const zone = await findCoveringPricingZone(latitude, longitude);
  if (!zone) {
    throw new PricingUnavailableError('not_covered');
  }

  const prices = {};
  BIN_SIZES.forEach(size => {
    const price = zonePriceFor(zone, size);
    if (price != null) prices[size] = price;
  });

  return {
    prices,
    source: 'gps',
    zone: zoneSummary(zone)
  };
};

/**
 * Get base cost for cost calculator integration
 *
 * @param {number} binSize - Bin size in liters
 * @param {number} latitude - GPS latitude
 * @param {number} longitude - GPS longitude
 * @returns {Promise<number>} Base cost in GHS
 * @throws {PricingUnavailableError} when the location or size cannot be priced
 */
export const getBaseCost = async (binSize, latitude, longitude) => {
  const priceInfo = await getLocationPrice(latitude, longitude, binSize);
  console.log('[GPSPricing] Base cost for', binSize, 'L:', priceInfo.price, 'GHS');
  return priceInfo.price;
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
    message = `Circuit breaker is open. Pricing is unavailable. Will retry in ${Math.max(0, Math.ceil((circuitBreaker.resetTimeout - (Date.now() - circuitBreaker.lastFailure)) / 1000))}s`;
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
  findCoveringPricingZone,
  getLocationPrice,
  getAllPricesForLocation,
  getBaseCost,
  clearPricingCache,
  getCacheStats,
  getMetrics,
  getHealthStatus,
  resetMetrics,
  resetCircuitBreaker,
  PricingUnavailableError
};
