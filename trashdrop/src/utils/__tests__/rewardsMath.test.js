import { pointsToCedis, pointsLevel, nextReward } from '../rewardsMath';

describe('Rewards card numbers', () => {
  it('turns points into cedis at 200 points per GH₵1', () => {
    expect(pointsToCedis(1335)).toBe('6.67');
    expect(pointsToCedis(0)).toBe('0.00');
    expect(pointsToCedis(-75)).toBe('0.00');
  });

  it('counts one level per 100 points', () => {
    expect(pointsLevel(0)).toBe(1);
    expect(pointsLevel(650)).toBe(7);
  });

  it('points to the next airtime reward', () => {
    expect(nextReward(1335)).toEqual({ cedis: 10, points: 2000, remaining: 665, progress: 1335 / 2000 });
    expect(nextReward(200)).toMatchObject({ cedis: 5, remaining: 800 });
    expect(nextReward(4000)).toMatchObject({ top: true, cedis: 20, progress: 1 });
  });
});
