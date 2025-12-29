/**
 * Direct Supabase batches table query utility for immediate debugging
 */

import supabase from './supabaseClient.js';

// Add this to console for immediate testing: window.directBatchQuery = directBatchQuery;
export const directBatchQuery = {
  
  /**
   * Query batches table directly from browser console
   */
  async checkTable() {
    console.log('🔍 Checking Supabase batches table...');
    
    try {
      const { data, error, count } = await supabase
        .from('batches')
        .select('*', { count: 'exact' })
        .limit(10);

      if (error) {
        console.error('❌ Error accessing batches table:', error);
        return { success: false, error: error.message };
      }

      console.log(`✅ Batches table found with ${count} total records`);
      
      if (count === 0) {
        console.warn('⚠️ Batches table is EMPTY - no records exist');
        return { success: true, isEmpty: true, count: 0, records: [] };
      }

      console.log('📋 Sample records:', data);
      
      // Show column structure
      if (data && data.length > 0) {
        console.log('🏗️ Table columns:', Object.keys(data[0]));
      }

      return { success: true, count, records: data, isEmpty: false };
      
    } catch (e) {
      console.error('💥 Failed to query batches table:', e);
      return { success: false, error: e.message };
    }
  },

  /**
   * Search for specific UUID
   */
  async findUUID(uuid) {
    console.log(`🔍 Searching for UUID: ${uuid}`);
    
    const searchFields = ['id', 'batch_number', 'qr_code_url', 'batch_id'];
    
    for (const field of searchFields) {
      try {
        const { data, error } = await supabase
          .from('batches')
          .select('*')
          .eq(field, uuid)
          .limit(1);

        if (!error && data && data.length > 0) {
          console.log(`✅ Found in field '${field}':`, data[0]);
          return { found: true, field, record: data[0] };
        } else if (error) {
          console.log(`❌ Error searching field '${field}':`, error.message);
        } else {
          console.log(`❌ Not found in field '${field}'`);
        }
      } catch (e) {
        console.log(`💥 Failed to search field '${field}':`, e.message);
      }
    }

    console.log('❌ UUID not found in any field');
    return { found: false };
  },

  /**
   * Create a test batch for debugging
   */
  async createTestBatch(userId) {
    const testUUID = '5701b68d-c67f-4c73-a2cd-68c5a9b9bb88';
    
    console.log(`🧪 Creating test batch with UUID: ${testUUID}`);
    
    try {
      const { data, error } = await supabase
        .from('batches')
        .insert({
          id: testUUID,
          batch_number: `TEST-${Date.now()}`,
          status: 'active',
          bag_count: 5,
          created_by: userId || 'test-user',
          qr_code_url: `https://example.com/qr/${testUUID}`
        })
        .select()
        .single();

      if (error) {
        console.error('❌ Failed to create test batch:', error);
        return { success: false, error: error.message };
      }

      console.log('✅ Test batch created:', data);
      return { success: true, batch: data };
      
    } catch (e) {
      console.error('💥 Exception creating test batch:', e);
      return { success: false, error: e.message };
    }
  }
};

// Make available in browser console for immediate testing
if (typeof window !== 'undefined') {
  window.directBatchQuery = directBatchQuery;
}

export default directBatchQuery;
