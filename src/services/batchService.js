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

  /**
   * Activate a scanned batch for the user and update stats
   * - Normalizes batch identifier (UUID or QR code or URL)
   * - Prevents double-activation
   * - Marks order as activated
   * - Updates user_stats: increments total_bags and total_batches
   * @param {string} batchIdentifier - Batch UUID, QR code string, or URL
   * @param {string} userId - User ID
   * @returns {Object} Activation result with updated counts
   */
  async activateBatchForUser(batchIdentifier, userId) {
    try {
      if (!batchIdentifier || !userId) {
        throw new Error('Batch identifier and user ID are required');
      }

      // Helpers (duplicated here to avoid cross-scope access)
      const isUUID = (str) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(str || ''));
      const normalizeIdentifier = (input) => {
        const s = String(input || '').trim();
        if (!s) return s;
        try {
          if (s.startsWith('http://') || s.startsWith('https://')) {
            const u = new URL(s);
            const parts = u.pathname.split('/').filter(Boolean);
            return parts[parts.length - 1] || s;
          }
        } catch (_) {}
        return s;
      };

      const normalized = normalizeIdentifier(batchIdentifier);
      console.log('[BatchService] Activating batch. Raw:', batchIdentifier, 'Normalized:', normalized);

      // Look up the batch order by id or batch_qr_code
      let batch = null;
      if (isUUID(normalized)) {
        const res = await supabase
          .from('bag_orders')
          .select('*')
          .eq('id', normalized)
          .single();
        if (res.error) throw res.error;
        batch = res.data;
      } else {
        const res = await supabase
          .from('bag_orders')
          .select('*')
          .eq('batch_qr_code', normalized)
          .maybeSingle();
        if (res.error) throw res.error;
        batch = res.data;
      }

      if (!batch) {
        throw new Error('Batch not found for provided identifier');
      }
      if (batch.user_id !== userId) {
        throw new Error('This batch is not assigned to the current user');
      }

      // Prevent double-activation
      if (batch.status && ['activated', 'used'].includes(String(batch.status).toLowerCase())) {
        return { data: { alreadyActivated: true }, error: null };
      }

      // Count bags in this batch
      const bagCountRes = await supabase
        .from('bag_inventory')
        .select('id', { count: 'exact', head: true })
        .eq('batch_id', batch.id);
      if (bagCountRes.error) throw bagCountRes.error;
      const bagCount = bagCountRes.count || 0;

      // Mark the batch order as activated
      const updateOrderRes = await supabase
        .from('bag_orders')
        .update({ status: 'activated', activated_at: new Date().toISOString() })
        .eq('id', batch.id)
        .select()
        .single();
      if (updateOrderRes.error) throw updateOrderRes.error;

      // Fetch current user_stats
      const statsRes = await supabase
        .from('user_stats')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
      if (statsRes.error && statsRes.error.code !== 'PGRST116') throw statsRes.error;

      const currentBags = statsRes.data?.total_bags || 0;
      const currentBatches = statsRes.data?.total_batches || 0;

      // Upsert updated totals
      const newTotals = {
        user_id: userId,
        total_bags: currentBags + bagCount,
        total_batches: currentBatches + 1,
        updated_at: new Date().toISOString(),
      };
      const upsertRes = await supabase
        .from('user_stats')
        .upsert(newTotals)
        .select()
        .single();
      if (upsertRes.error) throw upsertRes.error;

      console.log('[BatchService] Activated batch and updated stats:', newTotals);
      return { data: { activated: true, ...newTotals }, error: null };

    } catch (error) {
      console.error('[BatchService] Error in activateBatchForUser:', error);
      return {
        data: null,
        error: {
          message: error.message || 'Failed to activate batch',
          code: error.code || 'ACTIVATE_BATCH_ERROR'
        }
      };
    }
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

      // Helpers: UUID check and identifier normalization (handles URLs)
      const isUUID = (str) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(str || ''));

      const normalizeIdentifier = (input) => {
        const s = String(input || '').trim();
        if (!s) return s;
        // If it's a URL, extract the last non-empty path segment
        try {
          if (s.startsWith('http://') || s.startsWith('https://')) {
            const u = new URL(s);
            const parts = u.pathname.split('/').filter(Boolean);
            return parts[parts.length - 1] || s;
          }
        } catch (_) {
          // Not a valid URL, fall through
        }
        return s;
      };

      const normalized = normalizeIdentifier(batchId);
      console.log('[BatchService] Fetching batch details. Raw:', batchId, 'Normalized:', normalized);

      // Decide which column to query based on identifier format
      let batch = null;
      let batchError = null;

      if (isUUID(normalized)) {
        const res = await supabase
          .from('bag_orders')
          .select('*')
          .eq('id', normalized)
          .single();
        batch = res.data;
        batchError = res.error;
      } else {
        // Try matching against the batch QR/code column for non-UUID identifiers
        const res = await supabase
          .from('bag_orders')
          .select('*')
          .eq('batch_qr_code', normalized)
          .maybeSingle();
        batch = res.data;
        batchError = res.error;
      }

      if (batchError) {
        console.error('[BatchService] Error fetching batch:', batchError);
        throw batchError;
      }

      if (!batch) {
        throw new Error('Batch not found for provided identifier');
      }

      const { data: bags, error: bagsError } = await supabase
        .from('bag_inventory')
        .select('*')
        .eq('batch_id', batch.id);

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
