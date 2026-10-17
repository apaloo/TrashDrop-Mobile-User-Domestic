import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';
import { getCoverageArrivals, closeCoverageWaitlistEntry } from '../services/serviceCoverageService.js';

/**
 * "We've arrived" banner for places the user waitlisted from the location step
 * ("Notify me when you arrive") that TrashDrop now covers. Coverage is checked
 * live each time the app loads, so no notification job is involved. The entry
 * closes when the user books or dismisses, and the banner then moves on to the
 * next arrival, if any.
 */
const CoverageArrivalBanner = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [arrivals, setArrivals] = useState([]);

  useEffect(() => {
    if (!user) return undefined;

    let isCancelled = false;
    getCoverageArrivals().then(result => {
      if (!isCancelled) setArrivals(result);
    });
    return () => { isCancelled = true; };
  }, [user]);

  if (arrivals.length === 0) return null;

  const arrival = arrivals[0];
  const place = arrival.address || 'the location you saved';

  const close = (reason) => {
    setArrivals(current => current.slice(1));
    closeCoverageWaitlistEntry(arrival.waitlist_id, reason);
  };

  const handleBook = () => {
    close('booked');
    navigate('/digital-bin');
  };

  return (
    <div
      role="status"
      className="bg-green-50 dark:bg-green-900 dark:bg-opacity-20 border border-green-300 dark:border-green-700 rounded-lg p-4"
    >
      <p className="text-sm font-semibold text-green-800 dark:text-green-200">
        Good news! TrashDrop now operates in {arrival.suburb}
      </p>
      <p className="text-sm text-green-700 dark:text-green-300 mt-1">
        You asked us to let you know about {place}. You can now book a pickup there.
      </p>
      <div className="mt-3 flex gap-3">
        <button
          type="button"
          onClick={handleBook}
          className="px-4 py-2 rounded-md text-sm font-semibold bg-green-600 text-white hover:bg-green-700 transition-colors"
        >
          Book a pickup
        </button>
        <button
          type="button"
          onClick={() => close('dismissed')}
          className="px-4 py-2 rounded-md text-sm font-medium text-green-800 dark:text-green-200 hover:underline"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
};

export default CoverageArrivalBanner;
