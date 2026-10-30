import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext.js';
import LoadingSpinner from '../components/LoadingSpinner.js';
import supabase from '../utils/supabaseClient.js';
import { Link } from 'react-router-dom';
import { subscribeToRewardsUpdates, handleRewardsUpdate } from '../utils/realtime.js';
import { userService } from '../services/userService.js';
import RedeemDialog from '../components/rewards/RedeemDialog.js';
import { formatGhanaPhone } from '../utils/ghanaPhone.js';

// Airtime and data rewards: sent by TrashDrop staff to a phone number
const isMobileReward = (reward) => ['airtime', 'data'].includes(reward?.category);

const STATUS_LABELS = {
  pending: { text: 'Pending', className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' },
  sent: { text: 'Sent', className: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' },
  rejected: { text: 'Rejected · points returned', className: 'bg-gray-200 text-td-ink dark:bg-gray-600 dark:text-gray-100' },
};

/**
 * Rewards page component for viewing and redeeming rewards
 */
const Rewards = () => {
  const { user } = useAuth();
  const [userPoints, setUserPoints] = useState(0);
  const [rewards, setRewards] = useState([]);
  const [recentRedemptions, setRecentRedemptions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRedemptionsLoading, setIsRedemptionsLoading] = useState(true);
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [redeemSuccess, setRedeemSuccess] = useState(null);
  const [confirmReward, setConfirmReward] = useState(null);
  const [profilePhone, setProfilePhone] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const mountedRef = useRef(true);
  const isLoadingRef = useRef(false);

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
          phone_number,
          network,
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
          phone: redemption.phone_number,
          network: redemption.network,
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
              .order('points_cost', { ascending: true })
              .order('name', { ascending: true });
            
            if (!error && rewardsData) {
              const formattedRewards = rewardsData.map(reward => ({
                id: reward.id,
                name: reward.name,
                description: reward.description,
                pointsCost: reward.points_cost,
                image: reward.image_url || '',
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

    });

    return () => {
      console.log('[Rewards] Cleaning up real-time rewards subscription');
      subscription.unsubscribe();
    };
  }, [user?.id]);
  
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
          .order('points_cost', { ascending: true })
          .order('name', { ascending: true });
        
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
            image: reward.image_url || '',
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

  // Airtime and data: ask which number and network first (prefilled from the profile)
  const openRedeemDialog = async (reward) => {
    setErrorMessage('');
    setRedeemSuccess(null);
    setConfirmReward(reward);
    if (profilePhone || !user) return;
    try {
      const { data } = await supabase.from('profiles').select('phone').eq('id', user.id).maybeSingle();
      setProfilePhone(data?.phone || user.phone || '');
    } catch {
      setProfilePhone(user.phone || '');
    }
  };

  const handleRedeemReward = async (reward, delivery = null) => {
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
            status: 'pending',
            // Where staff send airtime or data
            ...(delivery ? { phone_number: delivery.phone, network: delivery.network } : {})
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
      
      // Update local state and show it under My Redemptions
      setUserPoints(prev => prev - reward.pointsCost);
      fetchRecentRedemptions();
      
      // Show success message
      setConfirmReward(null);
      setRedeemSuccess(delivery ? {
        id: reward.id,
        message: `Request received. We'll send ${reward.name} to ${formatGhanaPhone(delivery.phone)} (${delivery.network}).`,
      } : {
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
      <div className="sticky top-0 z-10 bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md mb-6" style={{top: '65px'}}>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-td-ink dark:text-white">My Rewards</h1>
          
          <div className="bg-primary/10 dark:bg-primary-dark/20 px-4 py-2 rounded-full">
            <span className="text-primary dark:text-primary-light font-semibold flex items-center">
              <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
              </svg>
              {userPoints} Points
            </span>
          </div>
        </div>
        
        <p className="mt-2 text-td-sage dark:text-gray-300">
          Earn points by requesting pickups, scanning QR codes, and reporting illegal dumping (once your report is verified).
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
        <h2 className="text-xl font-bold text-td-ink dark:text-white mb-4">Available Rewards</h2>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {rewards.map((reward) => (
            <div 
              key={reward.id} 
              className={`bg-td-cream dark:bg-gray-700 rounded-lg overflow-hidden shadow-sm border border-td-border dark:border-gray-600 transition-all ${
                userPoints >= reward.pointsCost 
                  ? 'hover:shadow-md hover:-translate-y-1' 
                  : ''
              }`}
            >
              {/* Out of reach: only the picture fades, so the text stays readable */}
              <div className={`h-40 bg-gray-200 dark:bg-gray-600 overflow-hidden ${userPoints >= reward.pointsCost || !reward.image ? '' : 'opacity-60'}`}>
                {reward.image ? (
                  <img 
                    src={reward.image} 
                    alt={reward.name} 
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.target.onerror = null;
                      e.target.src = 'https://via.placeholder.com/300x200?text=Reward';
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-td-tonal dark:bg-gray-600 text-td-forest dark:text-green-200" aria-hidden="true">
                    {/* Out of reach: only the icon fades; the label stays readable */}
                    {reward.category === 'data' ? (
                      <svg className={`w-12 h-12 ${userPoints >= reward.pointsCost ? '' : 'opacity-50'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" /></svg>
                    ) : (
                      <svg className={`w-12 h-12 ${userPoints >= reward.pointsCost ? '' : 'opacity-50'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                    )}
                    <span className="mt-2 text-sm font-semibold uppercase tracking-wide">{reward.category === 'data' ? 'Data bundle' : 'Airtime'}</span>
                  </div>
                )}
              </div>
              
              <div className="p-4">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="text-lg font-medium text-td-ink dark:text-white">{reward.name}</h3>
                  <span className="bg-primary/10 dark:bg-primary-dark/20 text-primary dark:text-primary-light text-sm px-2 py-1 rounded-full">
                    {reward.pointsCost.toLocaleString()} Points
                  </span>
                </div>
                
                <p className="text-sm text-td-sage dark:text-gray-300 mb-4">
                  {reward.description}
                </p>
                
                {/* Only rewards with an end date say when they expire */}
                {reward.expiresAt && !Number.isNaN(new Date(reward.expiresAt).getTime()) && (
                  <div className="text-xs text-td-sage dark:text-gray-300 mb-4">
                    Expires: {new Date(reward.expiresAt).toLocaleDateString()}
                  </div>
                )}
                
                {redeemSuccess && redeemSuccess.id === reward.id ? (
                  <div className="bg-green-100 dark:bg-green-900/30 border border-green-400 dark:border-green-700 text-green-700 dark:text-green-300 p-3 rounded-md text-sm">
                    <p>{redeemSuccess.message}</p>
                    {redeemSuccess.code && <p className="font-mono font-bold mt-1">{redeemSuccess.code}</p>}
                  </div>
                ) : (
                  <button
                    onClick={() => (isMobileReward(reward) ? openRedeemDialog(reward) : handleRedeemReward(reward))}
                    disabled={isRedeeming || userPoints < reward.pointsCost}
                    className={`w-full px-4 py-2 text-sm font-medium rounded-md ${
                      userPoints >= reward.pointsCost 
                        ? 'bg-primary hover:bg-primary-dark text-white' 
                        : 'bg-gray-300 dark:bg-gray-600 text-td-sage dark:text-gray-300 cursor-not-allowed'
                    }`}
                  >
                    {isRedeeming ? (
                      <LoadingSpinner size="sm" color="white" />
                    ) : userPoints >= reward.pointsCost ? (
                      'Redeem Reward'
                    ) : (
                      `Need ${(reward.pointsCost - userPoints).toLocaleString()} more points`
                    )}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        
        {rewards.length === 0 && !isLoading && (
          <div className="text-center py-12">
            <p className="text-td-sage dark:text-gray-300">No rewards available at this time.</p>
          </div>
        )}
      </div>
      
      {/* Recent Redemptions */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
        <h2 className="text-xl font-bold text-td-ink dark:text-white mb-4">My Redemptions</h2>
        
        {isRedemptionsLoading ? (
          <div className="py-8 text-center">
            <LoadingSpinner size="md" />
          </div>
        ) : recentRedemptions.length > 0 ? (
          <div className="space-y-4">
            {recentRedemptions.map(redemption => (
              <div key={redemption.id} className="flex items-center p-4 bg-td-cream dark:bg-gray-700 rounded-lg">
                {redemption.rewardImage && (
                  <img 
                    src={redemption.rewardImage} 
                    alt={redemption.rewardName}
                    className="w-16 h-16 object-cover rounded-lg mr-4"
                  />
                )}
                <div className="flex-1">
                  <h3 className="font-semibold text-td-ink dark:text-white">{redemption.rewardName}</h3>
                  {redemption.phone ? (
                    <p className="text-sm text-td-sage dark:text-gray-300">To {formatGhanaPhone(redemption.phone)}{redemption.network ? ` · ${redemption.network}` : ''}</p>
                  ) : (
                    <p className="text-sm text-td-sage dark:text-gray-300">{redemption.rewardDescription}</p>
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 mt-2">
                    <span className="text-sm text-td-sage dark:text-gray-300">
                      Redeemed on {redemption.redeemedAt}
                    </span>
                    <div className="flex items-center whitespace-nowrap">
                      <span className="text-sm font-medium text-red-700 dark:text-red-300">
                        -{redemption.pointsSpent} points
                      </span>
                      <span className={`ml-2 px-2 py-1 text-xs rounded-full ${(STATUS_LABELS[redemption.status] || STATUS_LABELS.pending).className}`}>
                        {(STATUS_LABELS[redemption.status] || { text: redemption.status }).text}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-td-sage dark:text-gray-300">You haven't redeemed any rewards yet.</p>
            <p className="text-td-sage dark:text-gray-300 mt-1">Redeem a reward to see it here.</p>
          </div>
        )}
      </div>
      
      {/* Where the points came from: listed once, in Activity */}
      <Link
        to="/activity"
        className="flex items-center justify-between bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md text-td-ink dark:text-white hover:bg-td-cream dark:hover:bg-gray-700"
      >
        <span>
          <span className="block font-semibold">How you earned your points</span>
          <span className="block text-sm text-td-sage dark:text-gray-300 mt-1">Every pickup, report, scan and redemption is in Activity</span>
        </span>
        <svg className="w-5 h-5 flex-shrink-0 ml-3 text-td-forest dark:text-green-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </Link>
      </div>

      {confirmReward && (
        <RedeemDialog
          reward={confirmReward}
          defaultPhone={profilePhone}
          busy={isRedeeming}
          serverError={errorMessage}
          onCancel={() => setConfirmReward(null)}
          onConfirm={(delivery) => handleRedeemReward(confirmReward, delivery)}
        />
      )}
    </div>
  );
};

export default Rewards;
