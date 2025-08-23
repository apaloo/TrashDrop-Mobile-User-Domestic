/**
 * Schema validation utilities for graceful degradation
 * Helps services adapt to missing tables/columns dynamically
 */

import supabase from './supabaseClient.js';

class SchemaValidator {
  constructor() {
    this.tableCache = new Map();
    this.columnCache = new Map();
  }

  /**
   * Check if a table exists in the database
   * @param {string} tableName - Name of table to check
   * @returns {Promise<boolean>} - True if table exists
   */
  async tableExists(tableName) {
    if (this.tableCache.has(tableName)) {
      return this.tableCache.get(tableName);
    }

    try {
      const { error } = await supabase
        .from(tableName)
        .select('*')
        .limit(0);
      
      const exists = !error || error.code !== '42P01'; // 42P01 = relation does not exist
      this.tableCache.set(tableName, exists);
      return exists;
    } catch (e) {
      this.tableCache.set(tableName, false);
      return false;
    }
  }

  /**
   * Check if specific columns exist in a table
   * @param {string} tableName - Table name
   * @param {string[]} columns - Column names to check
   * @returns {Promise<{[columnName]: boolean}>} - Object with column existence
   */
  async columnsExist(tableName, columns) {
    const cacheKey = `${tableName}:${columns.join(',')}`;
    if (this.columnCache.has(cacheKey)) {
      return this.columnCache.get(cacheKey);
    }

    const result = {};
    
    try {
      // Try to select specific columns to test existence
      const selectQuery = columns.join(', ');
      const { error } = await supabase
        .from(tableName)
        .select(selectQuery)
        .limit(0);

      if (!error) {
        // All columns exist
        columns.forEach(col => result[col] = true);
      } else if (error.code === '42703') {
        // Column doesn't exist - need to test individually
        for (const column of columns) {
          try {
            const { error: colError } = await supabase
              .from(tableName)
              .select(column)
              .limit(0);
            result[column] = !colError || colError.code !== '42703';
          } catch {
            result[column] = false;
          }
        }
      } else {
        // Other error - assume columns don't exist
        columns.forEach(col => result[col] = false);
      }
    } catch {
      columns.forEach(col => result[col] = false);
    }

    this.columnCache.set(cacheKey, result);
    return result;
  }

  /**
   * Get safe field list for a table query
   * @param {string} tableName - Table name
   * @param {string[]} desiredFields - Fields we want to select
   * @returns {Promise<string>} - Safe select string
   */
  async getSafeSelectFields(tableName, desiredFields) {
    const exists = await this.columnsExist(tableName, desiredFields);
    const safeFields = desiredFields.filter(field => exists[field]);
    return safeFields.length > 0 ? safeFields.join(', ') : '*';
  }

  /**
   * Create safe upsert data object
   * @param {string} tableName - Table name
   * @param {Object} data - Data object to clean
   * @returns {Promise<Object>} - Cleaned data object
   */
  async getSafeUpsertData(tableName, data) {
    const fields = Object.keys(data);
    const exists = await this.columnsExist(tableName, fields);
    
    const safeData = {};
    Object.entries(data).forEach(([key, value]) => {
      if (exists[key]) {
        safeData[key] = value;
      }
    });
    
    return safeData;
  }

  /**
   * Clear caches (useful for testing or schema changes)
   */
  clearCache() {
    this.tableCache.clear();
    this.columnCache.clear();
  }
}

export const schemaValidator = new SchemaValidator();
export default schemaValidator;
