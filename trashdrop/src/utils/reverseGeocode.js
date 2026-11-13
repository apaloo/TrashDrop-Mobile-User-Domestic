/**
 * The household app's one reverse geocoder: coordinates → a readable address
 * (TD9, one map stack). OpenStreetMap Nominatim first, BigDataCloud when
 * Nominatim has nothing; both are free and need no key. Google and
 * geocode.maps.co are no longer used (maps.co needs a key we never had, so
 * those calls always failed).
 *
 * Nominatim's usage policy asks apps to identify themselves; a browser can't
 * set User-Agent, so the contact address goes in the `email` parameter.
 */
export const NOMINATIM_EMAIL = 'support@trashdrops.com';

const getJson = async (url) => {
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
};

const isCoordinate = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * @param {number} latitude
 * @param {number} longitude
 * @returns {Promise<{source: 'nominatim'|'bigdatacloud', displayName: string, address: object}|null>}
 *   `address` uses Nominatim's field names (road, suburb, city, state,
 *   country, …) whichever service answered; null when neither did.
 */
export async function reverseGeocode(latitude, longitude) {
  if (!isCoordinate(latitude) || !isCoordinate(longitude)) return null;

  const osm = await getJson(
    `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}` +
    `&addressdetails=1&email=${encodeURIComponent(NOMINATIM_EMAIL)}`
  );
  if (osm && (osm.display_name || (osm.address && Object.keys(osm.address).length))) {
    const address = osm.address || {};
    const fromParts = [address.road, address.suburb, address.city || address.town || address.village, address.country]
      .filter(Boolean).join(', ');
    const displayName = osm.display_name || fromParts;
    if (displayName) return { source: 'nominatim', displayName, address };
  }

  const bdc = await getJson(
    `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`
  );
  if (bdc) {
    const address = {
      suburb: bdc.locality || undefined,
      city: bdc.city && bdc.city !== bdc.locality ? bdc.city : undefined,
      state: bdc.principalSubdivision || undefined,
      country: bdc.countryName || undefined,
    };
    const parts = [address.suburb, address.city, address.state, address.country].filter(Boolean);
    // A country alone doesn't help anyone find the place
    if (parts.length > 1 || (parts.length === 1 && !address.country)) {
      return { source: 'bigdatacloud', displayName: parts.join(', '), address };
    }
  }
  return null;
}

/** "Near 5.6037°N, 0.1870°W" for when no service knows the place */
export const coordinateDescription = (latitude, longitude) =>
  `Near ${Math.abs(latitude).toFixed(4)}°${latitude >= 0 ? 'N' : 'S'}, ${Math.abs(longitude).toFixed(4)}°${longitude >= 0 ? 'E' : 'W'}`;
