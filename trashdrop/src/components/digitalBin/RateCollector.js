import React, { useEffect, useState } from 'react';
import { FaStar } from 'react-icons/fa';
import { getMyRating, rateJob, MAX_COMMENT_LENGTH } from '../../services/ratingService.js';

const STAR_WORDS = ['Very poor', 'Poor', 'OK', 'Good', 'Excellent'];

/**
 * Rate the collector on a finished job (issue #186). Shown on a completed
 * digital bin; the database checks it is the household's own, finished job
 * and that it hasn't been rated yet.
 */
const RateCollector = ({ source = 'digital_bins', jobId }) => {
  const [existing, setExisting] = useState(undefined); // undefined: loading; null: not rated
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    getMyRating(source, jobId)
      .then((r) => { if (alive) setExisting(r); })
      .catch(() => { if (alive) setExisting(null); }); // can still try to rate; the database decides
    return () => { alive = false; };
  }, [source, jobId]);

  if (existing === undefined) return null;

  if (existing) {
    return (
      <p className="text-sm text-td-ink dark:text-gray-200" role="status">
        You rated your collector {existing.stars} star{existing.stars === 1 ? '' : 's'}. Thank you!
      </p>
    );
  }

  const submit = async () => {
    if (!stars || saving) return;
    setSaving(true);
    setError(null);
    try {
      await rateJob({ source, jobId, stars, comment });
      setExisting({ stars, comment });
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold text-td-ink dark:text-white">Rate your collector</h4>
      <div role="group" aria-label="Stars" className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={stars === n}
            aria-label={`${n} star${n === 1 ? '' : 's'}: ${STAR_WORDS[n - 1]}`}
            onClick={() => setStars(n)}
            className="p-1"
          >
            <FaStar className={n <= stars ? 'text-amber-500' : 'text-gray-300 dark:text-gray-600'} size={26} aria-hidden="true" />
          </button>
        ))}
      </div>
      {stars > 0 && <p className="text-xs text-td-sage dark:text-gray-400">{STAR_WORDS[stars - 1]}</p>}
      <label htmlFor={`rating-comment-${jobId}`} className="block text-sm text-td-ink dark:text-gray-200">
        Comment <span className="text-td-sage dark:text-gray-400">(optional)</span>
      </label>
      <textarea
        id={`rating-comment-${jobId}`}
        value={comment}
        maxLength={MAX_COMMENT_LENGTH}
        rows={2}
        onChange={(e) => setComment(e.target.value)}
        className="w-full rounded-lg border border-td-border dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-td-ink dark:text-gray-100"
      />
      <p className="text-xs text-td-sage dark:text-gray-400">
        Your collector sees only their average rating, never your comment. TrashDrop staff read comments to improve the service.
      </p>
      {error && <p className="text-sm text-td-error dark:text-red-300" role="alert">{error}</p>}
      <button
        type="button"
        onClick={submit}
        disabled={!stars || saving}
        className="rounded-lg bg-td-forest px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Send rating'}
      </button>
    </div>
  );
};

export default RateCollector;
