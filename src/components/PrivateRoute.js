import React, { useEffect, useState, useRef } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';
import LoadingSpinner from './LoadingSpinner.js';
import { isPwaMode } from '../utils/pwaHelpers.js';

/**
 * PrivateRoute component to protect routes that require authentication
 * Redirects to login page if user is not authenticated
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Child components to render if authenticated
 */
const PrivateRoute = ({ children }) => {
  const { isAuthenticated, isLoading, user, status, checkSession } = useAuth();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshAttempted, setRefreshAttempted] = useState(false);
  const [initialRenderComplete, setInitialRenderComplete] = useState(false);
  const [pwaMode, setPwaMode] = useState(false);
  const refreshTimeoutRef = useRef(null);
  const recoveryAttemptedRef = useRef(false);
  
  // Special case for test account in development
  const isTestAccount = process.env.NODE_ENV === 'development' && user?.email === 'prince02@mailinator.com';
  
  // Check for stored user data
  const hasStoredUser = \!\!localStorage.getItem('trashdrop_user');
  const hasStoredToken = \!\!localStorage.getItem('trashdrop_auth_token');
  
  // Check if we're in PWA mode
  useEffect(() => {
    setPwaMode(isPwaMode());
  }, []);
  
  // Debug logging (development only)
  if (process.env.NODE_ENV === 'development') {
    console.log('[PrivateRoute] Auth state:', {
      status,
      isAuthenticated,
      isLoading,
      isRefreshing,
      refreshAttempted,
      initialRenderComplete,
      hasUser: \!\!user,
      userEmail: user?.email,
      isTestAccount,
      hasStoredUser,
      hasStoredToken,
      pwaMode
    });
  }

  // Mark initial render as complete after a short delay
  useEffect(() => {
    const timer = setTimeout(() => {
      setInitialRenderComplete(true);
    }, 500);
    
    return () => clearTimeout(timer);
  }, []);

  // Try to refresh the session if we have stored credentials but aren't authenticated yet
  useEffect(() => {
    const attemptSessionRefresh = async () => {
      // Only attempt refresh if we have stored credentials but aren't authenticated
      if (hasStoredUser && hasStoredToken && \!isAuthenticated && \!isLoading && \!refreshAttempted) {
        console.log('[PrivateRoute] Attempting to refresh session with stored credentials');
        setIsRefreshing(true);
        
        try {
          // Clear any existing timeout
          if (refreshTimeoutRef.current) {
            clearTimeout(refreshTimeoutRef.current);
          }
          
          // Set a timeout to prevent infinite loading
          refreshTimeoutRef.current = setTimeout(() => {
            console.log('[PrivateRoute] Session refresh timeout - using stored credentials');
            setIsRefreshing(false);
            setRefreshAttempted(true);
          }, 5000); // 5 second timeout
          
          await checkSession(true);
          
          // Clear the timeout if successful
          clearTimeout(refreshTimeoutRef.current);
        } catch (error) {
          console.error('[PrivateRoute] Session refresh failed:', error);
        } finally {
          setIsRefreshing(false);
          setRefreshAttempted(true);
          
          // Clear the timeout if it's still active
          if (refreshTimeoutRef.current) {
            clearTimeout(refreshTimeoutRef.current);
          }
        }
      }
    };

    attemptSessionRefresh();
    
    // Cleanup function
    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
    };
  }, [hasStoredUser, hasStoredToken, isAuthenticated, isLoading, refreshAttempted, checkSession]);

  // PWA-specific recovery mechanism
  useEffect(() => {
    // Only run in PWA mode
    if (\!pwaMode) return;
    
    // Only attempt recovery once
    if (recoveryAttemptedRef.current) return;
    
    // If we're in PWA mode and have stored credentials but still not authenticated after a delay
    const recoveryTimeout = setTimeout(() => {
      if (hasStoredUser && hasStoredToken && \!isAuthenticated) {
        console.log('[PrivateRoute] PWA recovery mechanism triggered');
        recoveryAttemptedRef.current = true;
        
        // Force a reload to the dashboard
        try {
          window.location.href = '/dashboard';
        } catch (e) {
          console.error('[PrivateRoute] Recovery failed:', e);
        }
      }
    }, 8000); // Give plenty of time for normal auth to work
    
    return () => clearTimeout(recoveryTimeout);
  }, [pwaMode, hasStoredUser, hasStoredToken, isAuthenticated]);

  // NEVER show loading spinner if user has stored credentials
  // Even during explicit LOADING state - this prevents intermediate screens
  if ((isLoading || isRefreshing) && \!hasStoredUser) {
    if (process.env.NODE_ENV === 'development') {
      console.log('[PrivateRoute] No stored user - showing loading spinner during auth');
    }
    return (
      <div className="flex justify-center items-center h-screen">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  // Allow access if authenticated
  if (isAuthenticated) {
    return children;
  }
  
  // IMPORTANT: Always grant access if we have stored credentials
  // This is critical for bookmarked pages and page refreshes
  if (hasStoredUser && hasStoredToken) {
    if (process.env.NODE_ENV === 'development') {
      console.log('[PrivateRoute] Has stored credentials - granting immediate access');
    }
    
    // Store the current path in sessionStorage for restoration after refresh
    try {
      const currentPath = window.location.pathname + window.location.search;
      sessionStorage.setItem('trashdrop_last_path', currentPath);
      console.log('[PrivateRoute] Stored current path for refresh restoration:', currentPath);
    } catch (e) {
      console.error('[PrivateRoute] Failed to store path:', e);
    }
    
    return children;
  }
  
  // Only redirect to login if we've attempted a refresh or have no stored credentials
  // AND initial render is complete (prevents premature redirects)
  if ((refreshAttempted || (\!hasStoredUser && \!hasStoredToken)) && initialRenderComplete) {
    if (process.env.NODE_ENV === 'development') {
      console.log('[PrivateRoute] All checks failed, redirecting to login');
    }
    return <Navigate to="/login" replace />;
  }
  
  // Show loading while we're figuring things out
  return (
    <div className="flex justify-center items-center h-screen">
      <LoadingSpinner size="lg" />
    </div>
  );
};

export default PrivateRoute;
