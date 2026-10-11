import { areaFromAddress, dumpingService } from '../dumpingService.js';
import supabase from '../../utils/supabaseClient.js';

jest.mock('../../utils/supabaseClient.js', () => ({ __esModule: true, default: { from: jest.fn() } }));
jest.mock('../toastService.js', () => ({ toastService: { success: jest.fn(), error: jest.fn() } }));
jest.mock('../syncService.js', () => ({ __esModule: true, default: {} }));
jest.mock('../photoUploadService.js', () => ({ uploadPhotos: jest.fn() }));
jest.mock('../../utils/retryUtils.js', () => ({ retrySupabaseOperation: (fn) => fn() }));

const nominatim = { address: { road: 'Main St', suburb: 'Pokuase', state: 'Greater Accra Region', country: 'Ghana' } };

// Records every insert and lets a test decide each insert's result
const mockInserts = (results) => {
  const inserted = [];
  supabase.from.mockImplementation(() => ({
    insert: (rows) => {
      inserted.push(JSON.parse(JSON.stringify(rows[0])));
      const result = results.shift() || { data: [{ id: 'r1' }], error: null };
      return { select: () => Promise.resolve(result) };
    },
  }));
  return inserted;
};

const reportData = { coordinates: { latitude: 5.6726, longitude: -0.2809 }, waste_type: 'mixed', severity: 'low', photos: [] };

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(nominatim) });
});

describe('areaFromAddress', () => {
  it('builds "Town, Region"', () => {
    expect(areaFromAddress({ city: 'Kumasi', state: 'Ashanti Region' })).toBe('Kumasi, Ashanti Region');
    expect(areaFromAddress({ suburb: 'Pokuase', state: 'Greater Accra Region' })).toBe('Pokuase, Greater Accra Region');
    expect(areaFromAddress({ city: 'Accra', state: 'Accra' })).toBe('Accra');
    expect(areaFromAddress({})).toBeNull();
  });
});

describe('createReport area_name', () => {
  it('stores the area name with a new report', async () => {
    const inserted = mockInserts([]);
    const res = await dumpingService.createReport('user-1', reportData);
    expect(res.error).toBeNull();
    expect(inserted[0].area_name).toBe('Pokuase, Greater Accra Region');
    expect(inserted[0].location).toBe('Main St, Pokuase, Greater Accra Region, Ghana');
  });

  it('still submits when the area_name column does not exist yet', async () => {
    const inserted = mockInserts([{ data: null, error: { message: "Could not find the 'area_name' column of 'illegal_dumping_mobile' in the schema cache", code: 'PGRST204' } }]);
    const res = await dumpingService.createReport('user-1', reportData);
    expect(res.error).toBeNull();
    expect(inserted).toHaveLength(2);
    expect(inserted[1].area_name).toBeUndefined();
  });

  it('submits without an area name when geocoding fails', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('offline'));
    const inserted = mockInserts([]);
    const res = await dumpingService.createReport('user-1', reportData);
    expect(res.error).toBeNull();
    expect(inserted[0].area_name).toBeUndefined();
    expect(inserted[0].location).toBe('Unknown location');
  });
});
