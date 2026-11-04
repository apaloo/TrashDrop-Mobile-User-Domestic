import { createClient } from '@supabase/supabase-js';
import '../supabaseClient.js';

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    auth: { onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })) },
  })),
}));

// The fetch the app hands Supabase (read now: resetMocks clears the calls before each test)
const appFetch = createClient.mock.calls[0][2].global.fetch;
const clientFetch = () => appFetch;
const reply = (status) => ({ ok: status < 400, status, text: async () => '{}' });

describe("the Supabase client's fetch", () => {
  const realFetch = global.fetch;
  beforeEach(() => { global.fetch = jest.fn(); });
  afterAll(() => { global.fetch = realFetch; });

  it('hands an error answer back to Supabase instead of throwing it', async () => {
    // A wrong password is a 400: Supabase must read it, or it calls it a network failure
    global.fetch.mockResolvedValue(reply(400));
    const response = await clientFetch()('https://x.supabase.co/auth/v1/token', { method: 'POST' });
    expect(response.status).toBe(400);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('retries a dropped request, then gives up with the network error', async () => {
    global.fetch.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(clientFetch()('https://x.supabase.co/rest/v1/bins', {})).rejects.toThrow('Failed to fetch');
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('retries a read when the server is unavailable, but never resends a write', async () => {
    global.fetch.mockResolvedValueOnce(reply(503)).mockResolvedValueOnce(reply(200));
    expect((await clientFetch()('https://x.supabase.co/rest/v1/bins', { method: 'GET' })).status).toBe(200);

    global.fetch.mockClear();
    global.fetch.mockResolvedValue(reply(503));
    expect((await clientFetch()('https://x.supabase.co/rest/v1/bins', { method: 'POST' })).status).toBe(503);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
