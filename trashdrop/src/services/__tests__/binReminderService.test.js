import supabase from '../../utils/supabaseClient.js';
import {
  answerReminder,
  createReminderPlan,
  describeDueDate,
  getOpenReminder,
  isRepeatFrequency
} from '../binReminderService.js';

jest.mock('../../utils/supabaseClient.js', () => ({ __esModule: true, default: { rpc: jest.fn() } }));

describe('binReminderService', () => {
  it('knows which frequencies repeat', () => {
    expect(['weekly', 'biweekly', 'monthly'].every(isRepeatFrequency)).toBe(true);
    expect(isRepeatFrequency('one-time')).toBe(false);
  });

  it('saves a plan for a new repeat booking', async () => {
    supabase.rpc.mockResolvedValue({ data: 'plan-1', error: null });
    await expect(createReminderPlan({ binId: 'b1', startDate: '2026-11-10', preferredTime: 'evening', notes: 'Gate' }))
      .resolves.toBe('plan-1');
    expect(supabase.rpc).toHaveBeenCalledWith('td_create_reminder_plan', {
      p_bin_id: 'b1', p_start_date: '2026-11-10', p_preferred_time: 'evening', p_notes: 'Gate'
    });
  });

  it('returns the open reminder, or null', async () => {
    supabase.rpc.mockResolvedValue({ data: [{ reminder_id: 'r1' }], error: null });
    await expect(getOpenReminder()).resolves.toEqual({ reminder_id: 'r1' });
    expect(supabase.rpc).toHaveBeenCalledWith('td_bin_reminder_details', { p_reminder_id: null });

    supabase.rpc.mockResolvedValue({ data: [], error: null });
    await expect(getOpenReminder()).resolves.toBeNull();
  });

  it('passes errors on as plain messages', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { message: 'That reminder was not found' } });
    await expect(answerReminder('r1', 'skip')).rejects.toThrow('That reminder was not found');
    expect(supabase.rpc).toHaveBeenCalledWith('td_answer_bin_reminder', { p_reminder_id: 'r1', p_action: 'skip', p_bin_id: null });
  });

  it('describes the collection day', () => {
    const now = new Date(2026, 10, 5, 9, 0); // Thu 5 Nov 2026
    expect(describeDueDate('2026-11-05', now).when).toBe('today');
    expect(describeDueDate('2026-11-06', now)).toEqual({ when: 'tomorrow', date: 'Fri 6 Nov' });
    expect(describeDueDate('2026-11-09', now).when).toBe('on Monday');
  });
});
