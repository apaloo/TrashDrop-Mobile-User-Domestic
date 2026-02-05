import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';
import LoadingSpinner from '../components/LoadingSpinner.js';
import toastService from '../services/toastService.js';

/**
 * AuthCallback page handles email verification redirects from Supabase
 * When a user clicks the verification link in their email, they are redirected here
 */
const AuthCallback = () => {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading } = useAuth();
  const [status, setStatus] = useState('verifying'); // verifying, success, error
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    // Supabase automatically processes the URL tokens when detectSessionInUrl is true
    // We just need to wait for the auth state to update and then redirect
    
    const handleCallback = async () => {
      // Check URL for error parameters
      const urlParams = new URLSearchParams(window.location.search);
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      
      const error = urlParams.get('error') || hashParams.get('error');
      const errorDescription = urlParams.get('error_description') || hashParams.get('error_description');
      
      if (error) {
        console.error('[AuthCallback] Error in URL:', error, errorDescription);
        setStatus('error');
        setErrorMessage(errorDescription || 'Email verification failed. Please try again.');
        return;
      }
      
      // Give Supabase time to process the tokens and update auth state
      // The onAuthStateChange listener in AuthContext will handle the session
      const timeout = setTimeout(() => {
        if (!isAuthenticated && !isLoading) {
          // If still not authenticated after timeout, show success anyway
          // (email is verified but user needs to log in)
          setStatus('success');
          toastService.success(
            '✅ Email verified successfully! Please sign in to continue.',
            { duration: 5000 }
          );
          setTimeout(() => navigate('/login'), 2000);
        }
      }, 3000);
      
      return () => clearTimeout(timeout);
    };
    
    handleCallback();
  }, [isLoading]);

  useEffect(() => {
    // If user becomes authenticated, redirect to dashboard
    if (isAuthenticated && status === 'verifying') {
      setStatus('success');
      toastService.success(
        '🎉 Welcome! Your email has been verified and you are now signed in.',
        { duration: 5000 }
      );
      setTimeout(() => navigate('/dashboard'), 1500);
    }
  }, [isAuthenticated, status, navigate]);

  return (
    <div className="flex items-center justify-center min-h-screen px-4 py-12 bg-gray-50" style={{ backgroundColor: '#f9fafb', minHeight: '100vh' }}>
      <div className="w-full max-w-md p-8 space-y-6 bg-white rounded-lg shadow-lg text-center" style={{ backgroundColor: '#ffffff' }}>
        <div className="flex justify-center mb-4">
          <img src="/logo.svg" alt="TrashDrop Logo" className="w-16 h-16" />
        </div>
        
        {status === 'verifying' && (
          <>
            <h1 className="text-2xl font-bold text-primary">Verifying Your Email</h1>
            <p className="text-gray-600 mt-2">Please wait while we verify your email address...</p>
            <div className="flex justify-center mt-6">
              <LoadingSpinner size="lg" />
            </div>
          </>
        )}
        
        {status === 'success' && (
          <>
            <div className="text-6xl mb-4">✅</div>
            <h1 className="text-2xl font-bold text-green-600">Email Verified!</h1>
            <p className="text-gray-600 mt-2">
              Your email has been successfully verified.
              {isAuthenticated 
                ? ' Redirecting to your dashboard...' 
                : ' Redirecting to login...'}
            </p>
            <div className="flex justify-center mt-6">
              <LoadingSpinner size="sm" />
            </div>
          </>
        )}
        
        {status === 'error' && (
          <>
            <div className="text-6xl mb-4">❌</div>
            <h1 className="text-2xl font-bold text-red-600">Verification Failed</h1>
            <p className="text-gray-600 mt-2">{errorMessage}</p>
            <div className="mt-6 space-y-3">
              <button
                onClick={() => navigate('/login')}
                className="w-full py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-primary hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
              >
                Go to Login
              </button>
              <button
                onClick={() => navigate('/register')}
                className="w-full py-2 px-4 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
              >
                Register Again
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default AuthCallback;
