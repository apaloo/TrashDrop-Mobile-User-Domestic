import { activityDate } from '../activityDate';

describe('activity dates', () => {
  const now = new Date(2026, 9, 31, 15, 0); // 31 Oct 2026, 15:00 local

  it('says Today and Yesterday', () => {
    expect(activityDate(new Date(2026, 9, 31, 12, 25), now)).toBe('Today, 12:25');
    expect(activityDate(new Date(2026, 9, 30, 9, 53), now)).toBe('Yesterday, 09:53');
  });

  it('shows the day and month this year, and the year otherwise', () => {
    expect(activityDate(new Date(2026, 9, 23, 9, 24), now)).toBe('23 Oct, 09:24');
    expect(activityDate(new Date(2025, 11, 2, 8, 0), now)).toBe('2 Dec 2025');
  });

  it('gives nothing for a missing date', () => {
    expect(activityDate(undefined, now)).toBe('');
  });
});
