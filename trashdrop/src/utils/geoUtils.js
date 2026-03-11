/**
 * Shared geospatial utilities for parsing PostGIS coordinates
 * and extracting pickup locations across the app.
 */

/**
 * Parse PostGIS POINT format to {latitude, longitude}
 * Handles: WKT POINT(lng lat), EWKB hex, GeoJSON, and plain coordinate objects.
 * @param {string|object} pointData - PostGIS string, GeoJSON object, or {lat,lng}/{latitude,longitude} object
 * @returns {Object|null} - {latitude, longitude} or null
 */
export function parsePostGISPoint(pointData) {
  if (!pointData) return null;

  // Handle object formats (GeoJSON, {latitude,longitude}, {lat,lng})
  if (typeof pointData === 'object') {
    // GeoJSON Point: { type: "Point", coordinates: [lng, lat] }
    if (pointData.type === 'Point' && Array.isArray(pointData.coordinates) && pointData.coordinates.length >= 2) {
      return {
        latitude: parseFloat(pointData.coordinates[1]),
        longitude: parseFloat(pointData.coordinates[0])
      };
    }
    // { latitude, longitude }
    if (pointData.latitude != null && pointData.longitude != null) {
      return { latitude: parseFloat(pointData.latitude), longitude: parseFloat(pointData.longitude) };
    }
    // { lat, lng }
    if (pointData.lat != null && pointData.lng != null) {
      return { latitude: parseFloat(pointData.lat), longitude: parseFloat(pointData.lng) };
    }
    return null;
  }

  if (typeof pointData !== 'string') return null;

  // EWKB hex format (starts with 0101000020)
  if (pointData.match(/^0101000020/i)) {
    try {
      const coordHex = pointData.substring(18);
      if (coordHex.length < 32) return null;

      const lngHex = coordHex.substring(0, 16);
      const latHex = coordHex.substring(16, 32);

      const lngBuffer = new ArrayBuffer(8);
      const lngView = new DataView(lngBuffer);
      for (let i = 0; i < 8; i++) {
        lngView.setUint8(i, parseInt(lngHex.substring(i * 2, i * 2 + 2), 16));
      }
      const longitude = lngView.getFloat64(0, true);

      const latBuffer = new ArrayBuffer(8);
      const latView = new DataView(latBuffer);
      for (let i = 0; i < 8; i++) {
        latView.setUint8(i, parseInt(latHex.substring(i * 2, i * 2 + 2), 16));
      }
      const latitude = latView.getFloat64(0, true);

      if (isNaN(latitude) || isNaN(longitude) || !isFinite(latitude) || !isFinite(longitude)) return null;
      if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;

      return { latitude, longitude };
    } catch (err) {
      console.error('[geoUtils] Error parsing EWKB:', err);
      return null;
    }
  }

  // WKT POINT(lng lat) format
  const match = pointData.match(/POINT\s*\(\s*([+-]?\d+\.?\d*)\s+([+-]?\d+\.?\d*)\s*\)/i);
  if (match) {
    return {
      latitude: parseFloat(match[2]),
      longitude: parseFloat(match[1])
    };
  }

  return null;
}

/**
 * Extract a {lat, lng} location from an active pickup object.
 * Tries coordinates string → location string → location object → array formats.
 * @param {Object} pickup - Active pickup object with location/coordinates fields
 * @returns {Object|null} - {lat, lng} or null
 */
export function getPickupLatLng(pickup) {
  if (!pickup) return null;

  // Priority 1: coordinates string (PostGIS POINT from database)
  if (typeof pickup.coordinates === 'string') {
    const parsed = parsePostGISPoint(pickup.coordinates);
    if (parsed) return { lat: parsed.latitude, lng: parsed.longitude };
  }

  // Priority 2: location string (PostGIS POINT)
  if (typeof pickup.location === 'string') {
    const parsed = parsePostGISPoint(pickup.location);
    if (parsed) return { lat: parsed.latitude, lng: parsed.longitude };
  }

  // Priority 3: location object with latitude/longitude (digital bins)
  if (pickup.location?.latitude && pickup.location?.longitude) {
    return { lat: parseFloat(pickup.location.latitude), lng: parseFloat(pickup.location.longitude) };
  }

  // Priority 4: coordinates array [lat, lng]
  if (Array.isArray(pickup.coordinates) && pickup.coordinates.length === 2) {
    return { lat: pickup.coordinates[0], lng: pickup.coordinates[1] };
  }

  // Priority 5: location array [lat, lng]
  if (Array.isArray(pickup.location) && pickup.location.length === 2) {
    return { lat: pickup.location[0], lng: pickup.location[1] };
  }

  return null;
}

/**
 * Convert {lat, lng} to {latitude, longitude} format (for calculateETA etc.)
 * @param {Object} latLng - {lat, lng}
 * @returns {Object|null} - {latitude, longitude} or null
 */
export function toLatitudeLongitude(latLng) {
  if (!latLng || latLng.lat == null || latLng.lng == null) return null;
  return { latitude: latLng.lat, longitude: latLng.lng };
}

/**
 * Format a distance value for display.
 * Input: meters if < 1000, km (with 1 decimal) if >= 1000 from calculateETA.
 * @param {number} distance - Distance value from calculateETA
 * @returns {string} Formatted distance string like "250m" or "1.5km"
 */
export function formatDistance(distance) {
  if (typeof distance !== 'number' || isNaN(distance) || !isFinite(distance) || distance <= 0) return '';
  // calculateETA returns meters for < 1km (integer like 250, 500)
  // and km with 1 decimal for >= 1km (like 1.5, 2.3)
  // Heuristic: if value >= 1000, it's meters; otherwise check if it has decimal
  if (distance >= 1000) {
    // This is meters — convert to km
    return `${(distance / 1000).toFixed(1)}km`;
  }
  // Values < 1000 could be meters (e.g., 250) or km (e.g., 1.5)
  // calculateETA returns km as values like 1.5, 2.3 — always < ~100
  // and meters as integers like 50, 250, 999
  // Best check: if it has a decimal, it's km
  if (distance % 1 !== 0) {
    return `${distance}km`;
  }
  return `${distance}m`;
}
