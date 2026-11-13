import { reverseGeocode, coordinateDescription, NOMINATIM_EMAIL } from '../reverseGeocode.js';

const ok = (body) => ({ ok: true, json: async () => body });
const fail = { ok: false, json: async () => ({}) };
const route = (handlers) => jest.fn(async (url) => {
  const h = Object.entries(handlers).find(([host]) => url.includes(host));
  if (!h) throw new Error(`unexpected request to ${url}`);
  return typeof h[1] === 'function' ? h[1](url) : h[1];
});

afterEach(() => { delete global.fetch; });

describe('reverseGeocode (TD9: one geocoder, no Google)', () => {
  test('Nominatim answers: its display name and address parts, with our contact email', async () => {
    global.fetch = route({ 'nominatim.openstreetmap.org': ok({ display_name: 'Main St, Pokuase, Accra, Ghana', address: { road: 'Main St', suburb: 'Pokuase' } }) });
    const r = await reverseGeocode(5.6726, -0.2809);
    expect(r).toEqual({ source: 'nominatim', displayName: 'Main St, Pokuase, Accra, Ghana', address: { road: 'Main St', suburb: 'Pokuase' } });
    const url = global.fetch.mock.calls[0][0];
    expect(url).toContain('lat=5.6726&lon=-0.2809');
    expect(url).toContain(`email=${encodeURIComponent(NOMINATIM_EMAIL)}`);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('Nominatim with parts but no display name builds one', async () => {
    global.fetch = route({ 'nominatim.openstreetmap.org': ok({ address: { road: 'Ring Rd', town: 'Tema', country: 'Ghana' } }) });
    expect((await reverseGeocode(5.67, -0.01)).displayName).toBe('Ring Rd, Tema, Ghana');
  });

  test('Nominatim down or empty: BigDataCloud, mapped to the same field names', async () => {
    for (const nominatim of [fail, ok({ error: 'Unable to geocode' })]) {
      global.fetch = route({
        'nominatim.openstreetmap.org': nominatim,
        'api.bigdatacloud.net': ok({ locality: 'Madina', city: 'Accra', principalSubdivision: 'Greater Accra', countryName: 'Ghana' }),
      });
      expect(await reverseGeocode(5.68, -0.16)).toEqual({
        source: 'bigdatacloud',
        displayName: 'Madina, Accra, Greater Accra, Ghana',
        address: { suburb: 'Madina', city: 'Accra', state: 'Greater Accra', country: 'Ghana' },
      });
    }
  });

  test('a country alone is not an address; nothing found is null', async () => {
    global.fetch = route({ 'nominatim.openstreetmap.org': fail, 'api.bigdatacloud.net': ok({ countryName: 'Ghana' }) });
    expect(await reverseGeocode(5.6, -0.2)).toBeNull();
    global.fetch = jest.fn(async () => { throw new Error('offline'); });
    expect(await reverseGeocode(5.6, -0.2)).toBeNull();
  });

  test('bad coordinates make no request', async () => {
    global.fetch = jest.fn();
    for (const [lat, lng] of [[null, 1], [NaN, 1], ['5.6', '-0.2'], [5.6, undefined]]) expect(await reverseGeocode(lat, lng)).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('never calls Google or geocode.maps.co', async () => {
    global.fetch = route({ 'nominatim.openstreetmap.org': fail, 'api.bigdatacloud.net': fail });
    await reverseGeocode(5.6, -0.2);
    global.fetch.mock.calls.forEach(([url]) => expect(url).not.toMatch(/googleapis|maps\.co/));
  });
});

describe('coordinateDescription', () => {
  test('uses the right hemispheres (eastern Ghana is east of 0°)', () => {
    expect(coordinateDescription(5.6037, -0.187)).toBe('Near 5.6037°N, 0.1870°W');
    expect(coordinateDescription(6.6, 0.47)).toBe('Near 6.6000°N, 0.4700°E');
    expect(coordinateDescription(-1, 0)).toBe('Near 1.0000°S, 0.0000°E');
  });
});
