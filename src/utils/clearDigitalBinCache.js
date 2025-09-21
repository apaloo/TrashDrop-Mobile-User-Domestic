/**
 * Utility to clear all digital bin cache data from localStorage
 */

/**
 * Clear all digital bin related cache data
 * @returns {Object} Summary of cleared data
 */
export const clearDigitalBinCache = () => {
  console.log('[Cache] Starting digital bin cache cleanup...');
  
  const summary = {
    digitalBinsCleared: 0,
    locationsCleared: false,
    binListCleared: false,
    errors: []
  };

  try {
    // 1. Get the list of digital bin IDs
    const binsList = JSON.parse(localStorage.getItem('digitalBinsList') || '[]');
    console.log(`[Cache] Found ${binsList.length} digital bins to clear`);

    // 2. Remove individual digital bin cache entries
    binsList.forEach(locationId => {
      try {
        const binKey = `digitalBin_${locationId}`;
        localStorage.removeItem(binKey);
        summary.digitalBinsCleared++;
        console.log(`[Cache] Cleared digital bin: ${binKey}`);
      } catch (error) {
        console.error(`[Cache] Error clearing digital bin ${locationId}:`, error);
        summary.errors.push(`Failed to clear digitalBin_${locationId}: ${error.message}`);
      }
    });

    // 3. Clear the digital bins list
    try {
      localStorage.removeItem('digitalBinsList');
      summary.binListCleared = true;
      console.log('[Cache] Cleared digitalBinsList');
    } catch (error) {
      console.error('[Cache] Error clearing digitalBinsList:', error);
      summary.errors.push(`Failed to clear digitalBinsList: ${error.message}`);
    }

    // 4. Optionally clear locations cache (since it's shared with pickup requests)
    // Uncomment the next lines if you want to clear locations too
    // try {
    //   localStorage.removeItem('trashdrop_locations');
    //   summary.locationsCleared = true;
    //   console.log('[Cache] Cleared trashdrop_locations');
    // } catch (error) {
    //   console.error('[Cache] Error clearing locations:', error);
    //   summary.errors.push(`Failed to clear trashdrop_locations: ${error.message}`);
    // }

    // 5. Clear any other digital bin related keys (scan for them)
    const allKeys = Object.keys(localStorage);
    const digitalBinKeys = allKeys.filter(key => 
      key.startsWith('digitalBin_') || 
      key.includes('digital_bin') ||
      key.includes('qr_code')
    );

    digitalBinKeys.forEach(key => {
      try {
        localStorage.removeItem(key);
        console.log(`[Cache] Cleared additional key: ${key}`);
      } catch (error) {
        console.error(`[Cache] Error clearing key ${key}:`, error);
        summary.errors.push(`Failed to clear ${key}: ${error.message}`);
      }
    });

    console.log('[Cache] Digital bin cache cleanup completed:', summary);
    return summary;

  } catch (error) {
    console.error('[Cache] Fatal error during cache cleanup:', error);
    summary.errors.push(`Fatal error: ${error.message}`);
    return summary;
  }
};

/**
 * Clear all cache data (including auth, locations, etc.)
 * Use with caution - this will log the user out
 */
export const clearAllCache = () => {
  console.log('[Cache] Starting complete cache cleanup...');
  
  try {
    // First clear digital bin cache
    const digitalBinSummary = clearDigitalBinCache();
    
    // Clear all localStorage
    localStorage.clear();
    
    console.log('[Cache] All cache cleared successfully');
    return {
      digitalBinSummary,
      allCacheCleared: true
    };
  } catch (error) {
    console.error('[Cache] Error clearing all cache:', error);
    return {
      digitalBinSummary: null,
      allCacheCleared: false,
      error: error.message
    };
  }
};

/**
 * Get summary of current digital bin cache
 */
export const getDigitalBinCacheSummary = () => {
  try {
    const binsList = JSON.parse(localStorage.getItem('digitalBinsList') || '[]');
    const locations = JSON.parse(localStorage.getItem('trashdrop_locations') || '[]');
    
    const summary = {
      totalBins: binsList.length,
      binIds: binsList,
      totalLocations: locations.length,
      cacheKeys: []
    };

    // Find all digital bin related keys
    const allKeys = Object.keys(localStorage);
    summary.cacheKeys = allKeys.filter(key => 
      key.startsWith('digitalBin_') || 
      key === 'digitalBinsList' ||
      key === 'trashdrop_locations'
    );

    return summary;
  } catch (error) {
    console.error('[Cache] Error getting cache summary:', error);
    return { error: error.message };
  }
};

export default {
  clearDigitalBinCache,
  clearAllCache,
  getDigitalBinCacheSummary
};
