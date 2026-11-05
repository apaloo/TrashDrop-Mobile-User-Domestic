/**
 * Reminders for repeat digital bin collections.
 *
 * Weekly, bi-weekly and monthly bookings don't book themselves. Booking one
 * saves a reminder plan; the day before each following collection a daily
 * database job creates a reminder, the app shows it as a pop-up, and the user
 * books that collection like any other request.
 * See supabase/migrations/20261106000000_bin_collection_reminders.sql.
 */
import supabase from '../utils/supabaseClient.js';

export const REPEAT_FREQUENCIES = ['weekly', 'biweekly', 'monthly'];

export const FREQUENCY_WORDS = {
  weekly: 'weekly',
  biweekly: 'bi-weekly',
  monthly: 'monthly'
};

export const isRepeatFrequency = (frequency) => REPEAT_FREQUENCIES.includes(frequency);

/** Save the reminder plan for a repeat booking that was just created */
export const createReminderPlan = async ({ binId, startDate, preferredTime, notes }) => {
  const { data, error } = await supabase.rpc('td_create_reminder_plan', {
    p_bin_id: binId,
    p_start_date: startDate,
    p_preferred_time: preferredTime || 'morning',
    p_notes: notes || null
  });
  if (error) throw new Error(error.message || "We couldn't set up your reminders.");
  return data;
};

/**
 * The user's soonest open reminder (or a given one), with what the booking
 * form needs. Null when there is none.
 */
export const getOpenReminder = async (reminderId = null) => {
  const { data, error } = await supabase.rpc('td_bin_reminder_details', { p_reminder_id: reminderId });
  if (error) throw new Error(error.message || "We couldn't check your reminders.");
  const row = Array.isArray(data) ? data[0] : data;
  return row || null;
};

/** Record the answer: 'booked' (with the new bin's id), 'skip' or 'stop' */
export const answerReminder = async (reminderId, action, binId = null) => {
  const { error } = await supabase.rpc('td_answer_bin_reminder', {
    p_reminder_id: reminderId,
    p_action: action,
    p_bin_id: binId
  });
  if (error) throw new Error(error.message || "We couldn't save that. Please try again.");
};

/** "today" / "tomorrow" / weekday, plus a short date, for a YYYY-MM-DD day */
export const describeDueDate = (dueDate, now = new Date()) => {
  const [y, m, d] = String(dueDate).split('-').map(Number);
  const due = new Date(y, m - 1, d);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((due - today) / 86400000);
  const date = due.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  if (days === 0) return { when: 'today', date };
  if (days === 1) return { when: 'tomorrow', date };
  return { when: `on ${due.toLocaleDateString('en-GB', { weekday: 'long' })}`, date };
};
