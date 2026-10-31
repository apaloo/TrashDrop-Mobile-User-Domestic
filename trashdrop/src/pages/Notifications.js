import React from 'react';
import { useNavigate } from 'react-router-dom';
import NotificationList from '../components/NotificationList.js';
import PageHeader from '../components/ui/PageHeader.js';

/**
 * Notifications page
 * Displays user notifications and allows managing notification preferences
 */
const Notifications = () => {
  const navigate = useNavigate();

  return (
    <div className="max-w-3xl mx-auto px-2 pb-24 space-y-4">
      <button
        onClick={() => navigate('/dashboard')}
        className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-td-forest dark:text-green-300 hover:underline"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Dashboard
      </button>
      <PageHeader
        title="Notifications"
        subtitle="Stay updated with pickup requests, system alerts, and more"
      />
      <NotificationList />
    </div>
  );
};

export default Notifications;
