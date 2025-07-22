import React from 'react';
import { useNavigate } from 'react-router-dom';
import NotificationList from '../components/NotificationList.js';

/**
 * Notifications page
 * Displays user notifications and allows managing notification preferences
 */
const Notifications = () => {
  const navigate = useNavigate();

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center text-primary hover:text-primary-dark transition-colors mb-4"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Dashboard
          </button>
          
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              Notifications
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Stay updated with pickup requests, system alerts, and more
            </p>
          </div>
        </div>

        <NotificationList />
      </div>
    </div>
  );
};

export default Notifications;
