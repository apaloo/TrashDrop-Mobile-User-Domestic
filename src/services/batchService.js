/**
 * Batch service for handling batch QR codes and bag inventory
 * Manages the relationship between batches, bags, and QR codes
 */

import supabase from '../utils/supabaseClient.js';
import offlineStorageAPI, { addToSyncQueue, removeFromSyncQueue, isOnline } from '../utils/offlineStorage.js';

export const batchService = {
  // ---- Runtime helpers (timeout/retry + local cache for scanned batches) ----
  _DEFAULT_TIMEOUT_MS: 10000,
  _DEFAULT_MAX_RETRIES: 3,
  _LOCAL_CACHE_KEY: 'td_scanned_batches',
  _USER_ACCOUNT_TABLE: 'user_stats',
  _BATCH_TABLE: 'batches',
  _BAGS_TABLE: 'bags',

  _withTimeout(promise, ms = 10000) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('Request timed out')), ms);
      promise
        .then((v) => { clearTimeout(t); resolve(v); })
        .catch((e) => { clearTimeout(t); reject(e); });
    });
  },

  /**
   * Fetch user account row (available_bags, scanned_batches, totals)
   */
  async getUserAccount(userId) {
    const { data, error } = await supabase
      .from(this._USER_ACCOUNT_TABLE)
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error && error.code !== 'PGRST116') return { data: null, error };
    return { data: data || null, error: null };
  },

  /**
   * Update user account after successful verification
   * - increments available_bags and total_bags_scanned
   * - appends batch_id to scanned_batches (unique)
   */
  async updateUserAccountAfterBatch(userId, batchId, bagsToAdd) {
    const { data: acct, error: acctErr } = await this.getUserAccount(userId);
    if (acctErr) return { data: null, error: acctErr };

    const scanned = Array.isArray(acct?.scanned_batches) ? acct.scanned_batches : [];
    if (scanned.includes(batchId)) {
      return { data: { duplicate: true }, error: null };
    }

    const updated = {
      user_id: userId,
      available_bags: (acct?.available_bags || 0) + (bagsToAdd || 0),
      total_bags_scanned: (acct?.total_bags_scanned || 0) + (bagsToAdd || 0),
      scanned_batches: [...new Set([...scanned, batchId])],
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from(this._USER_ACCOUNT_TABLE)
      .upsert(updated, { onConflict: 'user_id' })
      .select()
      .single();
    if (error) return { data: null, error };
    return { data, error: null };
  },

  /**
   * Verify batch in new 'batch' table according to requirements
   * - batch_id match, is_certified = true
   * Returns { id, batch_id, total_bags_count }
   */
  async verifyBatchInPrimaryTable(batchIdRaw) {
    const batchId = String(batchIdRaw || '').trim();
    if (!batchId) return { data: null, error: { message: 'Invalid batch id' } };
    // In the actual schema, the table is 'batches' with id (UUID) and batch_number (text)
    let row = null;
    try {
      // If UUID, match by id, else by batch_number with fallbacks
      const isUUID = (str) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(str || ''));
      if (isUUID(batchId)) {
        const res = await supabase.from(this._BATCH_TABLE).select('*').eq('id', batchId).limit(1);
        if (res.error) return { data: null, error: res.error };
        row = Array.isArray(res.data) ? res.data[0] : null;
      } else {
        // Try exact, then ilike, then contains
        let res = await supabase.from(this._BATCH_TABLE).select('*').eq('batch_number', batchId).limit(1);
        if (res.error) return { data: null, error: res.error };
        row = Array.isArray(res.data) ? res.data[0] : null;
        if (!row) {
          res = await supabase.from(this._BATCH_TABLE).select('*').ilike('batch_number', batchId).limit(1);
          if (res.error) return { data: null, error: res.error };
          row = Array.isArray(res.data) ? res.data[0] : null;
        }
        if (!row) {
          res = await supabase.from(this._BATCH_TABLE).select('*').ilike('batch_number', `%${batchId}%`).limit(1);
          if (res.error) return { data: null, error: res.error };
          row = Array.isArray(res.data) ? res.data[0] : null;
        }
      }
    } catch (e) {
      return { data: null, error: { message: e?.message || 'Batch lookup failed' } };
    }
    if (!row) return { data: null, error: { message: 'Batch not recognized' } };

    return { data: {
      id: row.id,
      // Canonical identifier is the primary key UUID
      batch_id: row.id,
      total_bags_count: row.bag_count || 0,
      is_certified: true,
      created_at: row.created_at,
    }, error: null };
  },

  /**
   * Full verification and account update flow per requirements.
   */
  async verifyBatchAndUpdateUser(batchIdRaw, userId, options = {}) {
    const timeoutMs = options.timeoutMs ?? this._DEFAULT_TIMEOUT_MS;
    const maxRetries = options.maxRetries ?? this._DEFAULT_MAX_RETRIES;

    // Local-first duplicate prevention
    if (this.isBatchLocallyScanned(batchIdRaw)) {
      return { data: null, error: { message: 'Batch already scanned', code: 'BATCH_DUPLICATE' } };
    }

    // Delegate to main activation flow which already updates user_stats and handles retries/timeouts
    const res = await this.activateBatchForUserWithRetry(batchIdRaw, userId, { timeoutMs, maxRetries });
    if (res.error) {
      return { data: null, error: res.error, attempts: res.attempts, timedOut: res.timedOut };
    }
    return { data: { ...res.data, bagsAdded: res.data?.bags_added || 0 }, error: null, attempts: res.attempts };
  },

  /**
   * Scan a batch in primary 'batches' table and fetch associated 'bags'.
   * Requires status === 'active'. Returns { batch, bags }.
   */
  async scanBatchAndFetchBags(batchIdentifier) {
    const normalize = (s) => String(s || '').trim();
    const idRaw = normalize(batchIdentifier);
    if (!idRaw) return { data: null, error: { message: 'Invalid batch identifier', code: 'BATCH_INVALID' } };
    const isUUID = (str) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(str || ''));

    let batch = null;
    try {
      if (isUUID(idRaw)) {
        const r = await supabase.from(this._BATCH_TABLE).select('*').eq('id', idRaw).maybeSingle();
        if (r.error && r.error.code !== 'PGRST116') return { data: null, error: r.error };
        batch = r.data || null;
      } else {
        const cands = [idRaw, /^batch-/i.test(idRaw) ? idRaw.replace(/^batch-/i, '') : `BATCH-${idRaw}`];
        for (const cand of cands) {
          const r = await supabase.from(this._BATCH_TABLE).select('*').eq('batch_number', cand).limit(1);
          if (r.error) return { data: null, error: r.error };
          const found = Array.isArray(r.data) ? r.data[0] : null;
          if (found) { batch = found; break; }
        }
      }
    } catch (e) {
      return { data: null, error: { message: e?.message || 'Lookup failed' } };
    }

    if (!batch) return { data: null, error: { message: 'Batch not found', code: 'BATCH_INVALID' } };
    const statusVal = String(batch.status || '').toLowerCase();
    if (statusVal && statusVal !== 'active') {
      return { data: null, error: { message: 'Batch is not active', code: 'BATCH_INACTIVE' } };
    }

    // Fetch associated bags
    let bags = [];
    try {
      const br = await supabase.from(this._BAGS_TABLE).select('*').eq('batch_id', batch.id);
      if (br.error) {
        // If bags table unavailable, fallback to zero or batch.bag_count as virtual
        bags = Array(Number(batch.bag_count || 0)).fill(null).map((_, i) => ({ id: `virtual-${i+1}`, batch_id: batch.id }));
      } else {
        bags = Array.isArray(br.data) ? br.data : [];
      }
    } catch (_) {
      bags = Array(Number(batch.bag_count || 0)).fill(null).map((_, i) => ({ id: `virtual-${i+1}`, batch_id: batch.id }));
    }

    // Cache locally for offline parity
    try {
      await offlineStorageAPI.cacheBatch(batch);
      await offlineStorageAPI.cacheBags(batch.id, bags);
    } catch (_) {}

    return { data: { batch, bags }, error: null };
  },

  /**
   * Enqueue a batch activation to be processed when online.
   */
  async enqueueBatchActivation(batchIdentifier, userId) {
    const op = {
      operation: 'batch_activation',
      storeName: 'sync_queue',
      data: { batchIdentifier, userId },
      createdAt: new Date().toISOString()
    };
    try {
      await addToSyncQueue(op);
      this.markBatchLocallyScanned(batchIdentifier, { userId, queued: true });
      this._ensureOnlineSyncListener();
      return { data: { queued: true }, error: null };
    } catch (e) {
      return { data: null, error: { message: e?.message || 'Failed to enqueue activation' } };
    }
  },

  _onlineListenerAttached: false,
  _ensureOnlineSyncListener() {
    if (this._onlineListenerAttached || typeof window === 'undefined') return;
    window.addEventListener('online', () => {
      this.processActivationQueue();
    });
    this._onlineListenerAttached = true;
  },

  /**
   * Process queued batch activations (called when coming online or manually).
   */
  async processActivationQueue(limit = 10) {
    if (!isOnline()) return { processed: 0 };
    // Read all sync_queue entries and filter in-memory to our type
    let processed = 0;
    try {
      // Reuse IndexedDB directly via offlineStorageAPI internals is not exposed; instead, read pending reports is separate.
      // We'll open the DB similarly by calling a light wrapper through addToSyncQueue/removeFromSyncQueue is not enough.
      // Here, we access the DB by importing default offlineStorageAPI which carries init through its exported functions.
      const db = await (async () => {
        // Hacky: piggyback on an operation to ensure DB open
        try { await addToSyncQueue({ operation: 'noop', storeName: 'sync_queue', data: { ts: Date.now() }, createdAt: new Date().toISOString() }); } catch (_) {}
        // Now open explicitly using indexedDB (same name/version). We replicate constants to avoid exporting internals.
        return new Promise((resolve, reject) => {
          const request = indexedDB.open('trashdrop_offline_db', 4);
          request.onsuccess = (e) => resolve(e.target.result);
          request.onerror = (e) => reject(e.target.error);
        });
      })();

      const tx = db.transaction(['sync_queue'], 'readwrite');
      const store = tx.objectStore('sync_queue');
      const getAllReq = store.getAll();
      const entries = await new Promise((res, rej) => {
        getAllReq.onsuccess = () => res(getAllReq.result || []);
        getAllReq.onerror = (ev) => rej(ev.target.error);
      });
      const queue = entries.filter((e) => e.operation === 'batch_activation').slice(0, limit);

      for (const item of queue) {
        const { batchIdentifier, userId } = item.data || {};
        const result = await this.activateBatchForUserWithRetry(batchIdentifier, userId, { ignoreLocalDuplicate: true });
        if (!result.error) {
          await removeFromSyncQueue(item.id);
          processed += 1;
          // Broadcast realtime UI update similar to scanner success flow
          try {
            const bagsAdded = Number(result?.data?.bags_added || 0);
            if (bagsAdded && typeof window !== 'undefined') {
              const evt = new CustomEvent('trashdrop:bags-updated', {
                detail: { userId, deltaBags: bagsAdded, source: 'batch-scan-sync' }
              });
              window.dispatchEvent(evt);
            }
          } catch (_) {}
        }
      }
      return { processed };
    } catch (e) {
      console.warn('[BatchService] processActivationQueue failed:', e);
      return { processed };
    }
  },

  _sleep(ms) { return new Promise((r) => setTimeout(r, ms)); },

  _getLocalScanCache() {
    try {
      const raw = localStorage.getItem(this._LOCAL_CACHE_KEY);
      return raw ? JSON.parse(raw) : { items: {}, updatedAt: Date.now() };
    } catch (_) {
      return { items: {}, updatedAt: Date.now() };
    }
  },

  _setLocalScanCache(cache) {
    try { localStorage.setItem(this._LOCAL_CACHE_KEY, JSON.stringify(cache)); } catch (_) {}
  },

  isBatchLocallyScanned(identifier) {
    const key = String(identifier || '').trim();
    if (!key) return false;
    const cache = this._getLocalScanCache();
    return !!cache.items[key];
  },

  markBatchLocallyScanned(identifier, meta = {}) {
    const key = String(identifier || '').trim();
    if (!key) return;
    const cache = this._getLocalScanCache();
    cache.items[key] = { scannedAt: Date.now(), ...meta };
    cache.updatedAt = Date.now();
    this._setLocalScanCache(cache);
  },

  clearLocalScan(identifier) {
    const key = String(identifier || '').trim();
    if (!key) return;
    const cache = this._getLocalScanCache();
    if (cache.items[key]) {
      delete cache.items[key];
      cache.updatedAt = Date.now();
      this._setLocalScanCache(cache);
    }
  },

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
      const isNumericId = (str) => /^\d+$/.test(String(str || ''));
      const normalizeIdentifier = (input) => {
        let s = String(input || '').trim();
        if (!s) return s;
        // URL-decode common encodings
        try { s = decodeURIComponent(s); } catch (_) {}
        // If custom scheme (e.g., trashdrop://), coerce to https for parsing
        const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(s);
        const isHttp = /^https?:\/\//i.test(s);
        try {
          if (hasScheme) {
            const parseStr = isHttp ? s : s.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, 'https://');
            const u = new URL(parseStr);
            const qpKeys = ['code', 'batch', 'batch_id', 'batchCode', 'qr', 'id', 'batchNumber', 'batch_qr_code'];
            for (const k of qpKeys) {
              const v = u.searchParams.get(k);
              if (v) return String(v).trim();
            }
            const parts = u.pathname.split('/').filter(Boolean);
            const seg = parts[parts.length - 1] || s;
            const segDec = (() => { try { return decodeURIComponent(seg); } catch { return seg; } })();
            const batchMatchSeg = segDec.match(/BATCH-[A-Za-z0-9_-]+/i);
            if (batchMatchSeg) return batchMatchSeg[0];
            const uuidMatchSeg = segDec.match(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
            if (uuidMatchSeg) return uuidMatchSeg[0];
            return String(segDec).trim();
          }
        } catch (_) {}
        // Prefer batch token anywhere in string, else UUID, else first token sans punctuation
        const batchMatch = s.match(/BATCH-[A-Za-z0-9_-]+/i);
        if (batchMatch) return batchMatch[0];
        const uuidMatch = s.match(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
        if (uuidMatch) return uuidMatch[0];
        const firstToken = s.split(/\s+/)[0];
        return firstToken.replace(/[\s,;]+$/g, '');
      };

      const normalized = normalizeIdentifier(batchIdentifier);
      console.log('[BatchService] Activating batch. Raw:', batchIdentifier, 'Normalized:', normalized, 'Path:', isUUID(normalized) ? 'id' : 'code');

      // Auth diagnostics to verify real user session/token is present for RLS
      try {
        const { data: { session } } = await supabase.auth.getSession();
        console.log('[BatchService][Auth]', {
          hasSession: !!session,
          userId: session?.user?.id || null,
          tokenPresent: !!session?.access_token
        });
      } catch (e) {
        console.warn('[BatchService][Auth] getSession failed:', e?.message || e);
      }

      // Batches-only path: batches/bags are the sole source of truth
      let batch = null;
      const source = 'batches';

      // Helper to build candidate codes (BATCH- prefix variants)
      const buildCandidates = (value) => {
        const candidates = [];
        const pushUnique = (v) => { if (v && !candidates.includes(v)) candidates.push(v); };
        pushUnique(value);
        if (/^batch-/i.test(value)) {
          pushUnique(value.replace(/^batch-/i, ''));
        } else {
          pushUnique(`BATCH-${value}`);
        }
        return candidates;
      };

      console.log('[BatchService] Identifier candidates:', buildCandidates(normalized));

      // Look up in 'batches' by id (UUID) or batch_number (text)
      try {
        if (isUUID(normalized)) {
          const res = await supabase.from('batches').select('*').eq('id', normalized).limit(1);
          if (res.error) throw res.error;
          batch = Array.isArray(res.data) ? res.data[0] : null;
        } else {
          for (const cand of buildCandidates(normalized)) {
            const res = await supabase.from('batches').select('*').eq('batch_number', cand).limit(1);
            if (res.error) throw res.error;
            const found = Array.isArray(res.data) ? res.data[0] : null;
            if (found) { batch = found; break; }
          }
          // Case-insensitive fallback
          if (!batch) {
            for (const cand of buildCandidates(normalized)) {
              const res = await supabase.from('batches').select('*').ilike('batch_number', cand).limit(1);
              if (res.error) throw res.error;
              const found = Array.isArray(res.data) ? res.data[0] : null;
              if (found) { batch = found; break; }
            }
            // Wildcard contains fallback
            if (!batch) {
              for (const cand of buildCandidates(normalized)) {
                const res = await supabase.from('batches').select('*').ilike('batch_number', `%${cand}%`).limit(1);
                if (res.error) throw res.error;
                const found = Array.isArray(res.data) ? res.data[0] : null;
                if (found) { batch = found; break; }
              }
            }
          }
        }
        // batch found if not null
      } catch (e) {
        console.warn('[BatchService] batches lookup failed:', e?.message || e);
      }

      if (!batch) {
        console.warn('[BatchService] No direct match in batches. Attempting server-side verification...');
        // Policy-safe server-side verification via Netlify Function
        try {
          const qs = isUUID(normalized)
            ? `id=${encodeURIComponent(normalized)}`
            : `batch_number=${encodeURIComponent(normalized)}`;
          const resp = await fetch(`/.netlify/functions/check-batch?${qs}`, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
          });
          if (resp.ok) {
            const payload = await resp.json();
            if (payload?.data?.id) {
              batch = payload.data;
              console.log('[BatchService] Server-side verification succeeded via', payload?.meta?.by);
            }
          } else {
            console.warn('[BatchService] Server-side verification HTTP', resp.status);
          }
        } catch (e) {
          console.warn('[BatchService] Server-side verification failed:', e?.message || e);
        }

        if (!batch) {
          console.warn('[BatchService] No batch match in batches for candidates:', buildCandidates(normalized));
          throw new Error('Batch not found in batches table for provided identifier');
        }
      }

      // Ownership check: batches.created_by
      const ownerId = batch.created_by;
      if (ownerId && ownerId !== userId) {
        throw new Error('This batch is not assigned to the current user');
      }

      // Prevent double-activation/scan and enforce active status for new schema
      const statusVal = String(batch.status || '').toLowerCase();
      const alreadyUsed = ['activated', 'used', 'scanned', 'completed'].includes(statusVal);
      if (alreadyUsed) {
        return { data: { alreadyActivated: true }, error: null };
      }
      if (source === 'batches' && statusVal && statusVal !== 'active') {
        return { data: null, error: { message: 'Batch is not active', code: 'BATCH_INACTIVE' } };
      }

      // Count and fetch bags: only 'bags' table is used; fallback to batch.bag_count as virtual
      let bagCount = 0;
      let bagsList = [];
      try {
        const bagsRes = await supabase
          .from(this._BAGS_TABLE)
          .select('*')
          .eq('batch_id', batch.id);
        if (bagsRes.error) throw bagsRes.error;
        bagsList = Array.isArray(bagsRes.data) ? bagsRes.data : [];
        bagCount = bagsList.length;
      } catch (e) {
        // Fallback to batches.bag_count if 'bags' table doesn't exist
        bagCount = Number(batch.bag_count || 0);
        bagsList = Array(bagCount).fill(null).map((_, i) => ({ id: `virtual-${i+1}`, batch_id: batch.id }));
      }

      // Mark batch as used/scanned in 'batches' only and cache locally
      const updateRes = await supabase
        .from('batches')
        .update({ status: 'used', updated_at: new Date().toISOString() })
        .eq('id', batch.id)
        .select()
        .single();
      if (updateRes.error) throw updateRes.error;
      try { await offlineStorageAPI.cacheBatch(batch); await offlineStorageAPI.cacheBags(batch.id, bagsList); } catch (_) {}

      // Update user_stats for Dashboard realtime
      const statsRes = await supabase
        .from('user_stats')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
      if (statsRes.error && statsRes.error.code !== 'PGRST116') throw statsRes.error;

      const currentBags = statsRes.data?.total_bags || 0;
      const currentBatches = statsRes.data?.total_batches || 0;
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

      console.log('[BatchService] Activated batch and updated stats (batches):', newTotals);
      return { data: { activated: true, bags_added: bagCount, bags: bagsList, batch_id: batch.id, ...newTotals }, error: null };

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

  /**
   * Wrapper: activate a batch with timeout and retries. Local-first duplicate prevention.
   * @param {string} batchIdentifier
   * @param {string} userId
   * @param {{timeoutMs?: number, maxRetries?: number, onAttempt?: (n:number)=>void}} options
   * @returns {Promise<{data: any, error: any, attempts: number, timedOut?: boolean}>}
   */
  async activateBatchForUserWithRetry(batchIdentifier, userId, options = {}) {
    const timeoutMs = options.timeoutMs ?? this._DEFAULT_TIMEOUT_MS;
    const maxRetries = options.maxRetries ?? this._DEFAULT_MAX_RETRIES;

    // Local duplicate prevention (can be bypassed for queued processing)
    if (!options.ignoreLocalDuplicate && this.isBatchLocallyScanned(batchIdentifier)) {
      return { data: { alreadyActivated: true, local: true }, error: null, attempts: 0 };
    }

    let lastErr = null;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (typeof options.onAttempt === 'function') options.onAttempt(attempt);
        const res = await this._withTimeout(this.activateBatchForUser(batchIdentifier, userId), timeoutMs);
        if (!res?.error) {
          // Mark locally to prevent re-scan spam; attach small meta
          this.markBatchLocallyScanned(batchIdentifier, { userId, success: true });
          return { ...res, attempts: attempt };
        }
        lastErr = res.error;
      } catch (e) {
        lastErr = { message: e?.message || 'Unknown error', code: e?.code || 'ACTIVATE_RETRY_ERROR' };
      }

      // Exponential backoff between attempts
      if (attempt < maxRetries) {
        const backoff = Math.min(1500 * Math.pow(2, attempt - 1), 5000);
        await this._sleep(backoff);
      }
    }

    // Final failure; do not mark cache as success but remember attempt
    return {
      data: null,
      error: lastErr || { message: 'Failed to activate batch after retries', code: 'ACTIVATE_RETRY_FAILED' },
      attempts: maxRetries,
      timedOut: (lastErr?.message || '').toLowerCase().includes('timed out')
    };
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

      // Helpers: UUID/numeric checks and identifier normalization (handles URLs and custom schemes)
      const isUUID = (str) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(str || ''));
      const isNumericId = (str) => /^\d+$/.test(String(str || ''));
      const normalizeIdentifier = (input) => {
        let s = String(input || '').trim();
        if (!s) return s;
        // URL-decode if encoded
        try { s = decodeURIComponent(s); } catch (_) {}
        // Parse URLs including custom schemes (e.g., trashdrop://)
        const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(s);
        const isHttp = /^https?:\/\//i.test(s);
        try {
          if (hasScheme) {
            const parseStr = isHttp ? s : s.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, 'https://');
            const u = new URL(parseStr);
            // Prefer common query parameters if present
            const qpKeys = ['code', 'batch', 'batch_id', 'batchCode', 'qr', 'id', 'batchNumber', 'batch_qr_code'];
            for (const k of qpKeys) {
              const v = u.searchParams.get(k);
              if (v) return String(v).trim();
            }
            // Fallback to last non-empty path segment
            const parts = u.pathname.split('/').filter(Boolean);
            const seg = parts[parts.length - 1] || s;
            const segDec = (() => { try { return decodeURIComponent(seg); } catch { return seg; } })();
            const batchMatchSeg = segDec.match(/BATCH-[A-Za-z0-9_-]+/i);
            if (batchMatchSeg) return batchMatchSeg[0];
            const uuidMatchSeg = segDec.match(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
            if (uuidMatchSeg) return uuidMatchSeg[0];
            return String(segDec).trim();
          }
        } catch (_) {}
        // Prefer BATCH token anywhere, else UUID, else first token sans punctuation
        const batchMatch2 = s.match(/BATCH-[A-Za-z0-9_-]+/i);
        if (batchMatch2) return batchMatch2[0];
        const uuidMatch2 = s.match(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
        if (uuidMatch2) return uuidMatch2[0];
        const first = s.split(/\s+/)[0];
        return first.replace(/[\s,;]+$/g, '');
      };

      const normalized = normalizeIdentifier(batchId);
      console.log('[BatchService] Fetching batch details. Raw:', batchId, 'Normalized:', normalized, 'Path:', isUUID(normalized) ? 'id' : 'code');

      // New primary path: try dedicated 'batch' table first per requirements
      try {
        const primary = await this.verifyBatchInPrimaryTable(normalized);
        if (!primary.error && primary.data) {
          // No bags table tied here; construct normalized object
          const normalizedData = {
            id: primary.data.id,
            batch_qr_code: primary.data.batch_id,
            user_id: null, // unknown in primary table
            status: 'verified',
            created_at: primary.data.created_at,
            bags: Array((primary.data.total_bags_count || 0)).fill({}).map((_, i) => ({ id: `virtual-${i+1}` })),
          };
          return { data: normalizedData, error: null };
        }
      } catch (e) {
        console.warn('[BatchService] primary batch lookup failed, falling back:', e?.message || e);
      }

      // Auth diagnostics to verify real user session/token is present for RLS
      try {
        const { data: { session } } = await supabase.auth.getSession();
        console.log('[BatchService][Auth]', {
          hasSession: !!session,
          userId: session?.user?.id || null,
          tokenPresent: !!session?.access_token
        });
      } catch (e) {
        console.warn('[BatchService][Auth] getSession failed (details):', e?.message || e);
      }

      // Try 'batches' first (new schema), then fallback to 'bag_orders' (legacy)
      let batch = null;
      let source = null;
      let batchError = null;

      const buildCandidates = (value) => {
        const candidates = [];
        const pushUnique = (v) => { if (v && !candidates.includes(v)) candidates.push(v); };
        pushUnique(value);
        if (/^batch-/i.test(value)) {
          pushUnique(value.replace(/^batch-/i, ''));
        } else {
          pushUnique(`BATCH-${value}`);
        }
        return candidates;
      };

      console.log('[BatchService] Identifier candidates (details):', buildCandidates(normalized));

      // 1) Try batches by id (UUID) or batch_number
      try {
        if (isUUID(normalized)) {
          const res = await supabase.from('batches').select('*').eq('id', normalized).limit(1);
          batch = Array.isArray(res.data) ? res.data[0] : null;
          batchError = res.error || null;
        } else {
          for (const cand of buildCandidates(normalized)) {
            const res = await supabase.from('batches').select('*').eq('batch_number', cand).limit(1);
            if (res.error) { batchError = res.error; break; }
            const found = Array.isArray(res.data) ? res.data[0] : null;
            if (found) { batch = found; break; }
          }
          if (!batch && !batchError) {
            for (const cand of buildCandidates(normalized)) {
              const res = await supabase.from('batches').select('*').ilike('batch_number', cand).limit(1);
              if (res.error) { batchError = res.error; break; }
              const found = Array.isArray(res.data) ? res.data[0] : null;
              if (found) { batch = found; break; }
            }
            // Wildcard contains fallback
            if (!batch && !batchError) {
              for (const cand of buildCandidates(normalized)) {
                const res = await supabase.from('batches').select('*').ilike('batch_number', `%${cand}%`).limit(1);
                if (res.error) { batchError = res.error; break; }
                const found = Array.isArray(res.data) ? res.data[0] : null;
                if (found) { batch = found; break; }
              }
            }
          }
        }
        if (batch) source = 'batches';
      } catch (e) {
        console.warn('[BatchService] batches lookup failed (details):', e?.message || e);
      }

      // 2) Fallback to bag_orders by id or batch_qr_code
      if (!batch && !batchError) {
        if (isUUID(normalized)) {
          const res = await supabase.from('bag_orders').select('*').eq('id', normalized).limit(1);
          batch = Array.isArray(res.data) ? res.data[0] : null;
          batchError = res.error || null;
        } else if (isNumericId(normalized)) {
          console.log('[BatchService] bag_orders numeric-id lookup (details)');
          const res = await supabase.from('bag_orders').select('*').eq('id', Number(normalized)).limit(1);
          batch = Array.isArray(res.data) ? res.data[0] : null;
          batchError = res.error || null;
        } else {
          for (const cand of buildCandidates(normalized)) {
            const res = await supabase.from('bag_orders').select('*').eq('batch_qr_code', cand).limit(1);
            if (res.error) { batchError = res.error; break; }
            const found = Array.isArray(res.data) ? res.data[0] : null;
            if (found) { batch = found; break; }
          }
          if (!batch && !batchError) {
            for (const cand of buildCandidates(normalized)) {
              let res = await supabase.from('bag_orders').select('*').ilike('batch_qr_code', cand).limit(1);
              if (res.error) { batchError = res.error; break; }
              let found = Array.isArray(res.data) ? res.data[0] : null;
              if (found) { batch = found; break; }
              res = await supabase.from('bag_orders').select('*').ilike('batch_qr_code', `%${cand}%`).limit(1);
              if (res.error) { batchError = res.error; break; }
              found = Array.isArray(res.data) ? res.data[0] : null;
              if (found) { batch = found; break; }
            }
          }
        }
        if (batch) source = 'bag_orders';
      }

      if (batchError) {
        console.error('[BatchService] Error fetching batch:', batchError);
        throw batchError;
      }

      if (!batch) {
        console.warn('[BatchService] No batch match for candidates (details):', buildCandidates(normalized));
        throw new Error('Batch not found for provided identifier');
      }

      // Fetch associated bags based on source
      let bags = [];
      if (source === 'batches') {
        const bagsRes = await supabase.from('bags').select('*').eq('batch_id', batch.id);
        if (bagsRes.error) {
          console.error('[BatchService] Error fetching bags (batches):', bagsRes.error);
          throw bagsRes.error;
        }
        bags = bagsRes.data || [];
      } else {
        const bagsRes = await supabase.from('bag_inventory').select('*').eq('batch_id', batch.id);
        if (bagsRes.error) {
          console.error('[BatchService] Error fetching bags (bag_inventory):', bagsRes.error);
          throw bagsRes.error;
        }
        bags = bagsRes.data || [];
      }

      // Normalize fields for UI compatibility
      const normalizedData = {
        ...batch,
        batch_qr_code: source === 'batches' ? (batch.batch_number || batch.batch_name || batch.id) : batch.batch_qr_code,
        user_id: source === 'batches' ? batch.created_by : batch.user_id,
        bags
      };

      return { data: normalizedData, error: null };

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
