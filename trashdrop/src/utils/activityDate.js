/**
 * Short, wallet-style dates for activity rows: "Today, 12:25",
 * "Yesterday, 09:53", "23 Oct, 09:24", or "23 Oct 2025" for another year.
 */
const time = (d) => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const dayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

export const activityDate = (value, now = new Date()) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const days = Math.round((dayStart(now) - dayStart(d)) / 86400000);
  if (days === 0) return `Today, ${time(d)}`;
  if (days === 1) return `Yesterday, ${time(d)}`;
  if (d.getFullYear() !== now.getFullYear()) {
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  return `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}, ${time(d)}`;
};
