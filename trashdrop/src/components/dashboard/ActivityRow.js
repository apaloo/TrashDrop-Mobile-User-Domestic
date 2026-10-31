import React from 'react';
import { activityDate } from '../../utils/activityDate.js';

// Icon and tint for each kind of activity. Reports are orange (as on the
// Report tab); pickups, bins, bag scans and rewards are green.
const ICONS = {
  pickup: { tint: 'green', d: ['M3 7h11v9H3z', 'M14 10h4l3 3v3h-7'], circles: [[7, 18], [17, 18]] },
  report: { tint: 'orange', d: ['M12 3l9 16H3z', 'M12 10v4', 'M12 17v.01'] },
  bin: { tint: 'green', d: ['M4 7h16', 'M6 7l1 13h10l1-13', 'M10 11v5', 'M14 11v5'] },
  scan: { tint: 'green', d: ['M3 3h7v7H3z', 'M14 3h7v7h-7z', 'M3 14h7v7H3z', 'M14 14h3v3h-3z', 'M20 14v.01', 'M14 20h.01', 'M17 20h4v-3'] },
  reward: { tint: 'green', d: ['M9 14l-2 7 5-3 5 3-2-7'], circles: [[12, 9, 6]] },
  other: { tint: 'green', d: ['M12 7v5l3 3'], circles: [[12, 12, 9]] },
};

const KIND = {
  pickup: 'pickup', pickup_request: 'pickup',
  report: 'report', dumping_report: 'report',
  digital_bin: 'bin',
  batch: 'scan', qr_scan: 'scan',
  reward_redemption: 'reward',
};

// Titles for rows that come without a description (or with only their type)
const LABELS = {
  pickup: 'Pickup', pickup_request: 'Pickup requested',
  report: 'Reported illegal dumping', dumping_report: 'Reported illegal dumping',
  digital_bin: 'Digital bin requested',
  batch: 'Bags added', qr_scan: 'Scanned a bag QR code',
  reward_redemption: 'Reward redeemed',
};

const TINTS = {
  green: 'bg-td-tonal text-td-forest dark:bg-green-900/40 dark:text-green-300',
  orange: 'bg-orange-100 text-td-orange-text dark:bg-orange-900/40 dark:text-orange-300',
};

/**
 * One Recent Activity row, wallet style: an icon, what happened, when, and
 * the points on the right ("Points when verified" for a report still waiting).
 */
const ActivityRow = ({ activity, first = false }) => {
  const icon = ICONS[KIND[activity.type] || 'other'];
  const points = Number(activity.points) || 0;
  const given = activity.description || activity.message;
  const title = given && given !== activity.type ? given : (LABELS[activity.type] || 'Activity');
  return (
    <li className={`flex items-center gap-3 py-2.5 ${first ? '' : 'border-t border-td-border dark:border-gray-700'}`}>
      <span className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${TINTS[icon.tint]}`}>
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {icon.d.map(d => <path key={d} d={d} />)}
          {(icon.circles || []).map(([cx, cy, r = 2]) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} />)}
        </svg>
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[15px] font-semibold text-td-ink dark:text-gray-100 leading-snug">{title}</p>
        <p className="text-[13px] text-td-sage dark:text-gray-300 mt-0.5">{activityDate(activity.timestamp)}</p>
      </div>
      {activity.pointsPending ? (
        <span className="flex-shrink-0 max-w-[6rem] text-right text-[13px] text-td-sage dark:text-gray-300">Points when verified</span>
      ) : points !== 0 && (
        <span className={`flex-shrink-0 text-[15px] font-bold ${points > 0 ? 'text-td-forest dark:text-green-300' : 'text-td-ink dark:text-gray-100'}`}>
          {points > 0 ? '+' : '−'}{Math.abs(points).toLocaleString()}
          <span className="sr-only"> points</span>
        </span>
      )}
    </li>
  );
};

export default ActivityRow;
