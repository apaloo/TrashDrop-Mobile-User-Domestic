/**
 * Sync Status Indicator Component
 * Shows background sync status and offline capabilities
 */

import React, { useState, useEffect } from 'react';
import syncService from '../services/syncService.js';

const SyncStatusIndicator = ({ showDetails = false, className = '' }) => {
  const [syncStatus, setSyncStatus] = useState({
    isOnline: navigator.onLine,
    syncInProgress: false,
    pendingReports: 0,
    pendingBins: 0,
    totalPending: 0
  });
  const [lastSync, setLastSync] = useState(null);

  useEffect(() => {
    // Update sync status periodically
    const updateStatus = () => {
      const status = syncService.getSyncStatus();
      setSyncStatus(status);
    };

    // Initial status
    updateStatus();

    // Update every 5 seconds
    const interval = setInterval(updateStatus, 5000);

    // Listen for online/offline events
    const handleOnline = () => {
      updateStatus();
      setLastSync(new Date());
    };

    const handleOffline = () => {
      updateStatus();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Cleanup
    return () => {
      clearInterval(interval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const getStatusColor = () => {
    if (!syncStatus.isOnline) return 'bg-red-500';
    if (syncStatus.syncInProgress) return 'bg-yellow-500';
    if (syncStatus.totalPending > 0) return 'bg-orange-500';
    return 'bg-green-500';
  };

  const getStatusText = () => {
    if (!syncStatus.isOnline) return 'Offline';
    if (syncStatus.syncInProgress) return 'Syncing...';
    if (syncStatus.totalPending > 0) return `${syncStatus.totalPending} pending`;
    return 'Synced';
  };

  const getStatusIcon = () => {
    if (!syncStatus.isOnline) {
      return (
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M13.477 14.89A6 6 0 015.11 6.524l8.367 8.368zm1.414-1.414L6.524 5.11a6 6 0 018.367 8.367zM18 10a8 8 0 11-16 0 8 8 0 0116 0z" clipRule="evenodd" />
        </svg>
      );
    }

    if (syncStatus.syncInProgress) {
      return (
        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      );
    }

    if (syncStatus.totalPending > 0) {
      return (
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
        </svg>
      );
    }

    return (
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
      </svg>
    );
  };

  const handleForceSync = async () => {
    if (syncStatus.isOnline && !syncStatus.syncInProgress) {
      await syncService.forcSync();
      setLastSync(new Date());
    }
  };

  if (!showDetails) {
    // Compact indicator
    return (
      <div className={`flex items-center space-x-2 ${className}`}>
        <div className={`w-2 h-2 rounded-full ${getStatusColor()}`}></div>
        <span className="text-sm text-gray-600 dark:text-gray-400">
          {getStatusText()}
        </span>
      </div>
    );
  }

  // Detailed status card
  return (
    <div className={`bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          <div className={`w-3 h-3 rounded-full ${getStatusColor()}`}></div>
          <span className="font-medium text-gray-900 dark:text-white">
            Sync Status
          </span>
        </div>
        <div className="text-gray-500 dark:text-gray-400">
          {getStatusIcon()}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-600 dark:text-gray-400">Connection:</span>
          <span className={`font-medium ${syncStatus.isOnline ? 'text-green-600' : 'text-red-600'}`}>
            {syncStatus.isOnline ? 'Online' : 'Offline'}
          </span>
        </div>

        {syncStatus.totalPending > 0 && (
          <>
            {syncStatus.pendingReports > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Pending Reports:</span>
                <span className="font-medium text-orange-600">
                  {syncStatus.pendingReports}
                </span>
              </div>
            )}
            
            {syncStatus.pendingBins > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Pending Bins:</span>
                <span className="font-medium text-orange-600">
                  {syncStatus.pendingBins}
                </span>
              </div>
            )}
          </>
        )}

        {lastSync && (
          <div className="flex justify-between text-sm">
            <span className="text-gray-600 dark:text-gray-400">Last Sync:</span>
            <span className="font-medium text-gray-900 dark:text-white">
              {lastSync.toLocaleTimeString()}
            </span>
          </div>
        )}

        {syncStatus.isOnline && !syncStatus.syncInProgress && syncStatus.totalPending > 0 && (
          <button
            onClick={handleForceSync}
            className="w-full mt-3 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md transition-colors duration-200"
          >
            Sync Now
          </button>
        )}

        {!syncStatus.isOnline && syncStatus.totalPending > 0 && (
          <div className="mt-3 p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded-md">
            <p className="text-xs text-yellow-800 dark:text-yellow-200">
              Data will sync automatically when connection is restored.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SyncStatusIndicator;
