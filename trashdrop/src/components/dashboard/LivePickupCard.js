import React from 'react';
import { Link } from 'react-router-dom';
import { statusService } from '../../services/statusService.js';

// Progress steps, and which step each pickup status has reached
const STEPS = ['Requested', 'Accepted', 'On the way', 'Collected'];
const STEP_OF = { pending: 0, accepted: 1, en_route: 2, arrived: 2, collecting: 3, completed: 3 };

const collectorName = (p) =>
  p.collector_name
  || (p.collector ? `${p.collector.first_name || ''} ${p.collector.last_name || ''}`.trim() : null)
  || 'Waiting...';

const BellIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
  </svg>
);

const UnreadBadge = ({ count }) => (count > 0 ? (
  <span className="absolute -top-2 -right-3 bg-red-600 text-white text-xs font-bold rounded-full h-5 min-w-[1.25rem] px-1 flex items-center justify-center">
    {count > 9 ? '9+' : count}
    <span className="sr-only"> unread alerts</span>
  </span>
) : null);

/**
 * The pickup in progress, at the top of the dashboard once a collector has
 * it: status and progress, the collector, bags, points and place, with Track
 * Collector and Alerts. Same data and links as the old Active Pickup tab.
 */
const LivePickupCard = ({ pickup, unreadNotifications = 0 }) => {
  const status = pickup.status;
  const step = STEP_OF[status] ?? 1;
  const tracking = statusService.isTrackingAvailable(status);
  const bags = pickup.estimated_volume || pickup.bag_count || pickup.number_of_bags || 0;
  const points = pickup.points_earned || pickup.points || 0;
  const place = pickup.location?.address || pickup.location?.location_name || pickup.address || 'N/A';

  return (
    <section
      aria-label={pickup.is_digital_bin ? 'Active digital bin' : 'Active pickup'}
      className="bg-white dark:bg-gray-800 border-2 border-td-forest dark:border-green-400 rounded-3xl p-5"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 text-[13px] font-bold uppercase tracking-wide text-td-forest-dk dark:text-green-300">
          <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-td-forest dark:bg-green-400" />
          </span>
          {statusService.getStatusDisplay(status)}
        </span>
        <span className="text-[13px] text-td-sage dark:text-gray-300">
          {pickup.is_digital_bin ? 'Digital bin' : 'Pickup'} · {bags} {Number(bags) === 1 ? 'bag' : 'bags'}
        </span>
      </div>

      <p className="mt-3 text-2xl font-bold text-td-ink dark:text-gray-100">{collectorName(pickup)}</p>
      <p className="mt-1 text-sm text-td-sage dark:text-gray-300 line-clamp-2">{place}</p>
      {(points > 0 || (pickup.is_digital_bin && pickup.frequency)) && (
        <div className="mt-2 flex flex-wrap gap-2">
          {points > 0 && (
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-td-tonal text-td-forest dark:bg-green-900/40 dark:text-green-300">+{points} points</span>
          )}
          {pickup.is_digital_bin && pickup.frequency && (
            <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-td-tonal text-td-forest dark:bg-green-900/40 dark:text-green-300">{pickup.frequency}</span>
          )}
        </div>
      )}

      <ol aria-label="Pickup progress" className="mt-4 grid grid-cols-4 gap-1.5">
        {STEPS.map((label, i) => (
          <li key={label} className="flex flex-col gap-1.5" aria-current={i === step ? 'step' : undefined}>
            <span className={`h-1.5 rounded-full ${i < step ? 'bg-td-forest dark:bg-green-400' : i === step ? 'bg-td-lime' : 'bg-td-border dark:bg-gray-600'}`} />
            <span className={`text-xs ${i === step ? 'font-bold text-td-ink dark:text-gray-100' : i < step ? 'font-semibold text-td-forest-dk dark:text-green-300' : 'text-td-sage dark:text-gray-300'}`}>{label}</span>
          </li>
        ))}
      </ol>

      {tracking ? (
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <Link
            to={`/collector-tracking?pickupId=${pickup.id}`}
            className="h-11 rounded-full bg-green-600 hover:bg-green-700 text-white text-[15px] font-bold flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Track Collector
          </Link>
          <Link
            to="/notifications"
            className="h-11 rounded-full border-[1.5px] border-td-border-strong dark:border-gray-500 text-td-ink dark:text-gray-100 text-[15px] font-semibold flex items-center justify-center hover:bg-td-cream dark:hover:bg-gray-700"
          >
            <span className="relative inline-flex items-center gap-2"><BellIcon />Alerts<UnreadBadge count={unreadNotifications} /></span>
          </Link>
        </div>
      ) : (
        <Link
          to="/notifications"
          className="mt-4 h-11 rounded-full border-[1.5px] border-td-border-strong dark:border-gray-500 text-td-ink dark:text-gray-100 text-[15px] font-semibold flex items-center justify-center hover:bg-td-cream dark:hover:bg-gray-700"
        >
          <span className="relative inline-flex items-center gap-2"><BellIcon />Waiting for collector · Check alerts<UnreadBadge count={unreadNotifications} /></span>
        </Link>
      )}
    </section>
  );
};

export default LivePickupCard;
