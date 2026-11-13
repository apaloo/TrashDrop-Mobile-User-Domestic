/**
 * Households rate their collector after a pickup (issue #186). The database
 * decides (td_rate_job): only the household that booked the job, only once
 * it is done, only once. Collectors see only their average, never comments.
 */
import supabase from '../utils/supabaseClient.js';

export const MAX_COMMENT_LENGTH = 500;

/** The household's rating of one job, or null when not rated yet */
export const getMyRating = async (source, jobId) => {
  const { data, error } = await supabase
    .from('job_ratings')
    .select('stars, comment, created_at')
    .eq('job_source', source)
    .eq('job_id', String(jobId))
    .maybeSingle();
  if (error) throw new Error(error.message || "We couldn't load your rating.");
  return data || null;
};

/** Rate the collector on a finished job: 1-5 stars and an optional comment */
export const rateJob = async ({ source, jobId, stars, comment = '' }) => {
  const { data, error } = await supabase.rpc('td_rate_job', {
    p_source: source,
    p_job_id: String(jobId),
    p_stars: stars,
    p_comment: comment ? comment.trim().slice(0, MAX_COMMENT_LENGTH) : null,
  });
  if (error) throw new Error(error.message || "We couldn't save your rating. Please try again.");
  return data;
};
