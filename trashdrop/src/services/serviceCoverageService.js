/**
 * Service Coverage
 * Answers "does TrashDrop operate at this point?" before a request is built.
 *
 * Backed by the check_service_coverage RPC: a pin is covered when it lies within
 * an active pricing zone's service_radius_km. The WhatsApp booking flow runs the
 * same check in netlify/functions/utils/coverage.js.
 */

import supabase from '../utils/supabaseClient.js';

const RPC_TIMEOUT_MS = 8000;

// PostgREST / Postgres codes for "this function does not exist". Seen only while
// the app is deployed ahead of the migration; the check is skipped rather than
// blocking every booking.
const MISSING_FUNCTION_CODES = ['PGRST202', '42883'];

const withTimeout = (promise, timeoutMs) => Promise.race([
  promise,
  new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Coverage check timed out')), timeoutMs)
  )
]);

/**
 * Check whether a location is inside TrashDrop's service area
 *
 * @param {number} latitude - GPS latitude
 * @param {number} longitude - GPS longitude
 * @returns {Promise<{status: 'covered'|'not_covered'|'unavailable', zone: Object|null}>}
 *   covered     — zone is the zone serving this point
 *   not_covered — zone is the nearest service area (null if none is known)
 *   unavailable — the check failed; let the user retry rather than proceed
 */
export const checkServiceCoverage = async (latitude, longitude) => {
  if (latitude == null || longitude == null || isNaN(latitude) || isNaN(longitude)) {
    return { status: 'not_covered', zone: null };
  }

  try {
    const { data, error } = await withTimeout(
      supabase.rpc('check_service_coverage', {
        p_latitude: latitude,
        p_longitude: longitude
      }),
      RPC_TIMEOUT_MS
    );

    if (error) {
      if (MISSING_FUNCTION_CODES.includes(error.code)) {
        console.warn('[Coverage] check_service_coverage is not deployed; skipping the coverage check');
        return { status: 'covered', zone: null };
      }
      throw new Error(error.message || 'Database error');
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row) {
      return { status: 'not_covered', zone: null };
    }

    const zone = {
      id: row.zone_id,
      region: row.region,
      district: row.district,
      community: row.community,
      suburb: row.suburb,
      distance_km: row.distance_km != null ? parseFloat(row.distance_km) : null,
      service_radius_km: row.service_radius_km != null ? parseFloat(row.service_radius_km) : null
    };

    return { status: row.is_covered ? 'covered' : 'not_covered', zone };
  } catch (error) {
    console.error('[Coverage] Coverage check failed:', error.message);
    return { status: 'unavailable', zone: null };
  }
};

export default { checkServiceCoverage };
