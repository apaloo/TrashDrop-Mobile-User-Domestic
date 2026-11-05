import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';
import { answerReminder, describeDueDate, FREQUENCY_WORDS, getOpenReminder } from '../services/binReminderService.js';
import { errorNote, primaryButton, secondaryButton } from './ui/styles.js';

const TIME_WORDS = {
  morning: 'morning (8am - 12pm)',
  afternoon: 'afternoon (12pm - 4pm)',
  evening: 'evening (4pm - 8pm)'
};

const WASTE_WORDS = { general: 'general waste', recycling: 'recycling', organic: 'organic waste' };

// "Not now" hides a reminder until the app is opened again
const LATER_KEY = 'td_bin_reminders_later';
const readLater = () => {
  try { return JSON.parse(sessionStorage.getItem(LATER_KEY) || '[]'); } catch { return []; }
};
const rememberLater = (id) => {
  try { sessionStorage.setItem(LATER_KEY, JSON.stringify([...readLater(), id])); } catch { /* private mode */ }
};

/**
 * Pop-up for a repeat digital bin collection that is due tomorrow (or
 * today): book it, skip it, or stop the reminders. Checks when the app opens
 * and whenever the user comes back to it.
 */
const BinReminderPopup = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [reminder, setReminder] = useState(null);
  const [confirmStop, setConfirmStop] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const checking = useRef(false);

  // Not over the booking form, where the user may be booking it already
  const onBookingPage = pathname === '/digital-bin';

  const check = useCallback(async () => {
    if (!user?.id || checking.current || document.visibilityState === 'hidden') return;
    checking.current = true;
    try {
      const open = await getOpenReminder();
      setReminder(open && !readLater().includes(open.reminder_id) ? open : null);
    } catch (err) {
      console.warn('[BinReminderPopup] Could not check reminders:', err.message);
    } finally {
      checking.current = false;
    }
  }, [user?.id]);

  useEffect(() => {
    check();
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [check]);

  // Leaving the booking page (booked or not): look again
  useEffect(() => {
    if (!onBookingPage) check();
  }, [onBookingPage, check]);

  if (!reminder || onBookingPage) return null;

  const close = () => {
    setReminder(null);
    setConfirmStop(false);
    setError('');
  };

  const answer = async (action) => {
    setSaving(true);
    setError('');
    try {
      await answerReminder(reminder.reminder_id, action);
      close();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const book = () => {
    const chosen = reminder;
    close();
    navigate('/digital-bin', { state: { bookFromReminder: chosen } });
  };

  const later = () => {
    rememberLater(reminder.reminder_id);
    close();
  };

  const often = FREQUENCY_WORDS[reminder.frequency] || reminder.frequency;
  const { when, date } = describeDueDate(reminder.due_date);
  const bins = reminder.bag_count || 1;
  const what = [
    `${bins} bin${bins > 1 ? 's' : ''}`,
    reminder.bin_size_liters ? `${reminder.bin_size_liters}L` : null,
    WASTE_WORDS[reminder.waste_type] || reminder.waste_type
  ].filter(Boolean).join(', ');

  return (
    <div className="fixed inset-0 z-[99990] overflow-y-auto">
      <div className="fixed inset-0 bg-black/60" aria-hidden="true"></div>
      <div className="flex min-h-full items-center justify-center p-4">
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="bin-reminder-title"
          aria-describedby="bin-reminder-text"
          className="relative bg-white dark:bg-gray-800 rounded-3xl shadow-2xl max-w-sm w-full px-6 pt-7 pb-6 text-center"
        >
          <div className="mx-auto flex items-center justify-center h-14 w-14 rounded-2xl bg-td-tonal text-td-forest dark:bg-green-900/40 dark:text-green-300 mb-4" aria-hidden="true">
            <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /><path d="M9 15l2 2 4-4" />
            </svg>
          </div>

          {confirmStop ? (
            <>
              <h2 id="bin-reminder-title" className="text-[20px] font-bold text-td-ink dark:text-gray-100">
                Stop these reminders?
              </h2>
              <p id="bin-reminder-text" className="text-[15px] text-td-sage dark:text-gray-300 mt-2">
                We won't remind you about your {often} collection at {reminder.location_name || 'this place'} again.
                You can start them again by booking a {often} collection.
              </p>
              {error && <p className={`${errorNote} px-4 py-3 mt-4 text-sm text-left`} role="alert">{error}</p>}
              <div className="grid grid-cols-1 gap-2.5 mt-5">
                <button type="button" onClick={() => answer('stop')} disabled={saving} className={primaryButton}>
                  {saving ? 'Saving...' : 'Yes, stop reminders'}
                </button>
                <button type="button" onClick={() => setConfirmStop(false)} disabled={saving} className={secondaryButton}>
                  Keep them
                </button>
              </div>
            </>
          ) : (
            <>
              <h2 id="bin-reminder-title" className="text-[20px] font-bold text-td-ink dark:text-gray-100">
                Your {often} collection is {when}
              </h2>
              <div id="bin-reminder-text" className="text-[15px] text-td-sage dark:text-gray-300 mt-2 space-y-1">
                <p>
                  {date}, {TIME_WORDS[reminder.preferred_time] || reminder.preferred_time}
                  {reminder.location_name ? ` at ${reminder.location_name}` : ''}.
                </p>
                <p className="text-sm">{what}. Book it now so a collector can be assigned.</p>
              </div>
              {error && <p className={`${errorNote} px-4 py-3 mt-4 text-sm text-left`} role="alert">{error}</p>}
              <div className="grid grid-cols-1 gap-2.5 mt-5">
                <button type="button" autoFocus onClick={book} disabled={saving} className={primaryButton}>
                  Book it now
                </button>
                <button type="button" onClick={() => answer('skip')} disabled={saving} className={secondaryButton}>
                  {saving ? 'Saving...' : 'Skip this time'}
                </button>
                <div className="flex items-center justify-between pt-1">
                  <button type="button" onClick={later} disabled={saving} className="text-sm font-semibold text-td-forest dark:text-green-300 hover:underline px-2 py-2">
                    Not now
                  </button>
                  <button type="button" onClick={() => setConfirmStop(true)} disabled={saving} className="text-sm font-semibold text-td-sage dark:text-gray-300 hover:underline px-2 py-2">
                    Stop these reminders
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default BinReminderPopup;
