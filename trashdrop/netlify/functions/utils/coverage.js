/**
 * Service coverage for WhatsApp bookings.
 *
 * Server-side mirror of src/services/serviceCoverageService.js: a pin is covered
 * when it lies within an active pricing zone's service_radius_km, as decided by
 * the check_service_coverage RPC. The booking flow refuses uncovered pins at the
 * location step, exactly as the app's LocationStep does.
 */

// PostgREST / Postgres codes for "this function does not exist". Seen only while
// the functions are deployed ahead of the migration; the check is skipped
// rather than refusing every booking.
const MISSING_FUNCTION_CODES = ['PGRST202', '42883'];

/**
 * @returns {Promise<{status: 'covered'|'not_covered'|'unavailable', zone: Object|null}>}
 *   covered     — zone is the zone serving this point
 *   not_covered — zone is the nearest service area (null if none is known)
 *   unavailable — the check failed; ask the customer to try again
 */
async function checkServiceCoverage(supabase, latitude, longitude) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { status: 'not_covered', zone: null };
  }

  try {
    const { data, error } = await supabase.rpc('check_service_coverage', {
      p_latitude: lat,
      p_longitude: lng,
    });

    if (error) {
      if (MISSING_FUNCTION_CODES.includes(error.code)) {
        console.warn('[Coverage] check_service_coverage is not deployed; skipping the coverage check');
        return { status: 'covered', zone: null };
      }
      throw new Error(error.message);
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return { status: 'not_covered', zone: null };

    const zone = {
      id: row.zone_id,
      region: row.region,
      district: row.district,
      community: row.community,
      suburb: row.suburb,
      distance_km: row.distance_km != null ? Number(row.distance_km) : null,
      service_radius_km: row.service_radius_km != null ? Number(row.service_radius_km) : null,
    };

    return { status: row.is_covered ? 'covered' : 'not_covered', zone };
  } catch (err) {
    console.error('[Coverage] Coverage check failed:', err.message);
    return { status: 'unavailable', zone: null };
  }
}

/** The chat message for a pin outside every service area. */
function notCoveredMessage(zone) {
  const nearest = zone && zone.suburb && zone.distance_km != null
    ? `The nearest area we serve is *${zone.suburb}*, about ${Math.round(zone.distance_km)} km away.\n\n`
    : '';

  return (
    "🚧 *We haven't started operating here yet*\n\n" +
    "TrashDrop doesn't have collectors at this location yet, so we can't take a pickup request here. " +
    "We're expanding and hope to reach your area soon.\n\n" +
    nearest +
    "If you pinned the wrong spot, share your bin's location again. Reply CANCEL to stop."
  );
}

module.exports = {
  checkServiceCoverage,
  notCoveredMessage,
};
