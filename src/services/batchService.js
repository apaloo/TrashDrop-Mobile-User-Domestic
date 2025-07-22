/**
 * Batch service for handling batch QR codes and bag inventory
 * Manages the relationship between batches, bags, and QR codes
 */

import supabase from '../utils/supabaseClient.js';

export const batchService = {
  /**
   * Create a new batch of bags
   * @param {string} userId - User ID creating the batch
   * @param {number} quantity - Number of bags in batch
   * @param {string} bagType - Type of bags (plastic, paper, etc)
   * @param {string} size - Size of bags (optional)
   * @returns {Object} Created batch with QR code
   */
  async createBatch(userId, quantity, bagType, size = null) {
    try {
      if (!userId || !quantity || !bagType) {
        throw new Error('User ID, quantity, and bag type are required');
      }

      console.log('[BatchService] Creating new batch:', { userId, quantity, bagType });

      // First create the batch order
      const { data: batchOrder, error: batchError } = await supabase
        .from('bag_orders')
        .insert({
          user_id: userId,
          bag_type: bagType,
          quantity: quantity,
          status: 'pending',
          batch_qr_code: `BATCH-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          points_used: 0
        })
        .select()
        .single();

      if (batchError) {
        console.error('[BatchService] Error creating batch order:', batchError);
        throw batchError;
      }

      // Then create individual bags in the inventory
      const bagInventoryItems = Array(quantity).fill().map(() => ({
        user_id: userId,
        batch_id: batchOrder.id,
        batch_code: batchOrder.batch_qr_code,
        bag_type: bagType,
        status: 'available',
        scan_date: new Date().toISOString()
      }));

      const { data: bags, error: bagsError } = await supabase
        .from('bag_inventory')
        .insert(bagInventoryItems)
        .select();

      if (bagsError) {
        console.error('[BatchService] Error creating bag inventory:', bagsError);
        throw bagsError;
      }

      console.log('[BatchService] Successfully created batch:', batchOrder.id);
      return {
        data: {
          ...batchOrder,
          bags: bags
        },
        error: null
      };

    } catch (error) {
      console.error('[BatchService] Error in createBatch:', error);
      return {
        data: null,
        error: {
          message: error.message || 'Failed to create batch',
          code: error.code || 'CREATE_BATCH_ERROR'
        }
      };
    }
  },

  /**
   * Get batch details including all bags
   * @param {string} batchId - Batch ID
   * @returns {Object} Batch details with bags
   */
  async getBatchDetails(batchId) {
    try {
      if (!batchId) {
        throw new Error('Batch ID is required');
      }

      console.log('[BatchService] Fetching batch details:', batchId);

      const { data: batch, error: batchError } = await supabase
        .from('bag_orders')
        .select('*')
        .eq('id', batchId)
        .single();

      if (batchError) {
        console.error('[BatchService] Error fetching batch:', batchError);
        throw batchError;
      }

      const { data: bags, error: bagsError } = await supabase
        .from('bag_inventory')
        .select('*')
        .eq('batch_id', batchId);

      if (bagsError) {
        console.error('[BatchService] Error fetching bags:', bagsError);
        throw bagsError;
      }

      return {
        data: {
          ...batch,
          bags: bags || []
        },
        error: null
      };

    } catch (error) {
      console.error('[BatchService] Error in getBatchDetails:', error);
      return {
        data: null,
        error: {
          message: error.message || 'Failed to get batch details',
          code: error.code || 'GET_BATCH_ERROR'
        }
      };
    }
  },

  /**
   * Record a bag scan event
   * @param {string} bagId - Bag ID
   * @param {string} scannerId - User ID of scanner
   * @param {Object} location - Location data {text, coordinates}
   * @param {string} status - Scan status
   * @returns {Object} Created scan record
   */
  async recordBagScan(bagId, scannerId, location, status) {
    try {
      if (!bagId || !scannerId) {
        throw new Error('Bag ID and scanner ID are required');
      }

      console.log('[BatchService] Recording bag scan:', { bagId, scannerId });

      const { data: scan, error: scanError } = await supabase
        .from('scans')
        .insert({
          bag_id: bagId,
          scanned_by: scannerId,
          location: location?.text,
          coordinates: location?.coordinates,
          status: status || 'scanned',
          scanned_at: new Date().toISOString()
        })
        .select()
        .single();

      if (scanError) {
        console.error('[BatchService] Error recording scan:', scanError);
        throw scanError;
      }

      // Update bag inventory status
      const { error: updateError } = await supabase
        .from('bag_inventory')
        .update({
          status: 'scanned',
          scan_date: new Date().toISOString()
        })
        .eq('id', bagId);

      if (updateError) {
        console.error('[BatchService] Error updating bag status:', updateError);
        throw updateError;
      }

      console.log('[BatchService] Successfully recorded scan:', scan.id);
      return { data: scan, error: null };

    } catch (error) {
      console.error('[BatchService] Error in recordBagScan:', error);
      return {
        data: null,
        error: {
          message: error.message || 'Failed to record bag scan',
          code: error.code || 'RECORD_SCAN_ERROR'
        }
      };
    }
  },

  /**
   * Get scan history for a bag
   * @param {string} bagId - Bag ID
   * @returns {Object} Array of scan records
   */
  async getBagScanHistory(bagId) {
    try {
      if (!bagId) {
        throw new Error('Bag ID is required');
      }

      console.log('[BatchService] Fetching scan history for bag:', bagId);

      const { data, error } = await supabase
        .from('scans')
        .select(`
          id,
          scanned_by,
          location,
          coordinates,
          status,
          notes,
          scanned_at,
          created_at
        `)
        .eq('bag_id', bagId)
        .order('scanned_at', { ascending: false });

      if (error) {
        console.error('[BatchService] Error fetching scan history:', error);
        throw error;
      }

      return { data: data || [], error: null };

    } catch (error) {
      console.error('[BatchService] Error in getBagScanHistory:', error);
      return {
        data: [],
        error: {
          message: error.message || 'Failed to get scan history',
          code: error.code || 'GET_HISTORY_ERROR'
        }
      };
    }
  }
};

export default batchService;
