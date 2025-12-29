/**
 * Database Schema Checker Utility
 * Helps identify actual Supabase database structure and column names
 */

import supabase from './supabaseClient.js';

export const schemaChecker = {
  /**
   * Check if a table exists and get its structure
   * @param {string} tableName - Name of the table to check
   * @returns {Object} Table information and sample data
   */
  async checkTable(tableName) {
    try {
      console.log(`[SchemaChecker] Checking table: ${tableName}`);
      
      // Try to fetch a single record to understand the schema
      const { data, error } = await supabase
        .from(tableName)
        .select('*')
        .limit(1);

      if (error) {
        console.error(`[SchemaChecker] Error accessing ${tableName}:`, error);
        return {
          exists: false,
          error: error.message,
          code: error.code
        };
      }

      // Get column names from the data
      const columns = data && data.length > 0 ? Object.keys(data[0]) : [];
      
      console.log(`[SchemaChecker] ${tableName} - Columns found:`, columns);
      
      return {
        exists: true,
        columns,
        sampleData: data,
        recordCount: data?.length || 0
      };
      
    } catch (error) {
      console.error(`[SchemaChecker] Exception checking ${tableName}:`, error);
      return {
        exists: false,
        error: error.message,
        exception: true
      };
    }
  },

  /**
   * Check all critical tables for the TrashDrops app
   * @returns {Object} Complete schema information
   */
  async checkAllTables() {
    console.log('[SchemaChecker] Starting comprehensive schema check...');
    
    const criticalTables = [
      'profiles',
      'user_stats', 
      'user_activity',
      'pickup_requests',
      'illegal_dumping',
      'bag_inventory',
      'rewards',
      'reward_redemptions',
      'locations'
    ];

    const schemaInfo = {};
    
    for (const table of criticalTables) {
      schemaInfo[table] = await this.checkTable(table);
      // Add small delay to avoid overwhelming the database
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return schemaInfo;
  },

  /**
   * Test queries with different column variations
   * @param {string} tableName - Table name
   * @param {string} userId - User ID to test with
   * @returns {Object} Query results for different column variations
   */
  async testUserQueries(tableName, userId) {
    console.log(`[SchemaChecker] Testing user queries for ${tableName} with user: ${userId}`);
    
    const variations = [
      { column: 'id', value: userId },
      { column: 'user_id', value: userId },
      { column: 'reported_by', value: userId }, // for illegal_dumping
      { column: 'collector_id', value: userId } // for pickup_requests
    ];

    const results = {};
    
    for (const { column, value } of variations) {
      try {
        const { data, error } = await supabase
          .from(tableName)
          .select('*')
          .eq(column, value)
          .limit(5);

        results[column] = {
          success: !error,
          error: error?.message,
          recordCount: data?.length || 0,
          hasData: data && data.length > 0
        };
        
        if (data && data.length > 0) {
          console.log(`[SchemaChecker] ${tableName}.${column} - Found ${data.length} records`);
        }
      } catch (exception) {
        results[column] = {
          success: false,
          error: exception.message,
          exception: true
        };
      }
      
      // Small delay between queries
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    return results;
  },

  /**
   * Generate a report of database compatibility issues
   * @param {string} userId - User ID to test queries with
   * @returns {Object} Comprehensive compatibility report
   */
  async generateCompatibilityReport(userId = '12345678-1234-5678-1234-567812345678') {
    console.log('[SchemaChecker] Generating compatibility report...');
    
    const report = {
      timestamp: new Date().toISOString(),
      userId,
      tables: {},
      recommendations: []
    };

    // Check all tables
    const schemaInfo = await this.checkAllTables();
    
    // Test user-specific queries for key tables
    const userTables = ['profiles', 'pickup_requests', 'illegal_dumping', 'user_activity'];
    
    for (const table of userTables) {
      if (schemaInfo[table]?.exists) {
        const queryResults = await this.testUserQueries(table, userId);
        report.tables[table] = {
          ...schemaInfo[table],
          userQueries: queryResults
        };
      } else {
        report.tables[table] = schemaInfo[table];
      }
    }

    // Add non-user tables
    const otherTables = ['rewards', 'locations', 'bag_inventory'];
    for (const table of otherTables) {
      report.tables[table] = schemaInfo[table];
    }

    // Generate recommendations based on findings
    report.recommendations = this.generateRecommendations(report.tables);
    
    return report;
  },

  /**
   * Generate recommendations based on schema analysis
   * @param {Object} tables - Table analysis results
   * @returns {Array} List of recommendations
   */
  generateRecommendations(tables) {
    const recommendations = [];
    
    // Check for missing tables
    Object.entries(tables).forEach(([tableName, info]) => {
      if (!info.exists) {
        if (info.code === '42P01') {
          recommendations.push({
            type: 'missing_table',
            table: tableName,
            message: `Table '${tableName}' does not exist in the database`,
            action: 'Create table or update service to handle missing table'
          });
        } else if (info.code === '42501') {
          recommendations.push({
            type: 'permission_denied',
            table: tableName,
            message: `Access denied to table '${tableName}'`,
            action: 'Check RLS policies and user permissions'
          });
        }
      }
    });

    // Check for column mismatches
    Object.entries(tables).forEach(([tableName, info]) => {
      if (info.exists && info.userQueries) {
        const workingColumns = Object.entries(info.userQueries)
          .filter(([col, result]) => result.success)
          .map(([col]) => col);
        
        if (workingColumns.length === 0) {
          recommendations.push({
            type: 'no_working_columns',
            table: tableName,
            message: `No working user ID columns found for '${tableName}'`,
            action: 'Check column names and data types'
          });
        } else {
          recommendations.push({
            type: 'working_columns',
            table: tableName,
            message: `Working columns for '${tableName}': ${workingColumns.join(', ')}`,
            action: 'Update service queries to use these columns'
          });
        }
      }
    });

    return recommendations;
  },

  /**
   * Print a formatted report to console
   * @param {Object} report - Compatibility report
   */
  printReport(report) {
    console.log('\n📊 SUPABASE DATABASE COMPATIBILITY REPORT');
    console.log('═'.repeat(50));
    console.log(`Generated: ${report.timestamp}`);
    console.log(`Test User ID: ${report.userId}\n`);

    console.log('📋 TABLE STATUS:');
    Object.entries(report.tables).forEach(([tableName, info]) => {
      const status = info.exists ? '✅' : '❌';
      console.log(`${status} ${tableName}`);
      
      if (info.exists) {
        console.log(`   Columns: ${info.columns?.join(', ') || 'Unknown'}`);
        if (info.userQueries) {
          const working = Object.entries(info.userQueries)
            .filter(([, result]) => result.success && result.hasData)
            .map(([col]) => col);
          if (working.length > 0) {
            console.log(`   ✅ Working user queries: ${working.join(', ')}`);
          }
        }
      } else {
        console.log(`   Error: ${info.error}`);
      }
      console.log('');
    });

    console.log('💡 RECOMMENDATIONS:');
    report.recommendations.forEach((rec, index) => {
      console.log(`${index + 1}. [${rec.type.toUpperCase()}] ${rec.table || 'General'}`);
      console.log(`   ${rec.message}`);
      console.log(`   Action: ${rec.action}\n`);
    });

    return report;
  }
};

export default schemaChecker;
