import { rateJob, getMyRating } from '../ratingService.js';
import supabase from '../../utils/supabaseClient.js';

jest.mock('../../utils/supabaseClient.js', () => ({ __esModule: true, default: { rpc: jest.fn(), from: jest.fn() } }));

beforeEach(() => jest.clearAllMocks());

test('rateJob asks the database (td_rate_job), trimming the comment', async () => {
  supabase.rpc.mockResolvedValue({ data: { stars: 3 }, error: null });
  await rateJob({ source: 'digital_bins', jobId: 'bin-1', stars: 3, comment: '  ok  ' });
  expect(supabase.rpc).toHaveBeenCalledWith('td_rate_job', { p_source: 'digital_bins', p_job_id: 'bin-1', p_stars: 3, p_comment: 'ok' });
});

test('an empty comment is sent as none; refusals come back as messages', async () => {
  supabase.rpc.mockResolvedValue({ data: null, error: { message: 'You can rate a pickup once it is done' } });
  await expect(rateJob({ source: 'digital_bins', jobId: 'bin-1', stars: 5, comment: '' })).rejects.toThrow('You can rate a pickup once it is done');
  expect(supabase.rpc.mock.calls[0][1].p_comment).toBeNull();
});

test('getMyRating reads the household\'s own rating of one job', async () => {
  const calls = [];
  const q = new Proxy({}, { get: (_, m) => (...a) => { calls.push([m, ...a]); return m === 'maybeSingle' ? Promise.resolve({ data: { stars: 4 }, error: null }) : q; } });
  supabase.from.mockReturnValue(q);
  expect(await getMyRating('digital_bins', 'bin-1')).toEqual({ stars: 4 });
  expect(supabase.from).toHaveBeenCalledWith('job_ratings');
  expect(calls).toContainEqual(['eq', 'job_id', 'bin-1']);
});
