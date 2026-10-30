import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';
import { GOOGLE_CLIENT_ID, loadGoogleIdentity, makeNonce } from '../utils/googleIdentity.js';

/**
 * Social login buttons component - Google only (Apple hidden for now)
 */
const SocialLogin = ({ isSubmitting = false, onError = null }) => {
  const { signInWithGoogle, signInWithGoogleIdToken } = useAuth();
  const navigate = useNavigate();
  const googleButtonRef = useRef(null);
  // Google's own button when a Google client ID is set (utils/googleIdentity.js);
  // the redirect button otherwise, or if Google's script can't load
  const [useGoogleButton, setUseGoogleButton] = useState(Boolean(GOOGLE_CLIENT_ID));
  // Latest handlers, so Google is set up once per page (a new set-up would
  // also mean a new one-time nonce)
  const handlers = useRef({});
  handlers.current = { navigate, onError, signInWithGoogleIdToken };

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const [gsi, nonce] = await Promise.all([loadGoogleIdentity(), makeNonce()]);
        if (cancelled || !googleButtonRef.current) return;
        gsi.initialize({
          client_id: GOOGLE_CLIENT_ID,
          nonce: nonce.hashed,
          ux_mode: 'popup',
          use_fedcm_for_button: true,
          callback: async ({ credential }) => {
            const { navigate: go, onError: fail, signInWithGoogleIdToken: signIn } = handlers.current;
            const result = await signIn(credential, nonce.raw);
            if (result?.success) go('/dashboard');
            else if (fail) fail(result?.error?.message || 'Failed to sign in with Google');
          },
        });
        gsi.renderButton(googleButtonRef.current, {
          type: 'standard',
          theme: document.documentElement.classList.contains('dark') ? 'filled_black' : 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'rectangular',
          logo_alignment: 'center',
          width: Math.min(400, googleButtonRef.current.offsetWidth || 320),
        });
      } catch (error) {
        console.warn('[SocialLogin] Google button unavailable, using the redirect:', error);
        if (!cancelled) setUseGoogleButton(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleGoogleSignIn = async () => {
    try {
      const result = await signInWithGoogle();
      if (!result.success && onError) {
        onError(result.error?.message || 'Failed to sign in with Google');
      }
    } catch (error) {
      console.error('[SocialLogin] Google sign-in error:', error);
      if (onError) {
        onError('Failed to sign in with Google. Please try again.');
      }
    }
  };

  return (
    <div className="mt-6">
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-td-border-strong dark:border-gray-600" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="px-2 bg-white dark:bg-gray-800 text-td-sage dark:text-gray-400">
            Or continue with Google
          </span>
        </div>
      </div>

      {useGoogleButton ? (
        <div className="mt-6 flex justify-center" aria-busy={isSubmitting}>
          <div ref={googleButtonRef} className="w-full max-w-[400px] flex justify-center min-h-[44px]" data-testid="google-button" />
        </div>
      ) : (
      <div className="mt-6">
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={isSubmitting}
          className="w-full inline-flex justify-center items-center py-3 px-4 border border-td-border-strong dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-800 text-sm font-medium text-td-ink dark:text-gray-200 hover:bg-td-cream dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 hover:shadow-md"
        >
          <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          Continue with Google
        </button>
      </div>
      )}
    </div>
  );
};

export default SocialLogin;
