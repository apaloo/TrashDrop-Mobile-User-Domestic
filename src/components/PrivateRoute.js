import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';
import LoadingSpinner from './LoadingSpinner.js';

/**
 * PrivateRoute component to protect routes that require authentication
 * Redirects to login page if user is not authenticated
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Child components to render if authenticated
 */
const PrivateRoute = ({ children }) => {
  const { isAuthenticated, isLoading, user, status } = useAuth();
  
  // Special case for test account in development
  const isTestAccount = process.env.NODE_ENV === 'development' && user?.email === 'prince02@mailinator.com';
  
  // Check for stored user data
  const hasStoredUser = !!localStorage.getItem('trashdrop_user');
  const hasStoredToken = !!localStorage.getItem('trashdrop_auth_token');
  
  // Debug logging (development only)
  if (process.env.NODE_ENV === 'development') {
    console.log('[PrivateRoute] Auth state:', {
      status,
      isAuthenticated,
      isLoading,
      hasUser: !!user,
      userEmail: user?.email,
      isTestAccount,
      hasStoredUser,
      hasStoredToken
    });
  }

  // NEVER show loading spinner if user has stored credentials
  // Even during explicit LOADING state - this prevents intermediate screens
  if (isLoading && status === 'LOADING' && !hasStoredUser) {
    if (process.env.NODE_ENV === 'development') {
      console.log('[PrivateRoute] No stored user - showing loading spinner during auth');
    }
    return (
      <div className="flex justify-center items-center h-screen">
        <LoadingSpinner size="lg" />
      </div>
    );
  } else if (isLoading && hasStoredUser) {
    // Skip loading entirely for users with stored credentials
    if (process.env.NODE_ENV === 'development') {
      console.log('[PrivateRoute] Has stored user - SKIPPING loading spinner, rendering content immediately');
    }
    // Continue rendering children even during loading
  }

  // In development mode, be more permissive with stored user data
  if (process.env.NODE_ENV === 'development' && hasStoredUser) {
    if (process.env.NODE_ENV === 'development') {
      console.log('[PrivateRoute] Development mode - granting access with stored user');
    }
    return children;
  }

  // Allow access if authenticated or test account
  if (isTestAccount || isAuthenticated) {
    if (process.env.NODE_ENV === 'development') {
      console.log('[PrivateRoute] Access granted - authenticated or test account');
    }
    return children;
  }
  
  // If we have stored user and not explicitly unauthenticated, grant access
  // This prevents loading screens when credentials exist
  if (hasStoredUser && hasStoredToken && status !== 'UNAUTHENTICATED') {
    if (process.env.NODE_ENV === 'development') {
      console.log('[PrivateRoute] Has stored credentials - granting immediate access');
    }
    return children;
  }
  
  // Redirect to login only after all checks fail
  if (process.env.NODE_ENV === 'development') {
    console.log('[PrivateRoute] All checks failed, redirecting to login');
  }
  return <Navigate to="/login" replace />;
};

export default PrivateRoute;
