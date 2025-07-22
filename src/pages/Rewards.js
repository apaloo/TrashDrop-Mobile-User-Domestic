import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.js';
import LoadingSpinner from '../components/LoadingSpinner.js';
import supabase from '../utils/supabaseClient.js';
import { Link } from 'react-router-dom';

/**
 * Rewards page component for viewing and redeeming rewards
 */
const Rewards = () => {
  const { user } = useAuth();
  const [userPoints, setUserPoints] = useState(0);
  const [rewards, setRewards] = useState([]);
  const [pointsHistory, setPointsHistory] = useState([]);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [redeemSuccess, setRedeemSuccess] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  const fetchPointsHistory = async (limit = 3) => {
    if (!user) return;
    
    setIsHistoryLoading(true);
    try {
      // Fetch user activity with points changes from Supabase
      const { data, error } = await supabase
        .from('user_activity')
        .select('*')
        .eq('user_id', user.id)
        .not('points', 'is', null)
        .order('created_at', { ascending: false })
        .limit(limit);
      
      if (error) throw error;
      
      if (data) {
        // Format activity data for display
        const formattedHistory = data.map(activity => ({
          id: activity.id,
          activity: activity.activity_type.replace(/_/g, ' '),
          date: new Date(activity.created_at).toLocaleDateString(),
          points: activity.points,
          details: activity.details
        }));
        
        setPointsHistory(formattedHistory);
      }
    } catch (error) {
      console.error('Error fetching points history:', error);
    } finally {
      setIsHistoryLoading(false);
    }
  };

  useEffect(() => {
    // Fetch user points and available rewards from Supabase
    const fetchRewardsData = async () => {
      if (!user) return;
      
      setIsLoading(true);
      setErrorMessage('');
      
      try {
        // Fetch user stats to get current points
        const { data: userStats, error: userStatsError } = await supabase
          .from('user_stats')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle();
        
        if (userStatsError && userStatsError.code !== 'PGRST116') {
          console.warn('Error fetching user stats:', userStatsError);
        }
        
        if (userStats) {
          // Calculate points from available stats or use a default
          const calculatedPoints = (userStats.total_pickups || 0) * 10 + (userStats.total_reports || 0) * 5;
          setUserPoints(calculatedPoints);
        }
        
        // Fetch available rewards from Supabase
        const { data: rewardsData, error: rewardsError } = await supabase
          .from('rewards')
          .select('*')
          .eq('is_active', true)
          .order('points_cost', { ascending: true });
        
        if (rewardsError) throw rewardsError;
        
        if (rewardsData) {
          // Format rewards data to match our component's expected structure
          const formattedRewards = rewardsData.map(reward => ({
            id: reward.id,
            name: reward.name,
            description: reward.description,
            pointsCost: reward.points_cost,
            image: reward.image_url || `https://source.unsplash.com/random/300x200/?${reward.name.toLowerCase().replace(/\s/g, '')}`,
            expiresAt: reward.expires_at,
            partnerId: reward.partner_id
          }));
          
          setRewards(formattedRewards);
        }
        
        // Fetch initial points history (limited to 3 entries)
        await fetchPointsHistory();
      } catch (error) {
        console.error('Error fetching rewards data:', error);
        setErrorMessage('Failed to load rewards. Please try again later.');
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchRewardsData();
  }, [user]);

  const handleRedeemReward = async (reward) => {
    if (!user) {
      setErrorMessage('You must be logged in to redeem rewards');
      setTimeout(() => setErrorMessage(''), 3000);
      return;
    }
    
    if (userPoints < reward.pointsCost) {
      setErrorMessage('Not enough points to redeem this reward');
      setTimeout(() => setErrorMessage(''), 3000);
      return;
    }
    
    setIsRedeeming(true);
    setRedeemSuccess(null);
    setErrorMessage('');
    
    try {
      // Generate a unique redemption code
      const redemptionCode = `REWARD-${reward.id}-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
      
      // Insert redemption record in Supabase
      const { data: redemptionData, error: redemptionError } = await supabase
        .from('redemptions')
        .insert([
          {
            user_id: user.id,
            reward_id: reward.id,
            points_cost: reward.pointsCost,
            redemption_code: redemptionCode,
            status: 'redeemed',
            redeemed_at: new Date().toISOString()
          }
        ])
        .select();
      
      if (redemptionError) throw redemptionError;
      
      // Update user points in the database (deduct cost)
      const { error: pointsError } = await supabase.rpc('decrement_user_points', { 
        user_id_param: user.id, 
        points_to_subtract: reward.pointsCost 
      });
      
      if (pointsError) throw pointsError;
      
      // Record activity
      await supabase.from('user_activity').insert([
        {
          user_id: user.id,
          activity_type: 'reward_redemption',
          status: 'completed',
          points: -reward.pointsCost, // negative as points are spent
          details: {
            reward_id: reward.id,
            reward_name: reward.name,
            redemption_code: redemptionCode
          },
          created_at: new Date().toISOString()
        }
      ]);
      
      // Update local state
      setUserPoints(prev => prev - reward.pointsCost);
      
      // Show success message
      setRedeemSuccess({
        id: reward.id,
        message: `Successfully redeemed ${reward.name}!`,
        code: redemptionCode,
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
          <button 
            className="text-sm text-primary dark:text-primary-light hover:underline focus:outline-none"
            onClick={() => {
              if (showAllHistory) {
                // If already showing all, revert to just 3
                fetchPointsHistory();
              } else {
                // Show all history (limit set to 50, can be adjusted)
                fetchPointsHistory(50);
              }
              setShowAllHistory(!showAllHistory);
            }}
          >
            {showAllHistory ? "Show Less" : "View All"}
          </button>
        </div>
        
        <div className="overflow-x-auto">
          {isHistoryLoading ? (
            <div className="py-8 text-center">
              <LoadingSpinner size="md" />
            </div>
          ) : pointsHistory.length > 0 ? (
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
                {pointsHistory.map(item => (
                  <tr key={item.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800 dark:text-white">
                      {item.activity.replace(/_/g, ' ').split(' ').map(word => 
                        word.charAt(0).toUpperCase() + word.slice(1)
                      ).join(' ')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
                      {item.date}
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm text-right font-medium ${item.points >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {item.points > 0 ? `+${item.points}` : item.points}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="text-center py-8">
              <p className="text-gray-500 dark:text-gray-400">No points history found.</p>
              <p className="text-gray-500 dark:text-gray-400 mt-1">Earn points by requesting pickups, reporting illegal dumping, and scanning QR codes.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Rewards;
