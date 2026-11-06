import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { primaryButton, secondaryButton } from './styles.js';

/**
 * "Trouble signing in?" bottom sheet: slides up from the bottom of the screen
 * with large buttons for the ways back in, like a phone app's action sheet.
 */
const SignInHelpSheet = ({ email, onClose, onGoogle }) => {
  const closeRef = useRef(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[99999] flex items-end justify-center">
      <style>{`
        @keyframes td-sheet-up { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @media (prefers-reduced-motion: no-preference) { .td-sheet { animation: td-sheet-up 220ms ease-out; } }
      `}</style>
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-black/50"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="signin-help-title"
        className="td-sheet relative w-full max-w-md rounded-t-3xl bg-white px-5 pt-3 dark:bg-gray-800"
        style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
      >
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-gray-300 dark:bg-gray-600" aria-hidden="true" />
        <h2 id="signin-help-title" className="text-xl font-bold text-td-ink dark:text-gray-100">
          Trouble signing in?
        </h2>
        {email && (
          <p className="mt-1 text-[15px] text-td-sage dark:text-gray-300">
            For <span className="font-medium text-td-ink break-all dark:text-gray-100">{email}</span>
          </p>
        )}

        <div className="mt-5 flex flex-col gap-3">
          <Link to="/reset-password" state={{ email }} className={`${primaryButton} w-full`}>
            Reset password
          </Link>
          <button type="button" onClick={onGoogle} className={`${secondaryButton} w-full`}>
            <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.07H2.18A11 11 0 0 0 1 12c0 1.78.43 3.45 1.18 4.93l3.66-2.84z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
            </svg>
            I signed up with Google
          </button>
          <Link to="/register" className={`${secondaryButton} w-full`}>
            Create a new account
          </Link>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="h-12 w-full text-[15px] font-semibold text-td-forest dark:text-green-300"
          >
            Try again
          </button>
        </div>
      </div>
    </div>
  );
};

export default SignInHelpSheet;
