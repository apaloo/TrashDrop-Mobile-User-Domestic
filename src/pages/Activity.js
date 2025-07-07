import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';

/**
 * Activity page to display user's complete activity history
 */
const Activity = () => {
  const { user } = useAuth();
  const [activities, setActivities] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [error, setError] = useState('');
  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    itemsPerPage: 10
  });

  useEffect(() => {
    // Simulate fetching activities from API
    const fetchActivities = async () => {
      setIsLoading(true);
      setError('');
      
      try {
        // In a real app, this would be an API call with pagination and filtering
        // Mock data for development
        setTimeout(() => {
          // Generate mock activities
          const mockActivities = [
            { 
              id: 1, 
              type: 'pickup', 
              status: 'completed', 
              date: '2025-07-01', 
              points: 50, 
              description: 'Household Waste',
              address: '123 Main St, Cityville'
            },
            { 
              id: 2, 
              type: 'report', 
              status: 'verified', 
              date: '2025-06-28', 
              points: 30,
              description: 'Construction Debris',
              address: 'Corner of Oak St and Pine Ave'
            },
            { 
              id: 3, 
              type: 'pickup', 
              status: 'scheduled', 
              date: '2025-07-10', 
              points: 0,
              description: 'Recycling',
              address: '456 Elm St, Cityville'
            },
            { 
              id: 4, 
              type: 'qr_scan', 
              status: 'completed', 
              date: '2025-06-25', 
              points: 15,
              description: 'QR Code Scan',
              address: 'Downtown Public Bin #1423'
            },
            { 
              id: 5, 
              type: 'reward', 
              status: 'redeemed', 
              date: '2025-06-20', 
              points: -100,
              description: 'Coffee Voucher Redeemed',
              address: ''
            },
            { 
              id: 6, 
              type: 'pickup', 
              status: 'canceled', 
              date: '2025-06-15', 
              points: 0,
              description: 'Yard Waste',
              address: '123 Main St, Cityville'
            },
            { 
              id: 7, 
              type: 'report', 
              status: 'investigating', 
              date: '2025-06-10', 
              points: 30,
              description: 'Illegal Dumping - Tires',
              address: 'Behind City Park, near east entrance'
            },
            { 
              id: 8, 
              type: 'qr_scan', 
              status: 'completed', 
              date: '2025-06-05', 
              points: 15,
              description: 'QR Code Scan',
              address: 'City Center Mall Bin #356'
            },
            { 
              id: 9, 
              type: 'reward', 
              status: 'redeemed', 
              date: '2025-06-01', 
              points: -150,
              description: 'Movie Ticket Redeemed',
              address: ''
            },
            { 
              id: 10, 
              type: 'pickup', 
              status: 'completed', 
              date: '2025-05-28', 
              points: 50,
              description: 'Electronics Waste',
              address: '789 Oak St, Cityville'
            },
            { 
              id: 11, 
              type: 'pickup', 
              status: 'completed', 
              date: '2025-05-21', 
              points: 50,
              description: 'Household Waste',
              address: '123 Main St, Cityville'
            },
            { 
              id: 12, 
              type: 'report', 
              status: 'resolved', 
              date: '2025-05-15', 
              points: 30,
              description: 'Illegal Dumping - Furniture',
              address: 'Vacant lot on Maple Dr'
            },
          ];
          
          // Apply filtering if needed
          let filteredActivities = mockActivities;
          if (filter !== 'all') {
            filteredActivities = mockActivities.filter(activity => activity.type === filter);
          }
          
          setActivities(filteredActivities);
          setPagination({
            currentPage: 1,
            totalPages: Math.ceil(filteredActivities.length / 10),
            itemsPerPage: 10
          });
          
          setIsLoading(false);
        }, 1000);
      } catch (error) {
        console.error('Error fetching activities:', error);
        setError('Failed to load activity history. Please try again later.');
        setIsLoading(false);
      }
    };
    
    fetchActivities();
  }, [filter]);

  // Handle filter change
  const handleFilterChange = (newFilter) => {
    setFilter(newFilter);
  };

  // Handle pagination
  const handlePageChange = (newPage) => {
    setPagination(prev => ({
      ...prev,
      currentPage: newPage
    }));
  };

  // Get current page of activities
  const getCurrentPageActivities = () => {
    const startIndex = (pagination.currentPage - 1) * pagination.itemsPerPage;
    const endIndex = startIndex + pagination.itemsPerPage;
    return activities.slice(startIndex, endIndex);
  };

  // Activity type icon component
  const ActivityIcon = ({ type }) => {
    switch(type) {
      case 'pickup':
        return (
          <div className="p-2 rounded-full bg-blue-100 dark:bg-blue-900/30">
            <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
            </svg>
          </div>
        );
      case 'report':
        return (
          <div className="p-2 rounded-full bg-red-100 dark:bg-red-900/30">
            <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
        );
      case 'qr_scan':
        return (
          <div className="p-2 rounded-full bg-green-100 dark:bg-green-900/30">
            <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
            </svg>
          </div>
        );
      case 'reward':
        return (
          <div className="p-2 rounded-full bg-yellow-100 dark:bg-yellow-900/30">
            <svg className="w-5 h-5 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        );
      default:
        return (
          <div className="p-2 rounded-full bg-gray-100 dark:bg-gray-700">
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        );
    }
  };

  // Status badge component
  const StatusBadge = ({ status }) => {
    let bgColor = '';
    let textColor = '';
    
    switch(status) {
      case 'completed':
        bgColor = 'bg-green-100 dark:bg-green-900/30';
        textColor = 'text-green-800 dark:text-green-300';
        break;
      case 'scheduled':
        bgColor = 'bg-blue-100 dark:bg-blue-900/30';
        textColor = 'text-blue-800 dark:text-blue-300';
        break;
      case 'verified':
      case 'investigating':
        bgColor = 'bg-blue-100 dark:bg-blue-900/30';
        textColor = 'text-blue-800 dark:text-blue-300';
        break;
      case 'redeemed':
        bgColor = 'bg-yellow-100 dark:bg-yellow-900/30';
        textColor = 'text-yellow-800 dark:text-yellow-300';
        break;
      case 'canceled':
        bgColor = 'bg-red-100 dark:bg-red-900/30';
        textColor = 'text-red-800 dark:text-red-300';
        break;
      case 'resolved':
        bgColor = 'bg-green-100 dark:bg-green-900/30';
        textColor = 'text-green-800 dark:text-green-300';
        break;
      default:
        bgColor = 'bg-gray-100 dark:bg-gray-700';
        textColor = 'text-gray-800 dark:text-gray-300';
    }
    
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${bgColor} ${textColor}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
        <h1 className="text-2xl font-bold text-gray-800 dark:text-white mb-4">
          Activity History
        </h1>
        <p className="text-gray-600 dark:text-gray-300 mb-6">
          View your complete history of pickups, reports, and rewards.
        </p>
        
        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-6">
          <button 
            onClick={() => handleFilterChange('all')}
            className={`px-4 py-2 rounded-md text-sm ${
              filter === 'all' 
                ? 'bg-primary text-white' 
                : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
            }`}
          >
            All
          </button>
          <button 
            onClick={() => handleFilterChange('pickup')}
            className={`px-4 py-2 rounded-md text-sm ${
              filter === 'pickup' 
                ? 'bg-blue-500 text-white' 
                : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
            }`}
          >
            Pickups
          </button>
          <button 
            onClick={() => handleFilterChange('report')}
            className={`px-4 py-2 rounded-md text-sm ${
              filter === 'report' 
                ? 'bg-red-500 text-white' 
                : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
            }`}
          >
            Reports
          </button>
          <button 
            onClick={() => handleFilterChange('qr_scan')}
            className={`px-4 py-2 rounded-md text-sm ${
              filter === 'qr_scan' 
                ? 'bg-green-500 text-white' 
                : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
            }`}
          >
            QR Scans
          </button>
          <button 
            onClick={() => handleFilterChange('reward')}
            className={`px-4 py-2 rounded-md text-sm ${
              filter === 'reward' 
                ? 'bg-yellow-500 text-white' 
                : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
            }`}
          >
            Rewards
          </button>
        </div>
        
        {error && (
          <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded-md mb-4" role="alert">
            <p>{error}</p>
          </div>
        )}
        
        {/* Activity list */}
        {getCurrentPageActivities().length > 0 ? (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {getCurrentPageActivities().map((activity) => (
              <div key={activity.id} className="py-4 flex items-start">
                <ActivityIcon type={activity.type} />
                
                <div className="ml-4 flex-1">
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start">
                    <div>
                      <h3 className="text-lg font-medium text-gray-800 dark:text-white capitalize">
                        {activity.type === 'qr_scan' ? 'QR Code Scan' : 
                         activity.type === 'pickup' ? 'Waste Pickup' : 
                         activity.type === 'report' ? 'Dumping Report' : 'Reward Redemption'}
                      </h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                        {new Date(activity.date).toLocaleDateString()} • {activity.description}
                      </p>
                      {activity.address && (
                        <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center">
                          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          {activity.address}
                        </p>
                      )}
                    </div>
                    <div className="mt-2 sm:mt-0 flex flex-col sm:items-end">
                      <StatusBadge status={activity.status} />
                      {activity.points !== 0 && (
                        <span className={`mt-2 font-medium ${
                          activity.points > 0 
                            ? 'text-green-600 dark:text-green-400' 
                            : 'text-red-600 dark:text-red-400'
                        }`}>
                          {activity.points > 0 ? '+' : ''}{activity.points} points
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-gray-500 dark:text-gray-400">No activities found for the selected filter.</p>
          </div>
        )}
        
        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex justify-center mt-6 space-x-1">
            <button
              onClick={() => handlePageChange(Math.max(1, pagination.currentPage - 1))}
              disabled={pagination.currentPage === 1}
              className="px-3 py-1 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 disabled:opacity-50"
            >
              &laquo;
            </button>
            
            {[...Array(pagination.totalPages)].map((_, i) => (
              <button
                key={i}
                onClick={() => handlePageChange(i + 1)}
                className={`px-3 py-1 rounded-md ${
                  pagination.currentPage === i + 1
                    ? 'bg-primary text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
                }`}
              >
                {i + 1}
              </button>
            ))}
            
            <button
              onClick={() => handlePageChange(Math.min(pagination.totalPages, pagination.currentPage + 1))}
              disabled={pagination.currentPage === pagination.totalPages}
              className="px-3 py-1 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 disabled:opacity-50"
            >
              &raquo;
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Activity;
