import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';
import LoadingSpinner from '../components/LoadingSpinner.js';

/**
 * ResetPassword page component for password recovery
 */
const ResetPassword = () => {
  const { resetPassword } = useAuth();
  
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');
    setIsSubmitting(true);
    
    try {
      const { success, error } = await resetPassword(email);
      
      if (success) {
        setSuccessMessage('Password reset link sent! Please check your email.');
        setEmail('');
      } else {
        setError(error || 'Failed to send password reset email');
      }
    } catch (err) {
      setError('An unexpected error occurred');
      console.error('Reset password error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen px-4 py-12 bg-gray-50" style={{ backgroundColor: '#f9fafb', minHeight: '100vh' }}>
      <div className="w-full max-w-md p-8 space-y-6 bg-white rounded-lg shadow-lg" style={{ backgroundColor: '#ffffff' }}>
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <img src="/logo.svg" alt="TrashDrop Logo" className="w-16 h-16" />
          </div>
          <h1 className="text-3xl font-bold text-primary dark:text-primary-light">Reset Password</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-300">
            Enter your email address and we'll send you a link to reset your password.
          </p>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
            <span className="block sm:inline">{error}</span>
          </div>
        )}

        {successMessage && (
          <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded relative" role="alert">
            <span className="block sm:inline">{successMessage}</span>
          </div>
        )}

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Email Address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-primary focus:border-primary dark:bg-gray-700 dark:text-white"
              placeholder="your.email@example.com"
            />
          </div>

          <div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-primary hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {isSubmitting ? <LoadingSpinner size="sm" color="white" /> : 'Send Reset Link'}
            </button>
          </div>
        </form>
        
        <div className="text-center mt-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Remembered your password?{' '}
            <Link to="/login" className="font-medium text-primary hover:text-primary-dark dark:text-primary-light dark:hover:text-primary">
              Back to Login
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
