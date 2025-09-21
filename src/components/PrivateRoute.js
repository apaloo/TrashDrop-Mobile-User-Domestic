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

  // Show loading spinner while auth is loading OR during initial state with stored data
  if (isLoading || (status === 'INITIAL' && hasStoredUser)) {
    if (process.env.NODE_ENV === 'development') {
      console.log('[PrivateRoute] Showing loading spinner - auth loading or initial with stored user');
    }
    return (
      <div className="flex justify-center items-center h-screen">
        <LoadingSpinner size="lg" />
      </div>
    );
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
  
  // Final check: if we have stored user data but auth state is not yet updated, wait a bit more
  if (hasStoredUser && status !== 'UNAUTHENTICATED') {
    if (process.env.NODE_ENV === 'development') {
      console.log('[PrivateRoute] Has stored user but auth not finalized, showing loading');
    }
    return (
      <div className="flex justify-center items-center h-screen">
        <LoadingSpinner size="lg" />
      </div>
    );
  }
  
  // Redirect to login only after all checks fail
  if (process.env.NODE_ENV === 'development') {
    console.log('[PrivateRoute] All checks failed, redirecting to login');
  }
  return <Navigate to="/login" replace />;
};

export default PrivateRoute;
