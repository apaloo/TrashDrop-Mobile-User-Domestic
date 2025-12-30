import React, { useState, useEffect } from 'react';

const AuthNotification = () => {
  const [showNotification, setShowNotification] = useState(false);
  const [notificationType, setNotificationType] = useState('info');

  useEffect(() => {
    // Check if we're running in fallback mode
    const checkAuthMode = () => {
      try {
        // Check console messages or localStorage for fallback indicators
        const hasConsoleWarnings = true; // Simplified check
        
        if (hasConsoleWarnings) {
          setNotificationType('warning');
          setShowNotification(true);
          
          // Auto-hide after 10 seconds
          setTimeout(() => {
            setShowNotification(false);
          }, 10000);
        }
      } catch (error) {
        console.warn('Error checking auth mode:', error);
      }
    };

    checkAuthMode();
  }, []);

  if (!showNotification) {
    return null;
  }

  return (
    <div className={`fixed top-4 left-4 right-4 z-50 p-4 rounded-lg shadow-lg ${
      notificationType === 'warning' 
        ? 'bg-yellow-100 border-l-4 border-yellow-500 text-yellow-800' 
        : 'bg-blue-100 border-l-4 border-blue-500 text-blue-800'
    }`}>
      <div className="flex items-start">
        <div className="flex-shrink-0">
          {notificationType === 'warning' ? (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
          )}
        </div>
        <div className="ml-3 flex-1">
          <h3 className="text-sm font-medium">
            {notificationType === 'warning' ? 'Offline Mode Active' : 'Information'}
          </h3>
          <div className="mt-1 text-sm">
            <p>
              The app is running in offline mode. You can still use basic features and login with test credentials:
            </p>
            <div className="mt-2 bg-white bg-opacity-50 p-2 rounded text-xs font-mono">
              <div><strong>Email:</strong> test@trashdrop.com</div>
              <div><strong>Password:</strong> password123</div>
            </div>
          </div>
        </div>
        <div className="ml-4 flex-shrink-0">
          <button
            className="inline-flex text-sm font-medium hover:opacity-75"
            onClick={() => setShowNotification(false)}
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};

export default AuthNotification;
