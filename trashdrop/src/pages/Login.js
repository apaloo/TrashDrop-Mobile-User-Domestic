import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';
import LoadingSpinner from '../components/LoadingSpinner.js';
import SocialLogin from '../components/SocialLogin.js';
import { FiAlertCircle, FiWifiOff } from 'react-icons/fi';
import { rememberedSignIn } from '../utils/rememberMe.js';
import { CONNECTION_MESSAGES } from '../utils/connectionProblem.js';

/**
 * Login page component
 */
const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn, isLoading, resendConfirmationEmail } = useAuth();
  // Arriving from sign-up: the new account's email still needs confirming
  const fromSignUp = location.state?.awaitingConfirmation ? location.state.email : '';
  
  // Ticked by default; the email from the last "Remember me" sign-in is filled in
  const [remembered] = useState(rememberedSignIn);
  const [formData, setFormData] = useState({
    email: fromSignUp || remembered.email,
    password: '',
  });
  const [error, setError] = useState('');
  // 'offline' | 'unreachable' | 'slow' | 'server' when the connection, not the account, failed
  const [connection, setConnection] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showResendButton, setShowResendButton] = useState(Boolean(fromSignUp));
  const [resendMessage, setResendMessage] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(remembered.remember);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  console.log('[Login] Login component rendering');

  const submit = async () => {
    setError('');
    setConnection(null);
    setShowResendButton(false);
    setResendMessage('');
    setIsSubmitting(true);
    
    try {
      console.log('[Login] Attempting to sign in with:', { 
        email: formData.email,
        passwordLength: formData.password ? formData.password.length : 0 
      });
      
      const result = await signIn(formData.email, formData.password, rememberMe);
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
        if (result?.error?.connection) {
          setConnection(result.error.connection);
          return;
        }
        // Enhanced error message handling
        const isUnconfirmed = (error) => {
          const errorMessage = error?.originalMessage || error?.message || '';
          return error?.code === 'email_not_confirmed' ||
            errorMessage.includes('email_not_confirmed') || errorMessage.includes('Email not confirmed');
        };
        const getErrorMessage = (error) => {
          const errorMessage = error?.originalMessage || error?.message || '';
          
          if (isUnconfirmed(error)) {
            return `Your email address isn't confirmed yet. Open the link we sent to ${formData.email} to finish signing up, then sign in.`;
          }
          if (errorMessage.includes('Invalid login credentials') || errorMessage.includes('invalid')) {
            return 'Incorrect email or password. Please check your credentials and try again.';
          }
          if (errorMessage.includes('User not found')) {
            return 'No account found with this email address. Would you like to create an account?';
          }
          if (errorMessage.includes('Too many requests') || errorMessage.includes('rate limit')) {
            return 'Too many login attempts. Please wait a few minutes and try again.';
          }
          return 'Unable to sign in. Please check your credentials and try again.';
        };
        
        setError(getErrorMessage(result?.error));
        
        // Show resend button if email is not confirmed
        if (isUnconfirmed(result?.error)) {
          setShowResendButton(true);
        }
      }
    } catch (err) {
      console.error('[Login] Unexpected error during sign in:', err);
      setError('Something went wrong. Please refresh the page and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    submit();
  };

  // Offline: sign in by itself the moment the phone reconnects
  const submitRef = useRef(submit);
  submitRef.current = submit;
  useEffect(() => {
    if (connection !== 'offline') return undefined;
    const retry = () => submitRef.current();
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, [connection]);

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
    <div className="flex items-center justify-center min-h-screen px-4 py-12 bg-td-cream dark:bg-gray-900">
      <div className="w-full max-w-md p-8 space-y-6 bg-white rounded-2xl border border-td-border dark:bg-gray-800 dark:border-gray-700">
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <img src="/logo.svg" alt="TrashDrop Logo" className="w-16 h-16 rounded-xl" />
          </div>
          <h1 className="text-3xl font-bold text-td-ink dark:text-gray-100">Welcome Back</h1>
          <p className="mt-2 text-td-sage dark:text-gray-300">Sign in to your TrashDrop account</p>
        </div>

        {connection && (
          <div className="flex gap-3 rounded-2xl border border-td-border bg-td-cream px-4 py-3 dark:bg-gray-900 dark:border-gray-700" role="alert">
            {connection === 'server' ? (
              <FiAlertCircle aria-hidden="true" className="mt-0.5 h-5 w-5 flex-shrink-0 text-td-orange-text dark:text-amber-300" />
            ) : (
              <FiWifiOff aria-hidden="true" className="mt-0.5 h-5 w-5 flex-shrink-0 text-td-orange-text dark:text-amber-300" />
            )}
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-td-ink dark:text-gray-100">{CONNECTION_MESSAGES[connection].title}</p>
              <p className="mt-0.5 text-sm text-td-sage dark:text-gray-300">{CONNECTION_MESSAGES[connection].message}</p>
              {connection === 'offline' ? (
                <p className="mt-2 text-sm font-medium text-td-forest dark:text-green-300">Waiting for a connection…</p>
              ) : (
                <button
                  type="button"
                  onClick={submit}
                  disabled={isSubmitting}
                  className="mt-2 text-sm font-semibold text-td-forest underline underline-offset-2 hover:text-td-forest-dk disabled:opacity-50 dark:text-green-300"
                >
                  {isSubmitting ? 'Trying again…' : 'Try again'}
                </button>
              )}
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-td-error dark:bg-red-950/40 dark:border-red-900 dark:text-red-300" role="alert">
            {error}
          </div>
        )}

        {fromSignUp && !error && (
          <div className="bg-td-tonal px-4 py-3 rounded-2xl text-sm text-td-forest-dk dark:bg-green-900/30 dark:text-green-200" role="status">
            Confirm your email first: open the link we sent to <span className="font-semibold break-all">{fromSignUp}</span>, then sign in here.
          </div>
        )}

        {showResendButton && (
          <div className="bg-td-tonal border border-td-border px-4 py-3 rounded-2xl dark:border-gray-700 dark:bg-green-900/30">
            <p className="text-sm text-td-forest-dk mb-2 dark:text-green-200">
              Haven't received the confirmation email? Check your spam folder, or get a new link.
            </p>
            <button
              type="button"
              onClick={handleResendConfirmation}
              disabled={isSubmitting}
              className="text-sm font-medium text-primary hover:text-primary-dark underline disabled:opacity-50 dark:text-green-300"
            >
              Resend Verification Email
            </button>
          </div>
        )}

        {resendMessage && (
          <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded relative dark:bg-green-900/40 dark:text-green-200 dark:border-green-700" role="alert">
            <span className="block sm:inline">{resendMessage}</span>
          </div>
        )}

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-td-ink dark:text-gray-100">
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
                className="mt-1 block w-full px-3 py-2 border border-td-border-strong rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-primary focus:border-primary bg-white text-td-ink dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600"
                placeholder="your.email@example.com"
              />
            </div>
            
            <div>
              <div className="flex justify-between">
                <label htmlFor="password" className="block text-sm font-medium text-td-ink dark:text-gray-100">
                  Password
                </label>
                <Link to="/reset-password" className="text-sm text-primary hover:underline dark:text-green-300">
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={formData.password}
                  onChange={handleChange}
                  className="mt-1 block w-full px-3 py-2 pr-10 border border-td-border-strong rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-primary focus:border-primary bg-white text-td-ink dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                >
                  {showPassword ? (
                    <svg className="h-5 w-5 text-td-sage dark:text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="h-5 w-5 text-td-sage dark:text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center">
              <input
                id="remember-me"
                name="remember-me"
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-4 w-4 text-primary focus:ring-primary border-td-border-strong rounded dark:border-gray-600 dark:text-green-300"
              />
              <label htmlFor="remember-me" className="ml-2 block text-sm text-td-ink dark:text-gray-100">
                Remember me
              </label>
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
        
        {/* Social Login */}
        <SocialLogin isSubmitting={isSubmitting} onError={setError} />
        
        <div className="text-center mt-4">
          <p className="text-sm text-td-sage dark:text-gray-300">
            Don't have an account?{' '}
            <Link to="/register" className="font-medium text-primary hover:text-primary-dark dark:text-green-300">
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
