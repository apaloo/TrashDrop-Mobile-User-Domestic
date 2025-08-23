/**
 * Real Supabase batches table inspector - NO MOCK DATA
 * Only connects to actual Supabase batches table
 */

import supabase from './supabaseClient.js';

export const realTableInspector = {
  
  /**
   * Inspect the real batches table contents
   */
  async inspectBatchesTable() {
    const results = {
      tableExists: false,
      totalCount: 0,
      sampleRecords: [],
      columns: [],
      error: null
    };

    try {
      // Check if table exists and get count
      const { data, error, count } = await supabase
        .from('batches')
        .select('*', { count: 'exact' })
        .limit(5);

      if (error) {
        results.error = error.message;
        return results;
      }

      results.tableExists = true;
      results.totalCount = count || 0;
      results.sampleRecords = data || [];
      
      if (data && data.length > 0) {
        results.columns = Object.keys(data[0]);
      }

    } catch (e) {
      results.error = e.message;
    }

    return results;
  },

  /**
   * Search for specific UUID in batches table
   */
  async searchForUUID(uuid) {
    const results = {
      found: false,
      record: null,
      searchAttempts: [],
      error: null
    };

    try {
      // Try different column searches
      const searchColumns = ['id', 'batch_number', 'qr_code'];
      
      for (const column of searchColumns) {
        try {
          const { data, error } = await supabase
            .from('batches')
            .select('*')
            .eq(column, uuid)
            .limit(1);

          results.searchAttempts.push({
            column,
            found: !error && data && data.length > 0,
            error: error?.message,
            record: data?.[0] || null
          });

          if (!error && data && data.length > 0) {
            results.found = true;
            results.record = data[0];
            break;
          }
        } catch (e) {
          results.searchAttempts.push({
            column,
            found: false,
            error: e.message
          });
        }
      }

    } catch (e) {
      results.error = e.message;
    }

    return results;
  },

  /**
   * Get current user's batches
   */
  async getUserBatches(userId) {
    const results = {
      success: false,
      batches: [],
      count: 0,
      error: null
    };

    try {
      const { data, error } = await supabase
        .from('batches')
        .select('*')
        .eq('created_by', userId)
        .order('created_at', { ascending: false });

      if (error) {
        results.error = error.message;
        return results;
      }

      results.success = true;
      results.batches = data || [];
      results.count = data?.length || 0;

    } catch (e) {
      results.error = e.message;
    }

    return results;
  },

  /**
   * Run comprehensive batch table diagnosis
   */
  async runFullDiagnosis(userId, scannedUUID) {
    console.log('[RealTableInspector] Running full diagnosis...');
    
    const diagnosis = {
      timestamp: new Date().toISOString(),
      scannedUUID,
      userId,
      tableInspection: null,
      uuidSearch: null,
      userBatches: null,
      recommendations: []
    };

    // 1. Inspect table
    diagnosis.tableInspection = await this.inspectBatchesTable();
    
    // 2. Search for scanned UUID
    if (scannedUUID) {
      diagnosis.uuidSearch = await this.searchForUUID(scannedUUID);
    }
    
    // 3. Get user's batches
    if (userId) {
      diagnosis.userBatches = await this.getUserBatches(userId);
    }

    // 4. Generate recommendations
    if (!diagnosis.tableInspection.tableExists) {
      diagnosis.recommendations.push('CRITICAL: batches table does not exist in Supabase');
    } else if (diagnosis.tableInspection.totalCount === 0) {
      diagnosis.recommendations.push('CRITICAL: batches table is completely empty');
    } else if (!diagnosis.uuidSearch?.found) {
      diagnosis.recommendations.push(`UUID ${scannedUUID} does not exist in any batch field`);
      diagnosis.recommendations.push('Check if this UUID was generated correctly or exists in a different table');
    }

    if (diagnosis.userBatches?.count === 0) {
      diagnosis.recommendations.push(`User ${userId} has no batches assigned to them`);
    }

    return diagnosis;
  }
};

export default realTableInspector;
