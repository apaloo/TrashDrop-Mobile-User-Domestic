/**
 * Sample data generator for testing batch scanning
 */

import supabase from './supabaseClient.js';

export const sampleDataGenerator = {
  
  /**
   * Create sample batches for testing
   * @param {string} userId - User ID to assign batches to
   * @param {number} count - Number of batches to create
   * @returns {Promise<Object>} Result with created batches
   */
  async createSampleBatches(userId, count = 5) {
    const results = {
      success: false,
      batches: [],
      errors: [],
      tablesUsed: []
    };

    const sampleBatches = [];
    for (let i = 1; i <= count; i++) {
      const batchNumber = `BATCH-${Date.now()}-${i.toString().padStart(3, '0')}`;
      sampleBatches.push({
        batch_number: batchNumber,
        status: 'active',
        bag_count: Math.floor(Math.random() * 10) + 1, // 1-10 bags
        created_by: userId,
        qr_code_url: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(batchNumber)}`
      });
    }

    // Try batches table first
    try {
      const { data, error } = await supabase
        .from('batches')
        .insert(sampleBatches)
        .select();

      if (!error && data) {
        results.success = true;
        results.batches = data;
        results.tablesUsed.push('batches');
        return results;
      } else {
        results.errors.push(`batches table: ${error?.message || 'Unknown error'}`);
      }
    } catch (e) {
      results.errors.push(`batches table: ${e.message}`);
    }

    // If batches table failed, the issue is likely RLS policies
    results.errors.push('RLS policies may be blocking batch creation - use service role for admin operations');

    return results;
  },

  /**
   * Create sample bags for existing batches
   * @param {string[]} batchIds - Array of batch IDs
   * @returns {Promise<Object>} Result with created bags
   */
  async createSampleBags(batchIds) {
    const results = {
      success: false,
      bags: [],
      errors: []
    };

    const sampleBags = [];
    batchIds.forEach(batchId => {
      const bagCount = Math.floor(Math.random() * 5) + 1; // 1-5 bags per batch
      for (let i = 1; i <= bagCount; i++) {
        sampleBags.push({
          batch_id: batchId,
          bag_number: `${batchId}-BAG-${i}`,
          type: ['plastic', 'paper', 'glass', 'metal'][Math.floor(Math.random() * 4)],
          weight_kg: (Math.random() * 5 + 1).toFixed(2) // 1-6 kg
        });
      }
    });

    try {
      const { data, error } = await supabase
        .from('bags')
        .insert(sampleBags)
        .select();

      if (!error && data) {
        results.success = true;
        results.bags = data;
      } else {
        results.errors.push(error?.message || 'Unknown error');
      }
    } catch (e) {
      results.errors.push(e.message);
    }

    return results;
  },

  /**
   * Generate QR code data for testing (common formats)
   * @returns {string[]} Array of test QR code values
   */
  generateTestQRCodes() {
    const timestamp = Date.now();
    return [
      `BATCH-${timestamp}-001`,
      `BATCH-${timestamp}-002`, 
      `TD-${timestamp}`,
      `${timestamp}`,
      `TRASHDROP-${timestamp}`,
      // UUID format
      `550e8400-e29b-41d4-a716-446655440000`,
      // Simple numeric
      `${Math.floor(Math.random() * 1000000)}`
    ];
  },

  /**
   * Clear all sample data (for cleanup)
   * @param {string} userId - User ID to filter deletions
   * @returns {Promise<Object>} Deletion results
   */
  async clearSampleData(userId) {
    const results = {
      success: false,
      deleted: {},
      errors: []
    };

    // Delete batches created by user
    const tables = ['batches'];
    
    for (const table of tables) {
      try {
        const { error, count } = await supabase
          .from(table)
          .delete()
          .eq('created_by', userId);

        if (!error) {
          results.deleted[table] = count || 0;
        } else {
          results.errors.push(`${table}: ${error.message}`);
        }
      } catch (e) {
        results.errors.push(`${table}: ${e.message}`);
      }
    }

    results.success = results.errors.length === 0;
    return results;
  }
};

export default sampleDataGenerator;
