import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import supabase from '../utils/supabaseClient.js';

// Statuses after the collector has picked the waste up; matches the database
// rule in guard_collector_rating().
export const RATEABLE_STATUSES = ['collecting', 'completed', 'disposed'];

/**
 * True when a job row (pickup_requests or digital_bins, selected with '*')
 * can be rated. Requires the collector_rating column, so nothing is offered
 * before the ratings migration has been applied.
 */
export const canRateJob = (job) =>
  !!job &&
  Object.prototype.hasOwnProperty.call(job, 'collector_rating') &&
  job.collector_rating == null &&
  !!job.collector_id &&
  RATEABLE_STATUSES.includes(job.status);

/**
 * Rate the collector for one finished job: five large stars, one tap.
 * Reached from /rate-service?pickupId=<id>&type=bin|pickup.
 */
const RateService = () => {
  const [searchParams] = useSearchParams();
  const jobId = searchParams.get('pickupId');
  const typeHint = searchParams.get('type');

  const [job, setJob] = useState(null);
  const [table, setTable] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rating, setRating] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const load = async () => {
      if (!jobId) {
        setLoading(false);
        return;
      }
      // The notification link does not say which table the job is in.
      const tables = typeHint === 'bin'
        ? ['digital_bins']
        : typeHint === 'pickup'
          ? ['pickup_requests']
          : ['pickup_requests', 'digital_bins'];
      for (const name of tables) {
        const { data } = await supabase.from(name).select('*').eq('id', jobId).maybeSingle();
        if (data) {
          setJob(data);
          setTable(name);
          setRating(data.collector_rating ?? null);
          break;
        }
      }
      setLoading(false);
    };
    load();
  }, [jobId, typeHint]);

  const saveRating = async (stars) => {
    if (saving || !table) return;
    setSaving(true);
    setError(null);
    const { error: saveError } = await supabase
      .from(table)
      .update({ collector_rating: stars })
      .eq('id', jobId);
    setSaving(false);
    if (saveError) {
      setError('Could not save. Please try again.');
      return;
    }
    setRating(stars);
  };

  const alreadyRated = rating != null;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-8 p-4 text-center bg-gray-50 dark:bg-gray-900">
      {loading ? (
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-r-transparent" />
      ) : alreadyRated ? (
        <>
          <div className="text-7xl" aria-hidden="true">🙏</div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Thank you!</h1>
          <p className="text-5xl" aria-label={`${rating} out of 5 stars`}>
            {'⭐'.repeat(rating)}
          </p>
        </>
      ) : canRateJob(job) ? (
        <>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Rate your collector</h1>
          <div className="flex gap-2" role="radiogroup" aria-label="Rating">
            {[1, 2, 3, 4, 5].map((stars) => (
              <button
                key={stars}
                type="button"
                disabled={saving}
                onClick={() => saveRating(stars)}
                className="text-5xl p-1 rounded-xl active:scale-90 transition-transform disabled:opacity-50"
                aria-label={`${stars} star${stars > 1 ? 's' : ''}`}
              >
                ⭐
              </button>
            ))}
          </div>
          {error && <p className="text-red-600 font-medium">{error}</p>}
        </>
      ) : (
        <>
          <div className="text-7xl" aria-hidden="true">⏳</div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Nothing to rate yet</h1>
        </>
      )}
      <Link
        to="/dashboard"
        className="w-full max-w-xs rounded-2xl bg-primary px-6 py-4 text-xl font-bold text-white shadow-lg"
      >
        🏠 Home
      </Link>
    </div>
  );
};

export default RateService;
