/**
 * Points for an illegal dumping report.
 *
 * Points now buy airtime and data, so a report earns its points once the
 * TrashDrop team has verified it (agreed with the owner, 2026-10-30).
 * Reports sent before REPORT_POINTS_VERIFIED_FROM keep the points they
 * already earned, so no one's balance drops. The database view
 * user_stats_dashboard applies the same rule
 * (supabase/migrations/20261031000000_report_points_when_verified.sql).
 */

export const REPORT_POINTS_VERIFIED_FROM = '2026-10-31T00:00:00Z';

// Verified, or further along (being cleaned up, cleaned, disposed of)
export const VERIFIED_REPORT_STATUSES = ['verified', 'in_progress', 'completed', 'disposed'];

/** 20 for high severity, 10 for low, 15 otherwise */
export const severityPoints = (severity) => (severity === 'high' ? 20 : severity === 'low' ? 10 : 15);

/** Does this report earn its points now? */
export const reportEarnsPoints = (report) =>
  !report?.created_at
  || new Date(report.created_at) < new Date(REPORT_POINTS_VERIFIED_FROM)
  || VERIFIED_REPORT_STATUSES.includes(report.status);

/** The points this report has earned so far (0 while it waits to be verified) */
export const reportPoints = (report) => (reportEarnsPoints(report) ? severityPoints(report?.severity) : 0);

/** Waiting for the team to verify it (its points come then) */
export const reportPointsPending = (report) =>
  !reportEarnsPoints(report) && !['cancelled', 'canceled', 'rejected'].includes(report?.status);
