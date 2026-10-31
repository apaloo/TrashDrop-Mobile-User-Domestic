import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { userService } from '../../services/index.js';
import { pointsToCedis, pointsLevel, nextReward } from '../../utils/rewardsMath.js';

/**
 * The dashboard's Rewards card: points balance, what it is worth, and the
 * next airtime/data reward.
 *
 * The balance is the one the Rewards page redeems against
 * (userService.getUserStats: pickups, bins, verified reports and QR scans,
 * less redemptions), so the two pages always agree. Until it loads, the
 * dashboard's own total is shown (fallbackPoints).
 */
const RewardsCard = ({ userId, fallbackPoints = 0, compact = false }) => {
  const [points, setPoints] = useState(null);

  useEffect(() => {
    if (!userId) return undefined;
    let cancelled = false;
    userService.getUserStats(userId)
      .then(result => { if (!cancelled && !result?.error) setPoints(result?.data?.points ?? null); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [userId]);

  const balance = Math.max(0, points ?? fallbackPoints ?? 0);
  const next = nextReward(balance);

  // During a pickup the pickup card leads, so the rewards shrink to one row
  if (compact) {
    return (
      <Link
        to="/rewards"
        aria-label={`Rewards: ${balance.toLocaleString()} points, level ${pointsLevel(balance)}. Redeem`}
        className="flex items-center gap-3.5 rounded-2xl bg-td-forest-dk text-white px-4 py-3.5 hover:brightness-110"
      >
        <span className="w-11 h-11 rounded-xl bg-td-lime flex items-center justify-center flex-shrink-0" aria-hidden="true">
          <svg className="w-5 h-5 text-td-ink" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="9" r="6" /><path d="M9 14l-2 7 5-3 5 3-2-7" /></svg>
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-xl font-bold">{balance.toLocaleString()} points</span>
          <span className="block text-[13px] text-td-tonal">Level {pointsLevel(balance)} · GH₵{pointsToCedis(balance)} to redeem</span>
        </span>
        <svg className="w-5 h-5 text-td-lime flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
      </Link>
    );
  }

  return (
    <section
      aria-label="Rewards"
      className="relative overflow-hidden rounded-3xl bg-td-forest-dk text-white p-5 shadow-sm"
    >
      {/* Decorative ring, as on a wallet pass */}
      <div aria-hidden="true" className="absolute -right-10 -top-10 h-40 w-40 rounded-full border-[22px] border-td-lime/20" />

      <div className="relative flex items-center justify-between">
        <span className="text-[13px] font-semibold uppercase tracking-wider text-td-tonal">TrashDrop Rewards</span>
        <span className="rounded-full bg-td-lime px-2.5 py-1 text-[13px] font-bold text-td-ink">Level {pointsLevel(balance)}</span>
      </div>

      <p className="relative mt-3 text-[2.75rem] font-bold leading-none tracking-tight">
        {balance.toLocaleString()} <span className="text-lg font-medium tracking-normal">points</span>
      </p>
      <p className="relative mt-1.5 text-sm text-td-tonal">Worth GH₵{pointsToCedis(balance)} in airtime or data</p>

      <div className="relative mt-4">
        <div
          className="h-2 overflow-hidden rounded-full bg-white/20"
          role="progressbar"
          aria-label={`Progress to GH₵${next.cedis} airtime`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(next.progress * 100)}
        >
          <div className="h-2 rounded-full bg-td-lime transition-all duration-300" style={{ width: `${Math.round(next.progress * 100)}%` }} />
        </div>
        <p className="mt-2 text-[13px] text-td-tonal">
          {next.top
            ? `You can redeem GH₵${next.cedis} airtime or data now`
            : `${next.remaining.toLocaleString()} more points to GH₵${next.cedis} airtime`}
        </p>
      </div>

      <div className="relative mt-4 flex gap-2.5">
        <Link
          to="/rewards"
          className="flex h-11 flex-1 items-center justify-center rounded-full bg-td-lime text-[15px] font-bold text-td-ink hover:brightness-95"
        >
          Redeem
        </Link>
        <Link
          to="/activity"
          className="flex h-11 flex-1 items-center justify-center rounded-full border-[1.5px] border-white/50 text-[15px] font-semibold text-white hover:bg-white/10"
        >
          How I earned
        </Link>
      </div>
    </section>
  );
};

export default RewardsCard;
