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
 * Cache for pricing lookups to reduce database queries
 * Key: `${lat}_${lng}` (rounded to 4 decimal places)
 * Value: { zone, timestamp }
 */
const pricingCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

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
 * Find the nearest pricing zone for given GPS coordinates
 * 
 * @param {number} latitude - GPS latitude
 * @param {number} longitude - GPS longitude
 * @param {number} maxDistanceKm - Maximum search distance (default: 10km)
 * @returns {Promise<Object|null>} Pricing zone data or null if not found
 */
export const findNearestPricingZone = async (latitude, longitude, maxDistanceKm = MAX_SEARCH_DISTANCE_KM) => {
  // Validate coordinates
  if (!latitude || !longitude || isNaN(latitude) || isNaN(longitude)) {
    console.warn('[GPSPricing] Invalid coordinates:', { latitude, longitude });
    return null;
  }

  // Check cache first
  const cacheKey = getCacheKey(latitude, longitude);
  const cachedEntry = pricingCache.get(cacheKey);
  if (isCacheValid(cachedEntry)) {
    console.log('[GPSPricing] Cache hit for:', cacheKey);
    return cachedEntry.zone;
  }

  try {
    console.log('[GPSPricing] Querying for nearest zone:', { latitude, longitude, maxDistanceKm });

    // Call the database function to find nearest zone
    const { data, error } = await supabase
      .rpc('find_nearest_pricing_zone', {
        p_latitude: latitude,
        p_longitude: longitude,
        p_max_distance_km: maxDistanceKm
      });

    if (error) {
      console.error('[GPSPricing] Database error:', error);
      return null;
    }

    if (!data || data.length === 0) {
      console.log('[GPSPricing] No zone found within', maxDistanceKm, 'km');
      // Cache the null result to avoid repeated queries
      pricingCache.set(cacheKey, { zone: null, timestamp: Date.now() });
      return null;
    }

    const zone = data[0];
    console.log('[GPSPricing] Found zone:', zone.suburb, 'at', zone.distance_km?.toFixed(2), 'km');

    // Cache the result
    pricingCache.set(cacheKey, { zone, timestamp: Date.now() });

    return zone;
  } catch (error) {
    console.error('[GPSPricing] Error finding pricing zone:', error);
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

// Default export with all functions
export default {
  findNearestPricingZone,
  getLocationPrice,
  getAllPricesForLocation,
  getBaseCost,
  clearPricingCache,
  getCacheStats,
  DEFAULT_PRICES
};
