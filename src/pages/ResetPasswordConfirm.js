import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';
import LoadingSpinner from '../components/LoadingSpinner.js';
import supabase from '../utils/supabaseClient.js';

/**
 * ResetPasswordConfirm page component for setting new password after email confirmation
 */
const ResetPasswordConfirm = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { signIn } = useAuth();
  
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isValidating, setIsValidating] = useState(true);
  const [isValidToken, setIsValidToken] = useState(false);

  // Extract tokens from URL parameters
  const accessToken = searchParams.get('access_token');
  const refreshToken = searchParams.get('refresh_token');
  const type = searchParams.get('type');

  useEffect(() => {
    const validateTokens = async () => {
      if (!accessToken || !refreshToken || type !== 'recovery') {
        setError('Invalid or missing reset link. Please request a new password reset.');
        setIsValidating(false);
        return;
      }

      try {
        // Set the session with the tokens from the URL
        const { data, error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken
        });

        if (error) {
          console.error('[ResetPasswordConfirm] Session error:', error);
          setError('Invalid or expired reset link. Please request a new password reset.');
        } else {
          console.log('[ResetPasswordConfirm] Session set successfully');
          setIsValidToken(true);
        }
      } catch (err) {
        console.error('[ResetPasswordConfirm] Validation error:', err);
        setError('An error occurred while validating your reset link.');
      } finally {
        setIsValidating(false);
      }
    };

    validateTokens();
  }, [accessToken, refreshToken, type]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    // Validation
    if (password.length < 6) {
      setError('Password must be at least 6 characters long');
      return;
    }
    
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      // Update the user's password
      const { error } = await supabase.auth.updateUser({
        password: password
      });
      
      if (error) {
        console.error('[ResetPasswordConfirm] Password update error:', error);
        setError(error.message || 'Failed to update password');
        return;
      }
      
      console.log('[ResetPasswordConfirm] Password updated successfully');
      
      // Get the current user to sign them in
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user) {
        // Navigate to dashboard with success message
        navigate('/dashboard', { 
          state: { 
            message: 'Password updated successfully! You are now signed in.',
            type: 'success'
          },
          replace: true 
        });
      } else {
        // If no user, redirect to login with success message
        navigate('/login', { 
          state: { 
            message: 'Password updated successfully! Please sign in with your new password.',
            type: 'success'
          },
          replace: true 
        });
      }
      
    } catch (err) {
      console.error('[ResetPasswordConfirm] Unexpected error:', err);
      setError('An unexpected error occurred while updating your password');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Show loading while validating tokens
  if (isValidating) {
    return (
      <div className="flex items-center justify-center min-h-screen px-4 py-12 bg-gray-50 dark:bg-gray-900">
        <div className="w-full max-w-md p-8 space-y-6 bg-white dark:bg-gray-800 rounded-lg shadow-lg text-center">
          <LoadingSpinner size="lg" />
          <p className="text-gray-600 dark:text-gray-300">Validating reset link...</p>
        </div>
      </div>
    );
  }

  // Show error if invalid token
  if (!isValidToken) {
    return (
      <div className="flex items-center justify-center min-h-screen px-4 py-12 bg-gray-50 dark:bg-gray-900">
        <div className="w-full max-w-md p-8 space-y-6 bg-white dark:bg-gray-800 rounded-lg shadow-lg">
          <div className="text-center">
            <div className="flex justify-center mb-4">
              <img src="/logo.svg" alt="TrashDrop Logo" className="w-16 h-16" />
            </div>
            <h1 className="text-3xl font-bold text-red-600 dark:text-red-400">Invalid Reset Link</h1>
          </div>

          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
            <span className="block sm:inline">{error}</span>
          </div>

          <div className="text-center">
            <button
              onClick={() => navigate('/reset-password')}
              className="w-full py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-primary hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
            >
              Request New Reset Link
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Show password reset form
  return (
    <div className="flex items-center justify-center min-h-screen px-4 py-12 bg-gray-50 dark:bg-gray-900">
      <div className="w-full max-w-md p-8 space-y-6 bg-white dark:bg-gray-800 rounded-lg shadow-lg">
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <img src="/logo.svg" alt="TrashDrop Logo" className="w-16 h-16" />
          </div>
          <h1 className="text-3xl font-bold text-primary dark:text-primary-light">Set New Password</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-300">
            Enter your new password below.
          </p>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
            <span className="block sm:inline">{error}</span>
          </div>
        )}

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              New Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-primary focus:border-primary dark:bg-gray-700 dark:text-white"
              placeholder="Enter new password"
              minLength={6}
            />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Confirm New Password
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-primary focus:border-primary dark:bg-gray-700 dark:text-white"
              placeholder="Confirm new password"
              minLength={6}
            />
          </div>

          <div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-primary hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {isSubmitting ? <LoadingSpinner size="sm" color="white" /> : 'Update Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ResetPasswordConfirm;
