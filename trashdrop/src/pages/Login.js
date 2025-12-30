import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';
import LoadingSpinner from '../components/LoadingSpinner.js';

/**
 * Login page component
 */
const Login = () => {
  const navigate = useNavigate();
  const { signIn, isLoading, resendConfirmationEmail } = useAuth();
  
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showResendButton, setShowResendButton] = useState(false);
  const [resendMessage, setResendMessage] = useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  console.log('[Login] Login component rendering');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setShowResendButton(false);
    setResendMessage('');
    setIsSubmitting(true);
    
    try {
      console.log('[Login] Attempting to sign in with:', { 
        email: formData.email,
        passwordLength: formData.password ? formData.password.length : 0 
      });
      
      const result = await signIn(formData.email, formData.password);
      console.log('[Login] Sign in result:', { 
        success: result?.success, 
        hasError: !!result?.error,
        user: result?.user ? 'Present' : 'Missing'
      });
      
      if (result?.success) {
        console.log('[Login] Sign in successful, navigating to dashboard...');
        // Add a slight delay to ensure state updates propagate
        setTimeout(() => {
          navigate('/dashboard');
        }, 100);
      } else {
        console.error('[Login] Sign in failed:', result?.error);
        setError(result?.error?.message || 'Failed to sign in');
        
        // Show resend button if email is not confirmed
        const errorMessage = result?.error?.originalMessage || result?.error?.message || '';
        if (errorMessage.includes('email_not_confirmed') || errorMessage.includes('Email not confirmed')) {
          setShowResendButton(true);
        }
      }
    } catch (err) {
      console.error('[Login] Unexpected error during sign in:', err);
      setError('An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendConfirmation = async () => {
    setResendMessage('');
    setIsSubmitting(true);
    
    try {
      const result = await resendConfirmationEmail(formData.email);
      
      if (result?.success) {
        setResendMessage(result.message || 'Verification email sent! Please check your inbox.');
        setError('');
        setShowResendButton(false);
      } else {
        setResendMessage(result?.error || 'Failed to resend verification email');
      }
    } catch (err) {
      console.error('[Login] Error resending confirmation:', err);
      setResendMessage('An error occurred while resending the verification email');
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
          <h1 className="text-3xl font-bold text-primary">Welcome Back</h1>
          <p className="mt-2 text-gray-600">Sign in to your TrashDrop account</p>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
            <span className="block sm:inline">{error}</span>
          </div>
        )}

        {showResendButton && (
          <div className="bg-blue-50 border border-blue-400 px-4 py-3 rounded">
            <p className="text-sm text-blue-700 mb-2">
              Haven't received the verification email?
            </p>
            <button
              type="button"
              onClick={handleResendConfirmation}
              disabled={isSubmitting}
              className="text-sm font-medium text-primary hover:text-primary-dark underline disabled:opacity-50"
            >
              Resend Verification Email
            </button>
          </div>
        )}

        {resendMessage && (
          <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded relative" role="alert">
            <span className="block sm:inline">{resendMessage}</span>
          </div>
        )}

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email Address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={formData.email}
                onChange={handleChange}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-primary focus:border-primary bg-white text-gray-900"
                style={{ backgroundColor: '#ffffff', color: '#111827' }}
                placeholder="your.email@example.com"
              />
            </div>
            
            <div>
              <div className="flex justify-between">
                <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                  Password
                </label>
                <Link to="/reset-password" className="text-sm text-primary hover:underline">
                  Forgot password?
                </Link>
              </div>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={formData.password}
                onChange={handleChange}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-primary focus:border-primary bg-white text-gray-900"
                style={{ backgroundColor: '#ffffff', color: '#111827' }}
                placeholder="••••••••"
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <input
                id="remember-me"
                name="remember-me"
                type="checkbox"
                className="h-4 w-4 text-primary focus:ring-primary border-gray-300 rounded"
              />
              <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-700">
                Remember me
              </label>
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={isSubmitting || isLoading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-primary hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {isSubmitting || isLoading ? <LoadingSpinner size="sm" color="white" /> : 'Sign in'}
            </button>
          </div>
        </form>
        
        <div className="text-center mt-4">
          <p className="text-sm text-gray-600">
            Don't have an account?{' '}
            <Link to="/register" className="font-medium text-primary hover:text-primary-dark">
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
