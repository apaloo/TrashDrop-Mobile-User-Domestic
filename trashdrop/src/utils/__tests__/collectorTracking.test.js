import supabase from '../supabaseClient.js';
import { calculateETA, subscribeToCollectorLocation } from '../realtime.js';
import { formatDistance } from '../geoUtils.js';
import { notificationService } from '../../services/notificationService.js';

jest.mock('../supabaseClient.js', () => ({
  __esModule: true,
  default: { channel: jest.fn(), removeChannel: jest.fn(), from: jest.fn() }
}));

// Records each realtime channel's handler so a test can push a payload through it
const channels = [];
beforeEach(() => {
  jest.clearAllMocks();
  channels.length = 0;
  supabase.channel.mockImplementation((name) => {
    const channel = { name };
    channel.on = jest.fn((type, filter, handler) => { channel.handler = handler; return channel; });
    channel.subscribe = jest.fn(() => channel);
    channels.push(channel);
    return channel;
  });
});

describe('distance units', () => {
  const pickup = { latitude: 5.6037, longitude: -0.1870 };

  it('returns distance in meters at every range', () => {
    const near = calculateETA(pickup, { latitude: 5.6047, longitude: -0.1870 }); // ~111 m
    const far = calculateETA(pickup, { latitude: 5.6387, longitude: -0.1870 }); // ~3.9 km

    expect(near.distance).toBeGreaterThan(100);
    expect(near.distance).toBeLessThan(120);
    expect(far.distance).toBeGreaterThan(3800);
    expect(far.distance).toBeLessThan(4000);
  });

  it('formats meters as m below 1 km and km above', () => {
    expect(formatDistance(250)).toBe('250m');
    expect(formatDistance(3900)).toBe('3.9km');
    // whole kilometres used to come back as 2 and show as "2m"
    expect(formatDistance(2000)).toBe('2.0km');
  });
});

describe('subscribeToCollectorLocation', () => {
  const send = (channel, row) => channel.handler({ new: row });

  it('uses current_latitude/current_longitude and does not require is_online', () => {
    const onUpdate = jest.fn();
    subscribeToCollectorLocation('collector-1', 'job-1', onUpdate);

    send(channels[0], {
      current_latitude: '5.61', current_longitude: '-0.19',
      // stale point left behind by an update that only wrote lat/lng
      current_location: 'POINT(0 0)',
      is_online: false,
      location_updated_at: '2026-10-22T10:00:00Z'
    });

    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({
      location: { latitude: 5.61, longitude: -0.19 },
      lastUpdate: '2026-10-22T10:00:00Z'
    }));
  });

  it('gives each caller its own channel', () => {
    const first = jest.fn();
    const second = jest.fn();
    subscribeToCollectorLocation('collector-1', 'job-1', first);
    subscribeToCollectorLocation('collector-1', 'job-1', second);

    expect(channels).toHaveLength(2);
    send(channels[1], { current_latitude: '5.6', current_longitude: '-0.18' });
    expect(second).toHaveBeenCalled();
  });
});

describe('notificationService', () => {
  it('reads the user\'s notifications table and maps read to status', async () => {
    const query = {
      select: jest.fn(() => query),
      eq: jest.fn(() => query),
      order: jest.fn(() => query),
      limit: jest.fn(() => query),
      then: (resolve) => resolve({
        data: [
          { id: 'n1', type: 'collector_enroute', title: 'Collector En Route', message: 'On the way', read: false },
          { id: 'n2', type: 'pickup_accepted', title: 'Accepted', message: 'Accepted', read: true }
        ],
        error: null
      })
    };
    supabase.from.mockReturnValue(query);

    const { data } = await notificationService.getUserNotifications('user-1', { status: 'unread' });

    expect(supabase.from).toHaveBeenCalledWith('notifications');
    expect(query.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(query.eq).toHaveBeenCalledWith('read', false);
    expect(data.map(n => n.status)).toEqual(['unread', 'read']);
  });
});
