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
      <PageHeader
        onBack={() => navigate('/dashboard')}
        backLabel="Back to Dashboard"
        title="Notifications"
        subtitle="Stay updated with pickup requests, system alerts, and more"
      />
      <NotificationList />
    </div>
  );
};

export default Notifications;
