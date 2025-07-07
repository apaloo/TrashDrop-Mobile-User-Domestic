import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';

/**
 * Rewards page component for viewing and redeeming rewards
 */
const Rewards = () => {
  const { user } = useAuth();
  const [userPoints, setUserPoints] = useState(0);
  const [rewards, setRewards] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [redeemSuccess, setRedeemSuccess] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    // Simulate fetching user points and available rewards
    const fetchRewardsData = async () => {
      setIsLoading(true);
      
      try {
        // In a real app, these would be API calls
        // Mock data for development
        setTimeout(() => {
          setUserPoints(250);
          
          setRewards([
            { 
              id: 1, 
              name: 'Coffee Voucher', 
              description: 'Free coffee at participating local cafés',
              pointsCost: 100,
              image: 'https://source.unsplash.com/random/300x200/?coffee',
              expiresAt: '2025-12-31',
              partnerId: 'cafe-partner'
            },
            { 
              id: 2, 
              name: 'Movie Ticket', 
              description: 'One free movie ticket at City Cinema',
              pointsCost: 200,
              image: 'https://source.unsplash.com/random/300x200/?movie',
              expiresAt: '2025-12-31',
              partnerId: 'cinema-partner'
            },
            { 
              id: 3, 
              name: 'Public Transit Pass', 
              description: 'One-day unlimited rides on public transportation',
              pointsCost: 150,
              image: 'https://source.unsplash.com/random/300x200/?bus',
              expiresAt: '2025-12-31',
              partnerId: 'transit-partner'
            },
            { 
              id: 4, 
              name: 'Plant a Tree', 
              description: 'We\'ll plant a tree in your name in the city park',
              pointsCost: 75,
              image: 'https://source.unsplash.com/random/300x200/?tree',
              expiresAt: '2025-12-31',
              partnerId: 'environmental-partner'
            },
            { 
              id: 5, 
              name: '$10 Grocery Voucher', 
              description: '$10 off your next purchase at Local Market',
              pointsCost: 300,
              image: 'https://source.unsplash.com/random/300x200/?grocery',
              expiresAt: '2025-12-31',
              partnerId: 'grocery-partner'
            },
          ]);
          
          setIsLoading(false);
        }, 1000);
      } catch (error) {
        console.error('Error fetching rewards data:', error);
        setErrorMessage('Failed to load rewards. Please try again later.');
        setIsLoading(false);
      }
    };
    
    fetchRewardsData();
  }, []);

  const handleRedeemReward = async (reward) => {
    if (userPoints < reward.pointsCost) {
      setErrorMessage('Not enough points to redeem this reward');
      setTimeout(() => setErrorMessage(''), 3000);
      return;
    }
    
    setIsRedeeming(true);
    setRedeemSuccess(null);
    setErrorMessage('');
    
    try {
      // In a real app, this would be an API call
      console.log('Redeeming reward:', reward);
      
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Update user points (deduct cost)
      setUserPoints(prev => prev - reward.pointsCost);
      
      // Show success message
      setRedeemSuccess({
        id: reward.id,
        message: `Successfully redeemed ${reward.name}!`,
        code: `REWARD-${reward.id}-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
      });
    } catch (error) {
      console.error('Error redeeming reward:', error);
      setErrorMessage('Failed to redeem reward. Please try again.');
    } finally {
      setIsRedeeming(false);
    }
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
      {/* Points summary */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">My Rewards</h1>
          
          <div className="bg-primary/10 dark:bg-primary-dark/20 px-4 py-2 rounded-full">
            <span className="text-primary dark:text-primary-light font-semibold flex items-center">
              <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
              </svg>
              {userPoints} Points
            </span>
          </div>
        </div>
        
        <p className="mt-2 text-gray-600 dark:text-gray-300">
          Earn points by requesting pickups, reporting illegal dumping, and scanning QR codes.
        </p>
      </div>
      
      {/* Error message */}
      {errorMessage && (
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded-md" role="alert">
          <p>{errorMessage}</p>
        </div>
      )}
      
      {/* Rewards list */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
        <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-4">Available Rewards</h2>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {rewards.map((reward) => (
            <div 
              key={reward.id} 
              className={`bg-gray-50 dark:bg-gray-700 rounded-lg overflow-hidden shadow-sm border border-gray-200 dark:border-gray-600 transition-all ${
                userPoints >= reward.pointsCost 
                  ? 'hover:shadow-md hover:-translate-y-1' 
                  : 'opacity-70'
              }`}
            >
              <div className="h-40 bg-gray-200 dark:bg-gray-600 overflow-hidden">
                {reward.image && (
                  <img 
                    src={reward.image} 
                    alt={reward.name} 
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.target.onerror = null;
                      e.target.src = 'https://via.placeholder.com/300x200?text=Reward';
                    }}
                  />
                )}
              </div>
              
              <div className="p-4">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="text-lg font-medium text-gray-800 dark:text-white">{reward.name}</h3>
                  <span className="bg-primary/10 dark:bg-primary-dark/20 text-primary dark:text-primary-light text-sm px-2 py-1 rounded-full">
                    {reward.pointsCost} Points
                  </span>
                </div>
                
                <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
                  {reward.description}
                </p>
                
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                  Expires: {new Date(reward.expiresAt).toLocaleDateString()}
                </div>
                
                {redeemSuccess && redeemSuccess.id === reward.id ? (
                  <div className="bg-green-100 dark:bg-green-900/30 border border-green-400 dark:border-green-700 text-green-700 dark:text-green-300 p-3 rounded-md text-sm">
                    <p>{redeemSuccess.message}</p>
                    <p className="font-mono font-bold mt-1">{redeemSuccess.code}</p>
                  </div>
                ) : (
                  <button
                    onClick={() => handleRedeemReward(reward)}
                    disabled={isRedeeming || userPoints < reward.pointsCost}
                    className={`w-full px-4 py-2 text-sm font-medium rounded-md ${
                      userPoints >= reward.pointsCost 
                        ? 'bg-primary hover:bg-primary-dark text-white' 
                        : 'bg-gray-300 dark:bg-gray-600 text-gray-600 dark:text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    {isRedeeming ? (
                      <LoadingSpinner size="sm" color="white" />
                    ) : userPoints >= reward.pointsCost ? (
                      'Redeem Reward'
                    ) : (
                      `Need ${reward.pointsCost - userPoints} more points`
                    )}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        
        {rewards.length === 0 && !isLoading && (
          <div className="text-center py-12">
            <p className="text-gray-500 dark:text-gray-400">No rewards available at this time.</p>
          </div>
        )}
      </div>
      
      {/* Reward history */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
        <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-4">Recent Redemptions</h2>
        
        {/* In a real app, this would be populated from API data */}
        <div className="text-center py-8">
          <p className="text-gray-500 dark:text-gray-400">You haven't redeemed any rewards yet.</p>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Redeem a reward to see it here.</p>
        </div>
      </div>
      
      {/* Points history */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-800 dark:text-white">Points History</h2>
          <span className="text-sm text-primary dark:text-primary-light hover:underline cursor-pointer">
            View All
          </span>
        </div>
        
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Activity
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Date
                </th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Points
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              <tr>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800 dark:text-white">
                  Reported Illegal Dumping
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
                  2025-07-01
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-green-600 dark:text-green-400 font-medium">
                  +30
                </td>
              </tr>
              <tr>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800 dark:text-white">
                  QR Code Scan
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
                  2025-06-29
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-green-600 dark:text-green-400 font-medium">
                  +15
                </td>
              </tr>
              <tr>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800 dark:text-white">
                  Scheduled Pickup
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
                  2025-06-25
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-green-600 dark:text-green-400 font-medium">
                  +50
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Rewards;
