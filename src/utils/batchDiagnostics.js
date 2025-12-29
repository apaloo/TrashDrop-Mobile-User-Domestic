/**
 * Batch scanning diagnostics utility
 * Helps debug "Batch not found" issues
 */

import supabase from './supabaseClient.js';

export const batchDiagnostics = {
  
  /**
   * Comprehensive batch lookup diagnostics
   * @param {string} batchIdentifier - The identifier being scanned
   * @returns {Object} Diagnostic information
   */
  async diagnoseBatchLookup(batchIdentifier) {
    console.log('[BatchDiagnostics] Starting diagnosis for:', batchIdentifier);
    
    const results = {
      identifier: batchIdentifier,
      timestamp: new Date().toISOString(),
      tables: {},
      auth: {},
      lookups: {},
      suggestions: []
    };

    // Check authentication
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      results.auth = {
        hasSession: !!session,
        userId: session?.user?.id || null,
        hasToken: !!session?.access_token,
        error: error?.message
      };
    } catch (e) {
      results.auth.error = e.message;
    }

    // Check table existence and data
    const tablesToCheck = ['batches', 'bags'];
    
    for (const tableName of tablesToCheck) {
      try {
        const { data, error, count } = await supabase
          .from(tableName)
          .select('*', { count: 'exact' })
          .limit(5);
        
        results.tables[tableName] = {
          exists: !error,
          error: error?.message,
          count: count,
          sampleData: data?.slice(0, 2) || [],
          columns: data?.[0] ? Object.keys(data[0]) : []
        };
      } catch (e) {
        results.tables[tableName] = {
          exists: false,
          error: e.message
        };
      }
    }

    // Test specific lookups
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(batchIdentifier);
    
    // Try different lookup strategies
    const strategies = [
      { name: 'UUID by id', query: isUUID ? ['id', batchIdentifier] : null },
      { name: 'Exact batch_number', query: ['batch_number', batchIdentifier] },
      { name: 'Case insensitive batch_number', query: ['batch_number', batchIdentifier, 'ilike'] },
      { name: 'With BATCH- prefix', query: ['batch_number', `BATCH-${batchIdentifier}`] },
      { name: 'Without BATCH- prefix', query: ['batch_number', batchIdentifier.replace(/^BATCH-/i, '')] }
    ];

    for (const strategy of strategies) {
      if (!strategy.query) continue;
      
      const [column, value, operator = 'eq'] = strategy.query;
      
      for (const tableName of ['batches']) {
        if (!results.tables[tableName]?.exists) continue;
        
        try {
          const query = supabase.from(tableName).select('*');
          const { data, error } = operator === 'ilike' 
            ? await query.ilike(column, value).limit(1)
            : await query.eq(column, value).limit(1);
          
          const key = `${strategy.name} (${tableName})`;
          results.lookups[key] = {
            found: !!data?.length,
            error: error?.message,
            data: data?.[0] || null
          };
        } catch (e) {
          results.lookups[`${strategy.name} (${tableName})`] = {
            found: false,
            error: e.message
          };
        }
      }
    }

    // Generate suggestions
    if (!results.auth.hasSession) {
      results.suggestions.push('Authentication issue: No valid session found');
    }

    const hasAnyBatches = Object.values(results.tables).some(t => t.exists && t.count > 0);
    if (!hasAnyBatches) {
      results.suggestions.push('No batches found in any table - database may be empty');
    }

    const foundInAnyLookup = Object.values(results.lookups).some(l => l.found);
    if (!foundInAnyLookup && hasAnyBatches) {
      results.suggestions.push('Batch exists in DB but identifier format mismatch');
      results.suggestions.push('Check QR code generation vs batch_number format');
    }

    if (!results.tables.batches?.exists) {
      results.suggestions.push('batches table does not exist - check database schema');
    }

    return results;
  },

  /**
   * Quick batch table inspection
   */
  async inspectBatchTables() {
    const tables = ['batches', 'bags'];
    const results = {};

    for (const table of tables) {
      try {
        const { data, error } = await supabase
          .from(table)
          .select('*')
          .limit(3);
        
        results[table] = {
          exists: !error,
          sampleData: data || [],
          error: error?.message
        };
      } catch (e) {
        results[table] = { exists: false, error: e.message };
      }
    }

    return results;
  },

  /**
   * Test batch creation for debugging
   */
  async createTestBatch(userId) {
    const testBatch = {
      batch_number: `TEST-${Date.now()}`,
      status: 'active',
      bag_count: 5,
      created_by: userId
    };

    try {
      const { data, error } = await supabase
        .from('batches')
        .insert(testBatch)
        .select()
        .single();

      return { success: !error, data, error: error?.message };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
};

export default batchDiagnostics;
