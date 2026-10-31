/**
 * Points → airtime/data rewards, for the dashboard's Rewards card.
 *
 * Same rate and rewards as the rewards table
 * (supabase/migrations/20261030000000_airtime_data_rewards.sql): 200 points
 * = GH₵1; airtime and data at GH₵5 / 10 / 20. Change both together.
 */

export const POINTS_PER_CEDI = 200;
export const REWARD_TIERS = [5, 10, 20].map(cedis => ({ cedis, points: cedis * POINTS_PER_CEDI }));

/** 1335 → "6.67" */
export const pointsToCedis = (points) => (Math.max(0, Number(points) || 0) / POINTS_PER_CEDI).toFixed(2);

/** Level shown on the card: one level per 100 points, as the dashboard has always counted */
export const pointsLevel = (points) => Math.floor(Math.max(0, Number(points) || 0) / 100) + 1;

/**
 * The next reward to work towards: { cedis, points, remaining, progress (0–1) },
 * or { top, cedis, points, progress: 1 } once the biggest reward is in reach.
 */
export const nextReward = (points) => {
  const p = Math.max(0, Number(points) || 0);
  const tier = REWARD_TIERS.find(t => t.points > p);
  if (!tier) {
    const top = REWARD_TIERS[REWARD_TIERS.length - 1];
    return { top: true, cedis: top.cedis, points: top.points, remaining: 0, progress: 1 };
  }
  return { cedis: tier.cedis, points: tier.points, remaining: tier.points - p, progress: p / tier.points };
};
