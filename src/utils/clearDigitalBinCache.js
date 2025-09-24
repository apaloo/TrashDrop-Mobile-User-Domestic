/**
 * Utility to clear all digital bin cache data from localStorage
 */

/**
 * Clear all digital bin related cache data
 * @returns {Object} Summary of cleared data
 */
export const clearDigitalBinCache = () => {
  console.log('[Cache] Starting comprehensive digital bin cache cleanup...');
  
  const summary = {
    digitalBinsCleared: 0,
    newDigitalBinsCleared: false,
    locationsCleared: false,
    binListCleared: false,
    qrCodesCleared: 0,
    errors: []
  };

  try {
    // 1. Clear NEW storage pattern - single digitalBins key
    try {
      const digitalBins = localStorage.getItem('digitalBins');
      if (digitalBins) {
        const binsArray = JSON.parse(digitalBins);
        localStorage.removeItem('digitalBins');
        summary.newDigitalBinsCleared = true;
        console.log(`[Cache] Cleared new digitalBins storage (${binsArray.length} bins)`);
      }
    } catch (error) {
      console.error('[Cache] Error clearing new digitalBins storage:', error);
      summary.errors.push(`Failed to clear digitalBins: ${error.message}`);
    }

    // 2. Clear OLD storage pattern - individual bin entries
    const binsList = JSON.parse(localStorage.getItem('digitalBinsList') || '[]');
    console.log(`[Cache] Found ${binsList.length} old digital bins to clear`);

    binsList.forEach(locationId => {
      try {
        const binKey = `digitalBin_${locationId}`;
        localStorage.removeItem(binKey);
        summary.digitalBinsCleared++;
        console.log(`[Cache] Cleared old digital bin: ${binKey}`);
      } catch (error) {
        console.error(`[Cache] Error clearing digital bin ${locationId}:`, error);
        summary.errors.push(`Failed to clear digitalBin_${locationId}: ${error.message}`);
      }
    });

    // 3. Clear the old digital bins list
    try {
      localStorage.removeItem('digitalBinsList');
      summary.binListCleared = true;
      console.log('[Cache] Cleared digitalBinsList');
    } catch (error) {
      console.error('[Cache] Error clearing digitalBinsList:', error);
      summary.errors.push(`Failed to clear digitalBinsList: ${error.message}`);
    }

    // 4. Clear locations cache
    try {
      localStorage.removeItem('trashdrop_locations');
      summary.locationsCleared = true;
      console.log('[Cache] Cleared trashdrop_locations');
    } catch (error) {
      console.error('[Cache] Error clearing locations:', error);
      summary.errors.push(`Failed to clear trashdrop_locations: ${error.message}`);
    }

    // 5. Scan and clear ALL digital bin related keys
    const allKeys = Object.keys(localStorage);
    const digitalBinKeys = allKeys.filter(key => 
      key.startsWith('digitalBin_') || 
      key.includes('digital_bin') ||
      key.includes('qr_code') ||
      key.startsWith('qr_') ||
      key === 'digitalBins' ||
      key === 'digitalBinsList'
    );

    digitalBinKeys.forEach(key => {
      try {
        localStorage.removeItem(key);
        if (key.includes('qr')) {
          summary.qrCodesCleared++;
        }
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
    // Check new storage pattern
    const newDigitalBins = JSON.parse(localStorage.getItem('digitalBins') || '[]');
    
    // Check old storage pattern
    const binsList = JSON.parse(localStorage.getItem('digitalBinsList') || '[]');
    const locations = JSON.parse(localStorage.getItem('trashdrop_locations') || '[]');
    
    const summary = {
      newStoragePattern: {
        totalBins: newDigitalBins.length,
        bins: newDigitalBins
      },
      oldStoragePattern: {
        totalBins: binsList.length,
        binIds: binsList,
        totalLocations: locations.length
      },
      cacheKeys: []
    };

    // Find all digital bin related keys
    const allKeys = Object.keys(localStorage);
    summary.cacheKeys = allKeys.filter(key => 
      key.startsWith('digitalBin_') || 
      key === 'digitalBinsList' ||
      key === 'digitalBins' ||
      key === 'trashdrop_locations' ||
      key.includes('qr_code') ||
      key.startsWith('qr_')
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
