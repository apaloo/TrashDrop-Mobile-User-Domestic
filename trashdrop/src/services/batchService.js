/**
 * Batch service for handling batch QR codes and bag inventory
 * Manages the relationship between batches, bags, and QR codes
 */

import supabase from '../utils/supabaseClient.js';
import offlineStorageAPI, { addToSyncQueue, removeFromSyncQueue, isOnline, getSyncQueueByOperation } from '../utils/offlineStorage.js';
import batchDiagnostics from '../utils/batchDiagnostics.js';

// Base URL for serverless functions. Use direct connection in development to bypass proxy issues
const FUNCTIONS_BASE = process.env.NODE_ENV === 'development' 
  ? 'http://localhost:9999/.netlify/functions'  
  : (process.env.REACT_APP_FUNCTIONS_URL || '/.netlify/functions').replace(/\/$/, '');

// ilike with no wildcards is a case-insensitive exact match, but _ and %
// are LIKE wildcards, so escape them (and the escape character). Batch codes
// are matched exactly, never by "contains": a partial code must not pick
// another batch (TD36; check-batch does the same on the server).
export const likeExact = (value) => String(value).replace(/[\\%_]/g, (c) => `\\${c}`);

export const batchService = {
  // ---- Runtime helpers (timeout/retry) ----
  _DEFAULT_TIMEOUT_MS: 45000,
  _DEFAULT_MAX_RETRIES: 3,
  _BAGS_TABLE: 'bags',

  _withTimeout(promise, ms = 45000) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('Request timed out')), ms);
      promise
        .then((v) => { clearTimeout(t); resolve(v); })
        .catch((e) => { clearTimeout(t); reject(e); });
    });
  },

  /**
   * Full verification and account update flow per requirements.
   */
  async verifyBatchAndUpdateUser(batchIdRaw, userId, options = {}) {
    const timeoutMs = options.timeoutMs ?? this._DEFAULT_TIMEOUT_MS;
    const maxRetries = options.maxRetries ?? this._DEFAULT_MAX_RETRIES;

    console.log('[BatchService] Direct database verification for batch:', batchIdRaw);

    // Direct database verification - no local caching or duplicate prevention
    // Let the database handle duplicate detection through constraints
    const res = await this.activateBatchForUserWithRetry(batchIdRaw, userId, { timeoutMs, maxRetries });
    if (res.error) {
      return { data: null, error: res.error, attempts: res.attempts, timedOut: res.timedOut };
    }
    return { data: { ...res.data, bagsAdded: res.data?.bags_added || 0 }, error: null, attempts: res.attempts };
  },

  // Queue processing removed - direct database integration only

  _sleep(ms) { return new Promise((r) => setTimeout(r, ms)); },

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
          // Exact, ignoring case
          if (!batch) {
            for (const cand of buildCandidates(normalized)) {
              const res = await supabase.from('batches').select('*').ilike('batch_number', likeExact(cand)).limit(1);
              if (res.error) throw res.error;
              const found = Array.isArray(res.data) ? res.data[0] : null;
              if (found) { batch = found; break; }
            }
          }
        }
        // batch found if not null
      } catch (e) {
        console.warn('[BatchService] batches lookup failed:', e?.message || e);
      }

      if (!batch) {
        console.warn('[BatchService] No direct match in batches. Trying QR code field lookup...');
        
        // Skip QR code field lookup since it doesn't exist in current schema
        console.log('[BatchService] Skipping qr_code field lookup - not implemented in current schema');
      }

      if (!batch) {
        // Not visible to this user (an unclaimed batch belongs to whoever printed it):
        // ask check-batch, which looks it up with the service key, exact matches only
        // Policy-safe server-side verification via Netlify Function
        try {
          const qs = isUUID(normalized)
            ? `id=${encodeURIComponent(normalized)}`
            : `batch_number=${encodeURIComponent(normalized)}`;
          // Abortable fetch to avoid hanging connections
          const controller = new AbortController();
          const fetchTimeout = setTimeout(() => controller.abort('function_fetch_timeout'), 8000); // Reduced timeout
          // check-batch only answers signed-in users
          const { data: { session: fnSession } = {} } = await supabase.auth.getSession();
          const resp = await fetch(`${FUNCTIONS_BASE}/check-batch?${qs}`, {
            method: 'GET',
            headers: {
              'Accept': 'application/json',
              ...(fnSession?.access_token ? { 'Authorization': `Bearer ${fnSession.access_token}` } : {}),
            },
            signal: controller.signal,
          });
          clearTimeout(fetchTimeout);
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
          console.warn('[BatchService] Server-side verification failed:', e?.name === 'AbortError' ? 'aborted (timeout)' : (e?.message || e));
        }

        if (!batch) {
          throw new Error('Batch not found in batches table for provided identifier');
        }
      }

      // Enhanced ownership check with flexible matching across multiple potential owner fields
      const ownerIdRaw = batch.created_by;
      const ownerId = ownerIdRaw ? String(ownerIdRaw).trim() : ownerIdRaw;
      const userIdNorm = String(userId || '').trim();
      
      // Check all possible ownership fields
      const possibleOwnerFields = {
        created_by: batch.created_by ?? null,
        user_id: batch.user_id ?? null,
        assigned_to: batch.assigned_to ?? null,
        owner_id: batch.owner_id ?? null
      };
      
      // Early return for already-used batches — no ownership check needed (read-only)
      // But still update the scanning user's stats so dashboard reflects the bags
      const statusValEarly = String(batch.status || '').toLowerCase();
      const alreadyUsed = ['activated', 'used', 'scanned', 'completed'].includes(statusValEarly);
      if (alreadyUsed) {
        console.log('[BatchService] Batch already used/activated, returning info without ownership check');
        const bagCount = batch.bag_count || batch.total_bags_count || 0;
        // Stats were already updated during first activation — do NOT re-increment here
        // (Dashboard reads from user_stats directly as fallback when the view is empty)
        return { data: { alreadyActivated: true, batch_id: batch.id, bag_count: bagCount, status: batch.status, created_at: batch.created_at, batch_number: batch.batch_number }, error: null };
      }

      // Log the ownership validation attempt
      try {
        console.log('[BatchService][Ownership] Checking batch ownership', {
          batchId: batch.id,
          batch_number: batch.batch_number || null,
          userIdRaw: userId,
          userId: userIdNorm,
          ownerIdRaw,
          ownerId,
          possibleOwnerFields,
          status: batch.status
        });
      } catch (_) {}
      
      // More permissive definition of "unassigned" batches
      // Consider a batch unassigned if ANY of the following is true:
      // 1. All ownership fields are null/undefined/empty
      // 2. The primary owner field (created_by) is null/undefined/empty
      // 3. Any ownership field contains special values indicating a public batch
      const isNullOrEmpty = (val) => val === null || val === undefined || String(val || '').trim() === '';
      
      // Check if batch is unassigned (no owner) or has a "public" indicator
      const isUnassigned = (
        // All owner fields are empty
        (isNullOrEmpty(possibleOwnerFields.created_by) && 
         isNullOrEmpty(possibleOwnerFields.user_id) && 
         isNullOrEmpty(possibleOwnerFields.assigned_to) && 
         isNullOrEmpty(possibleOwnerFields.owner_id))
        // OR created_by is empty (primary owner field)
        || isNullOrEmpty(possibleOwnerFields.created_by)
        // OR any field has public/unassigned indicator
        || ['public', 'unassigned', 'unclaimed'].some(term => 
             Object.values(possibleOwnerFields).some(val => 
               val && String(val).toLowerCase().includes(term)
             )
           )
      );
      
      // Special case for development/testing
      const isDevEnvironment = process.env.NODE_ENV === 'development';
      
      // Check if user ID matches any of the potential owner fields
      const ownershipMatch = userIdNorm === ownerId || 
        userIdNorm === String(possibleOwnerFields.user_id || '').trim() || 
        userIdNorm === String(possibleOwnerFields.assigned_to || '').trim() || 
        userIdNorm === String(possibleOwnerFields.owner_id || '').trim();
      
      // Allow batch claim in the following cases:
      // 1. Batch is unassigned (no owner)
      // 2. User ID matches one of the owner fields 
      // 3. In development environment (relaxed validation)
      // 4. Batch is active and can be claimed (typical for distribution)
      
      const isActiveAndClaimable = batch.status === 'active' && !['completed', 'used', 'scanned', 'activated'].includes(String(batch.status || '').toLowerCase());
      
      // Track if we need to assign ownership to the claiming user
      let shouldAssignOwnership = false;
      
      if (isUnassigned) {
        console.log('[BatchService][Ownership] Batch has no owner, allowing claim');
        shouldAssignOwnership = true;
        // Continue without error - let anyone claim unassigned batches
      } else if (ownershipMatch) {
        console.log('[BatchService][Ownership] User is the owner of this batch');
        // Continue without error - user owns this batch
      } else if (isDevEnvironment && isActiveAndClaimable) {
        console.log('[BatchService][Ownership] Development mode: Allowing claim of active batch by any user');
        shouldAssignOwnership = true;
        // Continue without error - in development, allow claiming active batches
      } else if (isActiveAndClaimable) {
        console.log('[BatchService][Ownership] Active batch available for claim, allowing scan by any user');
        shouldAssignOwnership = true;
        // Continue without error - allow any user to claim active batches
      } else {
        console.warn('[BatchService][Ownership] Ownership validation failed', { 
          ownerId, 
          userId: userIdNorm, 
          batchId: batch.id,
          possibleOwnerFields,
          isUnassigned,
          ownershipMatch,
          isDevEnvironment,
          isActiveAndClaimable
        });
        throw new Error('This batch is not assigned to the current user');
      }
      
      // Assign ownership to the claiming user if needed
      if (shouldAssignOwnership && !ownershipMatch) {
        try {
          console.log('[BatchService][Ownership] Assigning batch ownership to claiming user:', { batchId: batch.id, userId: userIdNorm });
          const { error: updateError } = await supabase
            .from('batches')
            .update({ created_by: userId, updated_at: new Date().toISOString() })
            .eq('id', batch.id);
          
          if (updateError) {
            console.warn('[BatchService][Ownership] Failed to update batch ownership (non-fatal):', updateError);
          } else {
            console.log('[BatchService][Ownership] Successfully assigned batch to user');
            batch.created_by = userId; // Update local copy
          }
        } catch (err) {
          console.warn('[BatchService][Ownership] Error updating batch ownership (non-fatal):', err);
        }
      }




      // Enforce active status for new schema (alreadyUsed already handled above)
      const statusVal = String(batch.status || '').toLowerCase();
      
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

      // Use database function to activate batch (bypasses RLS issues)
      console.log('[BatchService] Activating batch via database function:', { batchId: batch.id, currentStatus: batch.status, userId });

      const { data: functionResult, error: functionError } = await supabase.rpc('activate_batch_for_user', {
        p_batch_id: batch.id,
        p_user_id: userId
      });
      
      console.log('[BatchService] Function result:', functionResult);
      
      if (functionError) {
        console.error('[BatchService] Database function error:', functionError);
        throw functionError;
      }
      
      if (functionResult?.error) {
        console.error('[BatchService] Batch activation failed:', functionResult);
        throw new Error(functionResult.message || 'Batch activation failed');
      }
      
      // Update local batch object with function result
      batch.status = 'used';
      batch.updated_at = functionResult.activated_at;
      bagCount = functionResult.bag_count || bagCount;
      try { await offlineStorageAPI.cacheBatch(batch); await offlineStorageAPI.cacheBags(batch.id, bagsList); } catch (_) {}

      // activate_batch_for_user updates this user's own stats (TD48, migration
      // 20261112104437); refresh_all_user_stats is server-only.
      console.log('[BatchService] Batch activated successfully via RPC.');
      // Note: UI event dispatch (trashdrop:bags-updated) is handled by BatchQRScanner component
      return { data: { activated: true, bags_added: bagCount, bag_count: bagCount, bags: bagsList, batch_id: batch.id }, error: null };

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

    console.log('[BatchService] Direct database activation for batch:', batchIdentifier);

    // Direct database activation - no local caching or duplicate prevention
    let lastErr = null;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (typeof options.onAttempt === 'function') options.onAttempt(attempt);
        const res = await this._withTimeout(this.activateBatchForUser(batchIdentifier, userId), timeoutMs);
        if (!res?.error) {
          console.log('[BatchService] Batch activated successfully:', batchIdentifier);
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

    // Final failure
    console.error('[BatchService] Failed to activate batch after retries:', batchIdentifier, lastErr);
    return {
      data: null,
      error: lastErr || { message: 'Failed to activate batch after retries', code: 'ACTIVATE_RETRY_FAILED' },
      attempts: maxRetries,
      timedOut: (lastErr?.message || '').toLowerCase().includes('timed out')
    };
  },

};

export default batchService;
