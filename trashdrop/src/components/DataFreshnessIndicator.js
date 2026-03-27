/**
 * Data Freshness Indicator Component
 * Shows users when data was last updated and current cache status
 */

import React from 'react';

const DataFreshnessIndicator = ({ dataSource, updateType, lastUpdate }) => {
  const getStatusColor = () => {
    switch (dataSource) {
      case 'seamless':
        return 'bg-green-100 text-green-700 border-green-300';
      case 'network':
        return 'bg-blue-100 text-blue-700 border-blue-300';
      case 'cache':
        return 'bg-yellow-100 text-yellow-700 border-yellow-300';
      case 'error':
        return 'bg-red-100 text-red-700 border-red-300';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-300';
    }
  };

  const getStatusText = () => {
    switch (dataSource) {
      case 'seamless':
        return 'Live';
      case 'network':
        return 'Updated';
      case 'cache':
        return 'Cached';
      case 'error':
        return 'Error';
      default:
        return 'Loading';
    }
  };

  const getUpdateIndicator = () => {
    switch (updateType) {
      case 'optimistic':
        return '🔄 Updating...';
      case 'background':
        return '⏳ Syncing...';
      case 'manual':
        return '🔄 Refreshing...';
      case 'refreshed':
        return '✅ Just updated';
      case 'error':
        return '❌ Update failed';
      case 'confirmed':
        return '✅ Confirmed';
      case 'rollback':
        return '↩️ Rolled back';
      default:
        return '';
    }
  };

  const formatRelativeTime = (timestamp) => {
    if (!timestamp) return '';
    
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (seconds < 60) return 'just now';
    if (minutes < 2) return '1 min ago';
    if (minutes < 60) return `${minutes} min ago`;
    if (hours < 2) return '1 hour ago';
    return `${hours} hours ago`;
  };

  return (
    <div className="fixed top-20 right-4 z-30">
      <div className={`px-3 py-1 rounded-full text-xs font-semibold border ${getStatusColor()} transition-all duration-300`}>
        <div className="flex items-center space-x-2">
          <span className="flex items-center">
            {getStatusText()}
            {updateType && updateType !== 'stable' && updateType !== 'initial' && (
              <span className="ml-1 text-xs">{getUpdateIndicator()}</span>
            )}
          </span>
          {lastUpdate && (
            <span className="text-xs opacity-75">
              {formatRelativeTime(lastUpdate)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default DataFreshnessIndicator;
