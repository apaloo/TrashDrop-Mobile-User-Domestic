import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext.js';
import LoadingSpinner from '../components/LoadingSpinner.js';
import supabase from '../utils/supabaseClient.js';
import { Link } from 'react-router-dom';
import { subscribeToRewardsUpdates, handleRewardsUpdate } from '../utils/realtime.js';
import { userService } from '../services/userService.js';

/**
 * Rewards page component for viewing and redeeming rewards
 */
const Rewards = () => {
  const { user } = useAuth();
  const [userPoints, setUserPoints] = useState(0);
  const [rewards, setRewards] = useState([]);
  const [pointsHistory, setPointsHistory] = useState([]);
  const [recentRedemptions, setRecentRedemptions] = useState([]);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);
  const [isRedemptionsLoading, setIsRedemptionsLoading] = useState(true);
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [redeemSuccess, setRedeemSuccess] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const mountedRef = useRef(true);
  const isLoadingRef = useRef(false);

  const fetchPointsHistory = async (limit = 10) => {
    if (!user) return;
    
    setIsHistoryLoading(true);
    try {
      console.log('[Rewards] Fetching points history from source tables');
      
      // Fetch from actual source tables (same as userService architecture)
      const [pickupResult, dumpingResult, scanResult] = await Promise.allSettled([
        // Pickup requests with points_earned
        supabase
          .from('pickup_requests')
          .select('id, created_at, waste_type, bag_count, status, points_earned')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
        
        // Dumping reports with severity for points calculation
        supabase
          .from('illegal_dumping_mobile')
          .select('id, created_at, waste_type, severity')
          .eq('reported_by', user.id)
          .order('created_at', { ascending: false }),
        
        // QR scans from user_activity
        supabase
          .from('user_activity')
          .select('id, created_at, activity_type, points_impact')
          .eq('user_id', user.id)
          .eq('activity_type', 'qr_scan')
          .order('created_at', { ascending: false })
      ]);
      
      let allActivities = [];
      
      // Process pickup requests
      if (pickupResult.status === 'fulfilled' && pickupResult.value?.data) {
        const pickups = pickupResult.value.data.map(pickup => ({
          id: pickup.id,
          activity: 'Pickup Request',
          date: new Date(pickup.created_at).toLocaleDateString(),
          points: pickup.points_earned || 10,
          details: `${pickup.waste_type || 'Waste'} - ${pickup.bag_count || 1} bag(s)`,
          timestamp: pickup.created_at,
          type: 'pickup_request'
        }));
        allActivities = [...allActivities, ...pickups];
      }
      
      // Process dumping reports
      if (dumpingResult.status === 'fulfilled' && dumpingResult.value?.data) {
        const reports = dumpingResult.value.data.map(report => {
          // Calculate points based on severity (same as userService)
          const severity = report.severity || 'medium';
          let points = 15; // default for medium
          if (severity === 'high') points = 20;
          else if (severity === 'low') points = 10;
          
          return {
            id: report.id,
            activity: 'Dumping Report',
            date: new Date(report.created_at).toLocaleDateString(),
            points: points,
            details: `${report.waste_type || 'Illegal dumping'} (${severity} severity)`,
            timestamp: report.created_at,
            type: 'dumping_report'
          };
        });
        allActivities = [...allActivities, ...reports];
      }
      
      // Process QR scans
      if (scanResult.status === 'fulfilled' && scanResult.value?.data) {
        const scans = scanResult.value.data.map(scan => ({
          id: scan.id,
          activity: 'QR Code Scan',
          date: new Date(scan.created_at).toLocaleDateString(),
          points: scan.points_impact || 5,
          details: 'QR code scanned for points',
          timestamp: scan.created_at,
          type: 'qr_scan'
        }));
        allActivities = [...allActivities, ...scans];
      }
      
      // Sort all activities by timestamp (newest first) and limit
      const sortedActivities = allActivities
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, limit);
      
      console.log(`[Rewards] Found ${sortedActivities.length} point-earning activities`);
      setPointsHistory(sortedActivities);
      
    } catch (error) {
      console.error('Error fetching points history:', error);
      setPointsHistory([]);
    } finally {
      setIsHistoryLoading(false);
    }
  };

  const fetchRecentRedemptions = async (limit = 5) => {
    if (!user) return;
    
    setIsRedemptionsLoading(true);
    try {
      console.log('[Rewards] Fetching recent redemptions');
      
      // Fetch redemptions with reward details
      const { data: redemptions, error } = await supabase
        .from('rewards_redemption')
        .select(`
          id,
          created_at,
          points_spent,
          status,
          rewards (
            id,
            name,
            description,
            image_url
          )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(limit);
      
      if (error) {
        console.warn('Error fetching redemptions:', error);
        setRecentRedemptions([]);
        return;
      }
      
      if (redemptions && redemptions.length > 0) {
        const formattedRedemptions = redemptions.map(redemption => ({
          id: redemption.id,
          rewardName: redemption.rewards?.name || 'Unknown Reward',
          rewardDescription: redemption.rewards?.description || '',
          rewardImage: redemption.rewards?.image_url || '',
          pointsSpent: redemption.points_spent,
          status: redemption.status,
          redeemedAt: new Date(redemption.created_at).toLocaleDateString(),
          timestamp: redemption.created_at
        }));
        
        setRecentRedemptions(formattedRedemptions);
        console.log(`[Rewards] Found ${formattedRedemptions.length} recent redemptions`);
      } else {
        setRecentRedemptions([]);
      }
    } catch (error) {
      console.error('Error fetching recent redemptions:', error);
      setRecentRedemptions([]);
    } finally {
      setIsRedemptionsLoading(false);
    }
  };

  // Helper function to assign points based on activity type
  const getPointsForActivity = (activityType) => {
    switch (activityType) {
      case 'pickup_request': return 10;
      case 'dumping_report': return 15; // Default medium severity
      case 'qr_scan': return 5;
      case 'reward_redemption': return 0; // No points gained for redemption
      case 'batch_scan': return 8;
      default: return 5;
    }
  };

  // Cleanup function for component unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Handle page visibility changes to prevent unnecessary reloads
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && mountedRef.current) {
        console.log('[Rewards] Page became visible - checking if data refresh needed');
        // Only refresh if we don't have data or it's been a while
        if (rewards.length === 0 || userPoints === 0) {
          console.log('[Rewards] Refreshing data after visibility change');
          // Don't reload everything, just refresh if needed
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [rewards.length, userPoints]);
  
  // Set up real-time subscriptions for rewards updates
  useEffect(() => {
    if (!user?.id) return;

    console.log('[Rewards] Setting up real-time rewards subscription');
    const subscription = subscribeToRewardsUpdates(user.id, (tableType, payload) => {
      if (!mountedRef.current) return;

      console.log(`[Rewards] Real-time ${tableType} update received`);      
      
      // Handle real-time updates without depending on current state
      if (tableType === 'rewards') {
        // Refresh rewards data when rewards table changes
        const fetchUpdatedRewards = async () => {
          try {
            const { data: rewardsData, error } = await supabase
              .from('rewards')
              .select('*')
              .eq('active', true)
              .order('points_cost', { ascending: true });
            
            if (!error && rewardsData) {
              const formattedRewards = rewardsData.map(reward => ({
                id: reward.id,
                name: reward.name,
                description: reward.description,
                pointsCost: reward.points_cost,
                image: reward.image_url || `https://images.unsplash.com/photo-1560472354-b33ff0c44a43?w=300&h=200&fit=crop`,
                expiresAt: reward.expires_at,
                partnerId: reward.partner_id,
                category: reward.category
              }));
              setRewards(formattedRewards);
            }
          } catch (error) {
            console.warn('[Rewards] Error refreshing rewards:', error);
          }
        };
        fetchUpdatedRewards();
      }
      
      if (tableType === 'pickup_requests') {
        // Refresh user points when pickup requests change
        const refreshUserPoints = async () => {
          try {
            const statsResult = await userService.getUserStats(user.id);
            if (!statsResult.error) {
              setUserPoints(statsResult.data.points || 0);
            }
          } catch (error) {
            console.warn('[Rewards] Error refreshing points:', error);
          }
        };
        refreshUserPoints();
      }
      
      // For user_activity updates, refresh points history
      if (tableType === 'user_activity' && payload.eventType === 'INSERT') {
        fetchPointsHistory(showAllHistory ? 50 : 3);
      }
    });

    return () => {
      console.log('[Rewards] Cleaning up real-time rewards subscription');
      subscription.unsubscribe();
    };
  }, [user?.id, showAllHistory]);
  
  useEffect(() => {
    // Fetch user points and available rewards from Supabase
    const fetchRewardsData = async () => {
      if (!user) return;
      
      // Prevent concurrent loads
      if (isLoadingRef.current) {
        console.log('[Rewards] Already loading, skipping duplicate fetch');
        return;
      }
      
      isLoadingRef.current = true;
      setIsLoading(true);
      setErrorMessage('');
      
      try {
        // Fetch user points from pickup_requests table via userService (single source of truth)
        const statsResult = await userService.getUserStats(user.id);
        
        if (statsResult.error) {
          console.warn('Error fetching user stats:', statsResult.error);
          setUserPoints(0);
        } else {
          // Use points calculated from pickup_requests table
          setUserPoints(statsResult.data.points || 0);
          console.log('[Rewards] Loaded user points from pickup_requests table:', statsResult.data.points || 0);
        }
        
        // Fetch available rewards from Supabase
        const { data: rewardsData, error: rewardsError } = await supabase
          .from('rewards')
          .select('*')
          .eq('active', true)
          .order('points_cost', { ascending: true });
        
        if (rewardsError) {
          console.warn('Error fetching rewards:', rewardsError);
          setRewards([]);
        } else if (rewardsData && rewardsData.length > 0) {
          // Format rewards data to match our component's expected structure
          const formattedRewards = rewardsData.map(reward => ({
            id: reward.id,
            name: reward.name,
            description: reward.description,
            pointsCost: reward.points_cost,
            image: reward.image_url || `https://images.unsplash.com/photo-1560472354-b33ff0c44a43?w=300&h=200&fit=crop`,
            expiresAt: reward.expires_at,
            partnerId: reward.partner_id,
            category: reward.category
          }));
          
          setRewards(formattedRewards);
          console.log('[Rewards] Loaded rewards from database:', formattedRewards.length);
        } else {
          // No rewards found in database
          console.log('[Rewards] No rewards found in database');
          setRewards([]);
        }
        
        // Fetch initial points history (limited to 10 entries)
        await fetchPointsHistory();
        
        // Fetch recent redemptions
        await fetchRecentRedemptions();
      } catch (error) {
        console.error('Error fetching rewards data:', error);
        setErrorMessage('Failed to load rewards. Please try again later.');
      } finally {
        isLoadingRef.current = false;
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
        .from('rewards_redemption')
        .insert([
          {
            user_id: user.id,
            reward_id: reward.id,
            points_spent: reward.pointsCost,
            status: 'pending'
          }
        ])
        .select();
      
      if (redemptionError) throw redemptionError;
      
      console.log('[Rewards] Successfully recorded reward redemption:', redemptionData);
      
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
    <div className="flex flex-col h-full">
      {/* Fixed Points summary header */}
      <div className="sticky top-0 z-10 bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md mb-6">
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
      
      {/* Scrollable content area */}
      <div className="flex-1 overflow-y-auto space-y-6 pb-6">
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
      
      {/* Recent Redemptions */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
        <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-4">Recent Redemptions</h2>
        
        {isRedemptionsLoading ? (
          <div className="py-8 text-center">
            <LoadingSpinner size="md" />
          </div>
        ) : recentRedemptions.length > 0 ? (
          <div className="space-y-4">
            {recentRedemptions.map(redemption => (
              <div key={redemption.id} className="flex items-center p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                {redemption.rewardImage && (
                  <img 
                    src={redemption.rewardImage} 
                    alt={redemption.rewardName}
                    className="w-16 h-16 object-cover rounded-lg mr-4"
                  />
                )}
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-800 dark:text-white">{redemption.rewardName}</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-300">{redemption.rewardDescription}</p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      Redeemed on {redemption.redeemedAt}
                    </span>
                    <div className="flex items-center">
                      <span className="text-sm font-medium text-red-600 dark:text-red-400">
                        -{redemption.pointsSpent} points
                      </span>
                      <span className={`ml-2 px-2 py-1 text-xs rounded-full ${
                        redemption.status === 'pending' 
                          ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                          : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                      }`}>
                        {redemption.status}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-gray-500 dark:text-gray-400">You haven't redeemed any rewards yet.</p>
            <p className="text-gray-500 dark:text-gray-400 mt-1">Redeem a reward to see it here.</p>
          </div>
        )}
      </div>
      
      {/* Points history */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-800 dark:text-white">Points History</h2>
          <button 
            className="text-sm text-primary dark:text-primary-light hover:underline focus:outline-none"
            onClick={() => {
              if (showAllHistory) {
                // If already showing all, revert to just 10
                fetchPointsHistory(10);
              } else {
                // Show all history (limit set to 100, can be adjusted)
                fetchPointsHistory(100);
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
                    <td className="px-6 py-4 text-sm text-gray-800 dark:text-white">
                      <div className="font-medium">{item.activity}</div>
                      {item.details && (
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {item.details}
                        </div>
                      )}
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
    </div>
  );
};

export default Rewards;
