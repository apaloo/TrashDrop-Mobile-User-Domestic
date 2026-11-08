import React, { useState, useEffect, useRef } from 'react';
import Switch from './profile/Switch.js';
import { card, errorNote, sectionTitle } from './ui/styles.js';
import { useAuth } from '../context/AuthContext.js';
import { notificationService, normalizeNotification } from '../services/notificationService.js';
import supabase from '../utils/supabaseClient.js';
import { useArrivalQR } from '../context/useArrivalQR.js';

// Messages that mark a finished step: shown with a check mark
const DONE_TYPES = ['pickup_status', 'pickup_collected', 'pickup_disposed'];

const NotificationList = () => {
  const { user } = useAuth();
  // user can be null for a moment while the session is re-checked (app back
  // in the foreground, token refresh) before the route redirects; never read
  // user.id directly or the page crashes into the auth error screen
  const userId = user?.id;
  // The collector's at the bin: its arrival message opens the QR code
  const { arrivedBin, showBinQR } = useArrivalQR();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null); // a failed action (mark read, delete, settings)
  const [loadError, setLoadError] = useState(null); // the list could not be loaded
  const [showPreferences, setShowPreferences] = useState(false);
  const [preferences, setPreferences] = useState({
    pickup_status: true,
    system: true,
    promo: true
  });

  // Fetch notifications. The list refreshes every minute and when the phone
  // comes back online; a refresh that fails (weak signal, switching between
  // Wi-Fi and data) keeps the list already on screen instead of showing an
  // error, and a later success clears any load error.
  const loadedRef = useRef(false);
  useEffect(() => {
    if (!userId) return undefined;
    let cancelled = false;

    const fetchNotifications = async () => {
      try {
        const { data, error: fetchError } = await notificationService.getUserNotifications(
          userId,
          { limit: 50 }
        );

        if (fetchError) throw new Error(fetchError.message);
        if (cancelled) return;
        setNotifications(data);
        loadedRef.current = true;
        setLoadError(null);
      } catch (err) {
        console.error('Error fetching notifications:', err);
        if (cancelled) return;
        const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
        // Offline with notifications already showing: say nothing (the
        // app-wide "Offline" pill covers it, and they reload by themselves)
        if (offline) {
          if (!loadedRef.current) setLoadError("Notifications will load when you're back online.");
        } else if (!loadedRef.current) {
          setLoadError('Failed to load notifications');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60000);
    window.addEventListener('online', fetchNotifications);
    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener('online', fetchNotifications);
    };
  }, [userId]);

  // Real-time subscription for new notifications
  useEffect(() => {
    if (!userId) return undefined;

    console.log('[NotificationList] Setting up real-time notification subscription');

    const notificationSubscription = supabase
      .channel(`user_notifications_${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`
        },
        (payload) => {
          console.log('[NotificationList] New notification received:', payload.new);
          const newNotification = normalizeNotification(payload.new);
          
          // Add new notification to the list
          setNotifications(prev => [newNotification, ...prev]);
          
          // Show toast for pickup_accepted type
          if (newNotification.type === 'pickup_accepted' || newNotification.type === 'pickup_status') {
            // Toast notification will be shown by the ToastProvider if available
            window.dispatchEvent(new CustomEvent('trashdrop:notification', {
              detail: {
                title: newNotification.title,
                message: newNotification.message,
                type: newNotification.type
              }
            }));
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`
        },
        (payload) => {
          console.log('[NotificationList] Notification updated:', payload.new);
          // Update notification in the list
          setNotifications(prev =>
            prev.map(n => n.id === payload.new.id ? normalizeNotification(payload.new) : n)
          );
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[NotificationList] Successfully subscribed to notification updates');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('[NotificationList] Error subscribing to notifications');
        }
      });

    return () => {
      console.log('[NotificationList] Cleaning up notification subscription');
      supabase.removeChannel(notificationSubscription);
    };
  }, [userId]);

  // Fetch user preferences
  useEffect(() => {
    if (!userId) return;

    const fetchPreferences = async () => {
      try {
        const { data: profile } = await notificationService.getUserNotifications(userId);
        if (profile?.notification_preferences) {
          setPreferences(prev => ({
            ...prev,
            ...profile.notification_preferences
          }));
        }
      } catch (err) {
        console.error('Error fetching preferences:', err);
      }
    };

    fetchPreferences();
  }, [userId]);

  const handleMarkAsRead = async (notificationId) => {
    if (!userId) return;
    try {
      await notificationService.markAsRead(userId, [notificationId]);
      setNotifications(prev =>
        prev.map(n =>
          n.id === notificationId ? { ...n, status: 'read' } : n
        )
      );
    } catch (err) {
      console.error('Error marking notification as read:', err);
      setError('Failed to mark notification as read');
    }
  };

  const handleDeleteOld = async () => {
    if (!userId) return;
    try {
      await notificationService.deleteOldNotifications(userId, 30); // Delete notifications older than 30 days
      setNotifications(prev =>
        prev.filter(n => {
          const age = (Date.now() - new Date(n.created_at).getTime()) / (1000 * 60 * 60 * 24);
          return age <= 30;
        })
      );
    } catch (err) {
      console.error('Error deleting old notifications:', err);
      setError('Failed to delete old notifications');
    }
  };

  const handlePreferenceChange = async (type) => {
    const newPreferences = {
      ...preferences,
      [type]: !preferences[type]
    };
    
    if (!userId) return;
    try {
      await notificationService.updateNotificationPreferences(userId, newPreferences);
      setPreferences(newPreferences);
    } catch (err) {
      console.error('Error updating preferences:', err);
      setError('Failed to update notification preferences');
    }
  };

  const getNotificationIcon = (type) => {
    const kind = DONE_TYPES.includes(type) ? 'done' : type === 'error' ? 'error' : 'info';
    const tint = {
      done: 'bg-td-tonal text-td-forest dark:bg-green-900/40 dark:text-green-300',
      error: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
      info: 'bg-td-cream text-td-ink dark:bg-gray-700 dark:text-gray-200',
    }[kind];
    return (
      <span className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${tint}`} aria-hidden="true">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          {kind === 'done' && <><circle cx="12" cy="12" r="9" /><path d="M8 12.5l3 3 5-6" /></>}
          {kind === 'error' && <><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5M12 16v.01" /></>}
          {kind === 'info' && <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8v.01" /></>}
        </svg>
      </span>
    );
  };

  if (loading || !userId) {
    return (
      <div className="flex justify-center p-6" role="status" aria-label="Loading notifications">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-td-forest dark:border-green-300" />
      </div>
    );
  }

  const PREFERENCE_LABELS = [
    ['pickup_status', 'Pickup Status Updates'],
    ['system', 'System Notifications'],
    ['promo', 'Promotional Messages'],
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="sr-only">Notifications</h2>
        <p className="text-[15px] text-td-sage dark:text-gray-300">
          {notifications.length > 0
            ? `${notifications.filter(n => n.status === 'unread').length} unread`
            : 'Nothing new'}
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => setShowPreferences(!showPreferences)}
            aria-label="Notification settings"
            aria-expanded={showPreferences}
            className={`w-10 h-10 rounded-full flex items-center justify-center border transition-colors ${showPreferences
              ? 'bg-td-forest border-td-forest text-white'
              : 'border-td-border dark:border-gray-600 text-td-ink dark:text-gray-100 hover:bg-td-cream dark:hover:bg-gray-800'}`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M10.3 4.3a1.7 1.7 0 013.4 0 1.7 1.7 0 002.6 1.1 1.7 1.7 0 012.4 2.4 1.7 1.7 0 001 2.5 1.7 1.7 0 010 3.4 1.7 1.7 0 00-1 2.6 1.7 1.7 0 01-2.4 2.4 1.7 1.7 0 00-2.6 1 1.7 1.7 0 01-3.4 0 1.7 1.7 0 00-2.5-1 1.7 1.7 0 01-2.4-2.4 1.7 1.7 0 00-1.1-2.6 1.7 1.7 0 010-3.4 1.7 1.7 0 001.1-2.5 1.7 1.7 0 012.4-2.4 1.7 1.7 0 002.5-1.1z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
          <button
            onClick={handleDeleteOld}
            aria-label="Delete old notifications"
            className="w-10 h-10 rounded-full flex items-center justify-center border border-td-border dark:border-gray-600 text-td-ink dark:text-gray-100 hover:bg-td-cream dark:hover:bg-gray-800"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 7h16M6 7l1 13h10l1-13M10 11v5M14 11v5M9 7V4h6v3" />
            </svg>
          </button>
        </div>
      </div>

      {(error || loadError) && (
        <div role="alert" className={`${errorNote} px-4 py-3 flex items-start justify-between gap-3`}>
          <span className="text-[15px]">{error || loadError}</span>
          <button
            onClick={() => (error ? setError(null) : setLoadError(null))}
            aria-label="Dismiss error"
            className="-mr-1 -mt-0.5 w-8 h-8 flex-shrink-0 rounded-full flex items-center justify-center text-xl leading-none hover:bg-red-100 dark:hover:bg-red-900/40"
          >
            ×
          </button>
        </div>
      )}

      {showPreferences && (
        <section aria-labelledby="notification-preferences" className={`${card} px-4 py-3`}>
          <h3 id="notification-preferences" className={`${sectionTitle} mb-1`}>Notification Preferences</h3>
          <ul>
            {PREFERENCE_LABELS.map(([key, label], i) => (
              <li key={key} className={`flex items-center justify-between gap-3 py-3 ${i === 0 ? '' : 'border-t border-td-border dark:border-gray-700'}`}>
                <span id={`pref-${key}`} className="text-[15px] text-td-ink dark:text-gray-100">{label}</span>
                <Switch checked={!!preferences[key]} onChange={() => handlePreferenceChange(key)} labelledBy={`pref-${key}`} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-label="Your notifications" className={`${card} px-4`}>
        {notifications.length > 0 ? (
          <ul>
            {notifications.map((notification, index) => {
              const unread = notification.status === 'unread';
              return (
                <li key={notification.id} className={`flex items-start gap-3 py-3.5 ${index > 0 ? 'border-t border-td-border dark:border-gray-700' : ''}`}>
                  {getNotificationIcon(notification.type)}
                  <div className="flex-1 min-w-0">
                    <p className={`text-[15px] leading-snug text-td-ink dark:text-gray-100 ${unread ? 'font-bold' : 'font-semibold'}`}>
                      {unread && <span className="inline-block w-2 h-2 rounded-full bg-td-forest dark:bg-green-300 mr-2 align-middle" aria-hidden="true" />}
                      {notification.title}
                      {unread && <span className="sr-only"> (unread)</span>}
                    </p>
                    <p className="text-sm text-td-ink/80 dark:text-gray-200 mt-0.5">{notification.message}</p>
                    <p className="text-[13px] text-td-sage dark:text-gray-300 mt-0.5">{new Date(notification.created_at).toLocaleString()}</p>
                    {notification.type === 'collector_arrived' && arrivedBin && (
                      <button
                        type="button"
                        onClick={() => showBinQR(arrivedBin, { arrived: true })}
                        className="mt-2 h-10 px-4 rounded-full bg-td-lime text-td-ink text-sm font-bold hover:brightness-95"
                      >
                        Show QR code
                      </button>
                    )}
                  </div>
                  {unread && (
                    <button
                      onClick={() => handleMarkAsRead(notification.id)}
                      aria-label="Mark as read"
                      className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-td-forest dark:text-green-300 hover:bg-td-tonal dark:hover:bg-green-900/40"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M5 12.5l4.5 4.5L19 7.5" />
                      </svg>
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="py-8 text-center">
            <span className="inline-flex w-14 h-14 rounded-2xl bg-td-tonal text-td-forest dark:bg-green-900/40 dark:text-green-300 items-center justify-center mb-3" aria-hidden="true">
              <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <path d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 00-4-5.7V5a2 2 0 10-4 0v.3A6 6 0 006 11v3.2c0 .5-.2 1-.6 1.4L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </span>
            <p className="text-[15px] text-td-sage dark:text-gray-300">
              No notifications to display
            </p>
          </div>
        )}
      </section>
    </div>
  );
};

export default NotificationList;
