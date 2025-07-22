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
  const { isAuthenticated, isLoading, user } = useAuth();
  
  // Special case for test account in development
  const isTestAccount = process.env.NODE_ENV === 'development' && user?.email === 'prince02@mailinator.com';

  // Show loading spinner while checking authentication status
  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  // Allow access for test account in development or if properly authenticated
  if (isTestAccount || isAuthenticated) {
    return children;
  }
  
  // Redirect to login for all other cases
  return <Navigate to="/login" replace />;
};

export default PrivateRoute;
