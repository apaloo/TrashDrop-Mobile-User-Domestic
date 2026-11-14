import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext.js';
import LoadingSpinner from '../components/LoadingSpinner.js';
import supabase from '../utils/supabaseClient.js';
import { Link } from 'react-router-dom';
import { subscribeToRewardsUpdates, handleRewardsUpdate } from '../utils/realtime.js';
import { userService } from '../services/userService.js';
import RedeemDialog from '../components/rewards/RedeemDialog.js';
import { formatGhanaPhone } from '../utils/ghanaPhone.js';
import { nextReward, pointsLevel, pointsToCedis } from '../utils/rewardsMath.js';
import PageHeader from '../components/ui/PageHeader.js';
import { connectionProblem } from '../utils/connectionProblem.js';
import { readLastKnown, saveLastKnown } from '../utils/lastKnown.js';
import { useReloadWhenBack } from '../hooks/useReloadWhenBack.js';
import { card, errorNote, infoNote, primaryButton, sectionTitle } from '../components/ui/styles.js';

// Airtime and data rewards: sent by TrashDrop staff to a phone number
const isMobileReward = (reward) => ['airtime', 'data'].includes(reward?.category);

const STATUS_LABELS = {
  pending: { text: 'Pending', className: 'bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-200' },
  sent: { text: 'Sent', className: 'bg-td-tonal text-td-forest-dk dark:bg-green-900/50 dark:text-green-200' },
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
  const [isLoading, setIsLoading] = useState(true); // Rewards list still loading
  const [pointsLoading, setPointsLoading] = useState(true); // Balance still loading
  const [isRedemptionsLoading, setIsRedemptionsLoading] = useState(true);
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [redeemSuccess, setRedeemSuccess] = useState(null);
  const [confirmReward, setConfirmReward] = useState(null);
  const [profilePhone, setProfilePhone] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  // No connection: showing the last saved copy and reloading by itself
  const [waitingForConnection, setWaitingForConnection] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);
  // The server answered with a failure: which parts couldn't load
  const [loadProblems, setLoadProblems] = useState({ balance: false, rewards: false, redemptions: false });
  const waitingRef = useRef(false);
  const mountedRef = useRef(true);
  const isLoadingRef = useRef(false);

  const fetchRecentRedemptions = async (limit = 5) => {
    if (!user) return false;
    
    if (!waitingRef.current) setIsRedemptionsLoading(true);
    // Returns 'connection' or 'server' when it couldn't load, otherwise false
    const showSavedRedemptions = (problem) => {
      setRecentRedemptions(readLastKnown('redemptions', user.id) || []);
      return connectionProblem(problem) ? 'connection' : 'server';
    };
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
        return showSavedRedemptions(error);
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
        // The saved copy leaves out the phone number
        saveLastKnown('redemptions', user.id, formattedRedemptions.map(r => ({ ...r, phone: '' })));
        console.log(`[Rewards] Found ${formattedRedemptions.length} recent redemptions`);
      } else {
        setRecentRedemptions([]);
        saveLastKnown('redemptions', user.id, []);
      }
      return false;
    } catch (error) {
      console.error('Error fetching recent redemptions:', error);
      return showSavedRedemptions(error);
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
    // Balance, rewards list and redemptions load at the same time, and the
    // page shows straight away: each part fills in when its data arrives.
    // They used to load one after another behind a full-page spinner.
    const fetchRewardsData = async () => {
      if (!user) return;
      
      // Prevent concurrent loads
      if (isLoadingRef.current) {
        console.log('[Rewards] Already loading, skipping duplicate fetch');
        return;
      }
      
      isLoadingRef.current = true;
      // Quiet reloads keep what's on screen instead of flashing spinners
      if (!waitingRef.current) {
        setIsLoading(true);
        setPointsLoading(true);
      }
      setErrorMessage('');
      let couldNotConnect = false;
      const problems = { balance: false, rewards: false, redemptions: false };

      const loadPoints = async () => {
        let balanceKnown = true;
        try {
          const statsResult = await userService.getUserStats(user.id);
          if (!mountedRef.current) return;
          if (statsResult.error) {
            console.warn('Error fetching user stats:', statsResult.error);
            if (connectionProblem(statsResult.error)) couldNotConnect = true;
            else problems.balance = true;
            // Never show 0 for a balance we just couldn't fetch
            const saved = readLastKnown('points', user.id);
            if (saved === null) balanceKnown = false;
            else setUserPoints(saved);
          } else {
            setUserPoints(statsResult.data.points || 0);
            saveLastKnown('points', user.id, statsResult.data.points || 0);
          }
        } finally {
          if (mountedRef.current && balanceKnown) setPointsLoading(false);
        }
      };

      const loadRewards = async () => {
        try {
          const { data: rewardsData, error: rewardsError } = await supabase
            .from('rewards')
            .select('*')
            .eq('active', true)
            .order('points_cost', { ascending: true })
            .order('name', { ascending: true });
          if (!mountedRef.current) return;
          if (rewardsError) {
            console.warn('Error fetching rewards:', rewardsError);
            if (connectionProblem(rewardsError)) couldNotConnect = true;
            else problems.rewards = true;
            setRewards(readLastKnown('rewards', user.id) || []);
          } else {
            const loadedRewards = (rewardsData || []).map(reward => ({
              id: reward.id,
              name: reward.name,
              description: reward.description,
              pointsCost: reward.points_cost,
              image: reward.image_url || '',
              expiresAt: reward.expires_at,
              partnerId: reward.partner_id,
              category: reward.category
            }));
            setRewards(loadedRewards);
            saveLastKnown('rewards', user.id, loadedRewards);
          }
        } finally {
          if (mountedRef.current) setIsLoading(false);
        }
      };

      try {
        const [, , redemptionsProblem] = await Promise.all([loadPoints(), loadRewards(), fetchRecentRedemptions()]);
        if (redemptionsProblem === 'connection') couldNotConnect = true;
        if (redemptionsProblem === 'server') problems.redemptions = true;
      } catch (error) {
        console.error('Error fetching rewards data:', error);
        if (connectionProblem(error)) couldNotConnect = true;
        else problems.rewards = true;
      } finally {
        isLoadingRef.current = false;
        // Either way the retries run quietly, keeping what's on screen
        waitingRef.current = couldNotConnect || problems.balance || problems.rewards || problems.redemptions;
        if (mountedRef.current) {
          setWaitingForConnection(couldNotConnect);
          setLoadProblems(problems);
        }
      }
    };
    
    fetchRewardsData();
  }, [user?.id, reloadTick]);

  useReloadWhenBack(
    waitingForConnection || loadProblems.balance || loadProblems.rewards || loadProblems.redemptions,
    () => setReloadTick(tick => tick + 1)
  );

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
      // The server checks the reward's cost and the balance, then records the
      // request (td_redeem_reward); the points spent are the database's, not ours
      const { data: redemptionData, error: redemptionError } = await supabase.rpc('td_redeem_reward', {
        p_reward_id: reward.id,
        // Where staff send airtime or data
        p_phone: delivery?.phone || null,
        p_network: delivery?.network || null,
      });

      if (redemptionError) {
        const err = new Error(redemptionError.message);
        err.fromServer = true;
        throw err;
      }
      
      console.log('[Rewards] Successfully recorded reward redemption:', redemptionData);
      
      // td_redeem_reward also records it in the activity list, with the
      // server's figures (TD68); the app writes nothing about points itself
      
      // Update local state and show it under My Redemptions (the server's balance)
      const balanceAfter = Number(redemptionData?.balance_after);
      setUserPoints(prev => (Number.isFinite(balanceAfter) ? balanceAfter : prev - reward.pointsCost));
      fetchRecentRedemptions();
      
      // Show success message
      setConfirmReward(null);
      setRedeemSuccess(delivery ? {
        id: reward.id,
        message: `Request received. We'll send ${reward.name} to ${formatGhanaPhone(delivery.phone)} (${delivery.network}).`,
      } : {
        id: reward.id,
        // No reference code: the one shown here used to be made up in the
        // browser and stored nowhere, so staff could never look it up
        // (2026-11-14). The redemption is listed under My Redemptions.
        message: `Successfully redeemed ${reward.name}! You'll find it under My Redemptions.`,
      });
    } catch (error) {
      console.error('Error redeeming reward:', error);
      // The server's own reason ("Not enough points for this reward") when it refused
      setErrorMessage(error?.fromServer && error.message ? error.message : 'Failed to redeem reward. Please try again.');
    } finally {
      setIsRedeeming(false);
    }
  };

  const next = nextReward(userPoints);

  return (
    <div className="max-w-3xl mx-auto px-2 pb-24 space-y-5">
      <PageHeader
        title="My Rewards"
        subtitle="Earn points by requesting pickups, scanning QR codes, and reporting illegal dumping (once your report is verified)."
      />

      {/* Balance, in the dashboard's Rewards card style */}
      <section aria-label="Your points" className="relative overflow-hidden rounded-3xl bg-td-forest text-white px-5 py-5">
        <span className="absolute -top-16 -right-16 w-56 h-56 rounded-full border-[28px] border-white/10" aria-hidden="true" />
        <div className="relative flex items-start justify-between gap-3">
          <p className="text-[13px] font-bold uppercase tracking-wide text-white/90">Your balance</p>
          {!pointsLoading && (
            <span className="rounded-full bg-td-lime px-3 py-1 text-[13px] font-bold text-td-ink">Level {pointsLevel(userPoints)}</span>
          )}
        </div>
        <p className="relative mt-2 flex items-baseline gap-2" aria-busy={pointsLoading}>
          {pointsLoading && loadProblems.balance ? (
            <span className="text-[44px] leading-none font-bold" aria-label="Balance unavailable">—</span>
          ) : pointsLoading ? (
            <span className="inline-block h-11 w-28 rounded-xl bg-white/20 animate-pulse" aria-label="Loading your points" />
          ) : (
            <span className="text-[44px] leading-none font-bold">{userPoints.toLocaleString()}</span>
          )}
          <span className="text-lg font-semibold">Points</span>
        </p>
        <p className="relative mt-1 text-[15px] text-white/90">{pointsLoading ? (loadProblems.balance ? "Couldn't check your balance" : 'Checking your balance...') : `Worth GH₵${pointsToCedis(userPoints)} in airtime or data`}</p>
        <div
          className="relative mt-4 h-2 rounded-full bg-white/20 overflow-hidden"
          role="progressbar"
          aria-label={next.top ? 'Enough points for the biggest reward' : `Progress to GH₵${next.cedis} airtime`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(next.progress * 100)}
        >
          <span className="block h-full rounded-full bg-td-lime" style={{ width: `${Math.round(next.progress * 100)}%` }} />
        </div>
        <p className="relative mt-2 text-[13px] text-white/90">
          {pointsLoading ? '\u00a0' : next.top
            ? `You can redeem any reward, up to GH₵${next.cedis}`
            : `${next.remaining.toLocaleString()} more points to GH₵${next.cedis} airtime`}
        </p>
      </section>

      {/* Error message */}
      {(loadProblems.balance || loadProblems.rewards || loadProblems.redemptions) && (
        <div className={`${errorNote} px-4 py-3`} role="alert">
          <p className="text-[15px]">We couldn't load everything on this page. We'll keep trying.</p>
        </div>
      )}

      {errorMessage && (
        <div className={`${errorNote} px-4 py-3`} role="alert">
          <p className="text-[15px]">{errorMessage}</p>
        </div>
      )}

      {/* Rewards list */}
      <section aria-labelledby="available-rewards" className={`${card} px-4 pt-3.5 pb-2`}>
        <h2 id="available-rewards" className={sectionTitle}>Available Rewards</h2>

        {isLoading && (
          <ul className="mt-1" aria-label="Loading rewards">
            {[0, 1, 2].map(i => (
              <li key={i} className={`flex gap-3 py-3.5 ${i === 0 ? '' : 'border-t border-td-border dark:border-gray-700'}`}>
                <span className="w-11 h-11 rounded-xl bg-td-cream dark:bg-gray-700 animate-pulse flex-shrink-0" />
                <span className="flex-1 space-y-2">
                  <span className="block h-4 w-2/3 rounded bg-td-cream dark:bg-gray-700 animate-pulse" />
                  <span className="block h-3 w-1/2 rounded bg-td-cream dark:bg-gray-700 animate-pulse" />
                </span>
              </li>
            ))}
          </ul>
        )}
        <ul className="mt-1">
          {rewards.map((reward, i) => {
            const affordable = !pointsLoading && userPoints >= reward.pointsCost;
            return (
              <li key={reward.id} className={`py-3.5 ${i === 0 ? '' : 'border-t border-td-border dark:border-gray-700'}`}>
                <div className="flex items-start gap-3">
                  {reward.image ? (
                    <img
                      src={reward.image}
                      alt=""
                      className={`w-11 h-11 rounded-xl object-cover flex-shrink-0 ${affordable ? '' : 'opacity-60'}`}
                      onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = 'https://via.placeholder.com/300x200?text=Reward';
                      }}
                    />
                  ) : (
                    <span className="w-11 h-11 rounded-xl bg-td-tonal text-td-forest dark:bg-green-900/40 dark:text-green-300 flex items-center justify-center flex-shrink-0" aria-hidden="true">
                      {reward.category === 'data' ? (
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" /></svg>
                      ) : (
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                      )}
                    </span>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-[15px] font-bold text-td-ink dark:text-gray-100 leading-snug">{reward.name}</h3>
                      <span className="flex-shrink-0 text-[15px] font-bold text-td-forest dark:text-green-300">
                        {reward.pointsCost.toLocaleString()}<span className="text-xs font-semibold"> pts</span>
                      </span>
                    </div>
                    <p className="text-[13px] text-td-sage dark:text-gray-300 mt-0.5">{reward.description}</p>
                    {/* Only rewards with an end date say when they expire */}
                    {reward.expiresAt && !Number.isNaN(new Date(reward.expiresAt).getTime()) && (
                      <p className="text-xs text-td-sage dark:text-gray-300 mt-1">
                        Expires: {new Date(reward.expiresAt).toLocaleDateString()}
                      </p>
                    )}

                    {redeemSuccess && redeemSuccess.id === reward.id ? (
                      <div className={`${infoNote} mt-2.5 px-3 py-2.5 text-sm`} role="status">
                        <p>{redeemSuccess.message}</p>
                      </div>
                    ) : (
                      <button
                        onClick={() => (isMobileReward(reward) ? openRedeemDialog(reward) : handleRedeemReward(reward))}
                        disabled={isRedeeming || pointsLoading || !affordable}
                        className={`mt-2.5 ${affordable ? `${primaryButton} h-10 px-5 text-[15px]` : 'inline-flex items-center h-10 px-4 rounded-full bg-td-cream dark:bg-gray-700 text-td-sage dark:text-gray-300 text-sm font-semibold cursor-not-allowed'}`}
                      >
                        {isRedeeming ? (
                          <LoadingSpinner size="sm" color="white" />
                        ) : pointsLoading ? (
                          'Checking points...'
                        ) : affordable ? (
                          'Redeem Reward'
                        ) : (
                          `Need ${(reward.pointsCost - userPoints).toLocaleString()} more points`
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        {rewards.length === 0 && !isLoading && (
          <p className="text-center py-10 text-td-sage dark:text-gray-300">
            {waitingForConnection ? "Rewards will appear when you're back online." : loadProblems.rewards ? "Rewards couldn't load." : 'No rewards available at this time.'}
          </p>
        )}
      </section>

      {/* Recent Redemptions */}
      <section aria-labelledby="my-redemptions" className={`${card} px-4 pt-3.5 pb-2`}>
        <h2 id="my-redemptions" className={sectionTitle}>My Redemptions</h2>

        {isRedemptionsLoading ? (
          <div className="py-8 text-center">
            <LoadingSpinner size="md" />
          </div>
        ) : recentRedemptions.length > 0 ? (
          <ul className="mt-1">
            {recentRedemptions.map((redemption, i) => (
              <li key={redemption.id} className={`flex items-start gap-3 py-3 ${i === 0 ? '' : 'border-t border-td-border dark:border-gray-700'}`}>
                {redemption.rewardImage ? (
                  <img src={redemption.rewardImage} alt="" className="w-10 h-10 object-cover rounded-xl flex-shrink-0" />
                ) : (
                  <span className="w-10 h-10 rounded-xl bg-td-tonal text-td-forest dark:bg-green-900/40 dark:text-green-300 flex items-center justify-center flex-shrink-0" aria-hidden="true">
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="9" r="6" /><path d="M9 14l-2 7 5-3 5 3-2-7" /></svg>
                  </span>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-[15px] font-semibold text-td-ink dark:text-gray-100 leading-snug">{redemption.rewardName}</h3>
                    <span className="flex-shrink-0 text-[15px] font-bold text-td-ink dark:text-gray-100">
                      −{Number(redemption.pointsSpent).toLocaleString()}<span className="sr-only"> points</span>
                    </span>
                  </div>
                  {redemption.phone ? (
                    <p className="text-[13px] text-td-sage dark:text-gray-300">To {formatGhanaPhone(redemption.phone)}{redemption.network ? ` · ${redemption.network}` : ''}</p>
                  ) : (
                    <p className="text-[13px] text-td-sage dark:text-gray-300">{redemption.rewardDescription}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
                    <span className="text-[13px] text-td-sage dark:text-gray-300">Redeemed on {redemption.redeemedAt}</span>
                    <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${(STATUS_LABELS[redemption.status] || STATUS_LABELS.pending).className}`}>
                      {(STATUS_LABELS[redemption.status] || { text: redemption.status }).text}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : waitingForConnection || loadProblems.redemptions ? (
          <p className="text-center py-8 text-td-sage dark:text-gray-300">
            {waitingForConnection ? "Your redemptions will appear when you're back online." : "Your redemptions couldn't load."}
          </p>
        ) : (
          <div className="text-center py-8">
            <p className="text-td-sage dark:text-gray-300">You haven't redeemed any rewards yet.</p>
            <p className="text-td-sage dark:text-gray-300 mt-1">Redeem a reward to see it here.</p>
          </div>
        )}
      </section>

      {/* Where the points came from: listed once, in Activity */}
      <Link
        to="/activity"
        className={`${card} flex items-center justify-between px-4 py-4 text-td-ink dark:text-gray-100 hover:bg-td-cream dark:hover:bg-gray-700`}
      >
        <span>
          <span className="block text-[15px] font-bold">How you earned your points</span>
          <span className="block text-[13px] text-td-sage dark:text-gray-300 mt-0.5">Every pickup, report, scan and redemption is in Activity</span>
        </span>
        <svg className="w-5 h-5 flex-shrink-0 ml-3 text-td-forest dark:text-green-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </Link>

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
