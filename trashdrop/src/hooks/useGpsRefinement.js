import { useState, useEffect, useRef } from 'react';
import GeolocationService from '../utils/geolocationService.js';

/**
 * Hook for background GPS refinement
 * Continuously polls for better GPS accuracy while the form is being filled
 * Stops when isActive becomes false (e.g., on summary page)
 */
const useGpsRefinement = ({
  isActive = true,
  initialLatitude = null,
  initialLongitude = null,
  initialAccuracy = null,
  onImprovedPosition,
  pollInterval = 5000
}) => {
  // Refinement status
  const [isRefining, setIsRefining] = useState(false);
  const [refinementCount, setRefinementCount] = useState(0);
  
  // Use refs for everything to avoid re-render loops
  const bestAccuracyRef = useRef(initialAccuracy);
  const bestPositionRef = useRef({ latitude: initialLatitude, longitude: initialLongitude, accuracy: initialAccuracy });
  const intervalRef = useRef(null);
  const isActiveRef = useRef(isActive);
  const onImprovedPositionRef = useRef(onImprovedPosition);
  const hasStartedRef = useRef(false);
  const isMountedRef = useRef(true);
  const consecutiveFailuresRef = useRef(0);
  const MAX_CONSECUTIVE_FAILURES = 3;
  
  // Keep refs in sync with props (without triggering re-renders)
  useEffect(() => {
    isActiveRef.current = isActive;
    onImprovedPositionRef.current = onImprovedPosition;
  });
  
  // Sync initial values when they first become available
  useEffect(() => {
    if (initialLatitude && initialLongitude && !bestPositionRef.current.latitude) {
      console.log('[GPS Refinement] Initial coordinates received:', { initialLatitude, initialLongitude, initialAccuracy });
      bestPositionRef.current = { latitude: initialLatitude, longitude: initialLongitude, accuracy: initialAccuracy };
      bestAccuracyRef.current = initialAccuracy;
    }
  }, [initialLatitude, initialLongitude, initialAccuracy]);
  
  // Single effect to manage the polling lifecycle
  useEffect(() => {
    isMountedRef.current = true;
    
    const stopPolling = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };

    const refinePosition = async () => {
      if (!isActiveRef.current || !isMountedRef.current) return;
      
      // Stop if too many consecutive failures
      if (consecutiveFailuresRef.current >= MAX_CONSECUTIVE_FAILURES) {
        console.log('[GPS Refinement] Stopping - too many consecutive failures');
        stopPolling();
        return;
      }
      
      setIsRefining(true);
      
      try {
        const result = await GeolocationService.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        });
        
        if (!isMountedRef.current) return;
        
        if (result.success && result.coords) {
          const { latitude, longitude, accuracy } = result.coords;
          
          // Reset failure counter on success
          consecutiveFailuresRef.current = 0;
          
          // Only update if this reading is more accurate
          if (accuracy && (bestAccuracyRef.current === null || accuracy < bestAccuracyRef.current)) {
            console.log(`[GPS Refinement] ✓ Better accuracy: ${accuracy}m (was ${bestAccuracyRef.current}m)`);
            
            const newPosition = { latitude, longitude, accuracy };
            bestPositionRef.current = newPosition;
            bestAccuracyRef.current = accuracy;
            setRefinementCount(prev => prev + 1);
            
            // Notify parent
            if (onImprovedPositionRef.current) {
              onImprovedPositionRef.current(newPosition);
            }
          }
        } else {
          // GPS failed
          consecutiveFailuresRef.current++;
          console.warn(`[GPS Refinement] Failed (${consecutiveFailuresRef.current}/${MAX_CONSECUTIVE_FAILURES})`);
        }
      } catch (error) {
        consecutiveFailuresRef.current++;
        console.warn(`[GPS Refinement] Error (${consecutiveFailuresRef.current}/${MAX_CONSECUTIVE_FAILURES}):`, error.message);
      } finally {
        if (isMountedRef.current) {
          setIsRefining(false);
        }
      }
    };
    
    const startPolling = () => {
      if (intervalRef.current || !isActiveRef.current) return;
      if (!bestPositionRef.current.latitude || !bestPositionRef.current.longitude) return;
      
      if (!hasStartedRef.current) {
        console.log('[GPS Refinement] Starting polling every', pollInterval, 'ms');
        hasStartedRef.current = true;
      }
      
      // Start polling
      intervalRef.current = setInterval(refinePosition, pollInterval);
      
      // Initial refinement after short delay
      setTimeout(() => {
        if (isActiveRef.current && isMountedRef.current) {
          refinePosition();
        }
      }, 2000);
    };
    
    // Start or stop based on isActive
    if (isActive && initialLatitude && initialLongitude) {
      startPolling();
    } else {
      stopPolling();
      if (!isActive) {
        hasStartedRef.current = false;
      }
    }
    
    return () => {
      isMountedRef.current = false;
      stopPolling();
    };
  }, [isActive, initialLatitude, initialLongitude, pollInterval]);
  
  return {
    bestPosition: bestPositionRef.current,
    isRefining,
    lastUpdate: null,
    refinementCount,
    triggerRefinement: () => {}
  };
};

export default useGpsRefinement;
