#!/usr/bin/env node

/**
 * Script to clear digital bin cache
 * Run this in the browser console or as a standalone script
 */

// Browser console version
if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
  console.log('🗑️ Digital Bin Cache Cleaner');
  console.log('============================');
  
  // Get current cache summary
  const getCurrentSummary = () => {
    try {
      const binsList = JSON.parse(localStorage.getItem('digitalBinsList') || '[]');
      const locations = JSON.parse(localStorage.getItem('trashdrop_locations') || '[]');
      
      const allKeys = Object.keys(localStorage);
      const digitalBinKeys = allKeys.filter(key => 
        key.startsWith('digitalBin_') || 
        key === 'digitalBinsList' ||
        key.includes('digital_bin')
      );

      return {
        totalBins: binsList.length,
        binIds: binsList,
        totalLocations: locations.length,
        digitalBinKeys: digitalBinKeys,
        allKeys: allKeys.length
      };
    } catch (error) {
      return { error: error.message };
    }
  };

  // Clear digital bin cache
  const clearCache = () => {
    console.log('🔍 Scanning for digital bin cache...');
    
    const beforeSummary = getCurrentSummary();
    console.log('📊 Before cleanup:', beforeSummary);
    
    let cleared = 0;
    const errors = [];

    try {
      // 1. Get and clear individual digital bins
      const binsList = JSON.parse(localStorage.getItem('digitalBinsList') || '[]');
      
      binsList.forEach(locationId => {
        try {
          const binKey = `digitalBin_${locationId}`;
          localStorage.removeItem(binKey);
          cleared++;
          console.log(`✅ Cleared: ${binKey}`);
        } catch (error) {
          errors.push(`❌ Failed to clear digitalBin_${locationId}: ${error.message}`);
        }
      });

      // 2. Clear the bins list
      localStorage.removeItem('digitalBinsList');
      console.log('✅ Cleared: digitalBinsList');

      // 3. Scan for any remaining digital bin keys
      const allKeys = Object.keys(localStorage);
      const remainingBinKeys = allKeys.filter(key => 
        key.startsWith('digitalBin_') || 
        key.includes('digital_bin')
      );

      remainingBinKeys.forEach(key => {
        try {
          localStorage.removeItem(key);
          console.log(`✅ Cleared remaining: ${key}`);
        } catch (error) {
          errors.push(`❌ Failed to clear ${key}: ${error.message}`);
        }
      });

      const afterSummary = getCurrentSummary();
      
      console.log('📊 After cleanup:', afterSummary);
      console.log(`🎉 Cleanup complete! Cleared ${cleared} digital bins`);
      
      if (errors.length > 0) {
        console.log('⚠️ Errors encountered:');
        errors.forEach(error => console.log(error));
      }

      return {
        success: true,
        clearedCount: cleared,
        errors: errors,
        before: beforeSummary,
        after: afterSummary
      };

    } catch (error) {
      console.error('💥 Fatal error during cleanup:', error);
      return {
        success: false,
        error: error.message
      };
    }
  };

  // Execute the cleanup
  window.clearDigitalBinCache = clearCache;
  
  console.log('💡 To clear digital bin cache, run: clearDigitalBinCache()');
  console.log('💡 Current cache summary:', getCurrentSummary());
  
} else {
  console.log('This script should be run in a browser console where localStorage is available');
}
