import React, { useState } from 'react';
import { primaryButton, secondaryButton } from './ui/styles.js';

/**
 * Shown after sign-up when the account still needs its email confirmed.
 * Stays open until the user chooses to go on, so it cannot be missed.
 */
const CheckEmailModal = ({ email, onResend, onContinue }) => {
  const [resendState, setResendState] = useState('idle'); // idle | sending | sent | failed
  const [resendError, setResendError] = useState('');

  const handleResend = async () => {
    setResendState('sending');
    setResendError('');
    try {
      const result = await onResend();
      if (result?.success) {
        setResendState('sent');
      } else {
        setResendState('failed');
        setResendError(result?.error || 'The email could not be sent. Please try again in a minute.');
      }
    } catch (err) {
      setResendState('failed');
      setResendError('The email could not be sent. Please try again in a minute.');
    }
  };

  return (
    <div className="fixed inset-0 z-[99999] overflow-y-auto">
      <div className="fixed inset-0 bg-black/50" aria-hidden="true"></div>
      <div className="flex min-h-full items-center justify-center p-4">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="check-email-title"
          aria-describedby="check-email-text"
          className="relative bg-white dark:bg-gray-800 rounded-3xl shadow-2xl max-w-sm w-full px-6 pt-7 pb-6 text-center"
        >
          <div className="mx-auto flex items-center justify-center h-14 w-14 rounded-2xl bg-td-tonal text-td-forest dark:bg-green-900/40 dark:text-green-300 mb-4" aria-hidden="true">
            <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h2 id="check-email-title" className="text-[20px] font-bold text-td-ink dark:text-gray-100 mb-2">
            Check your email to finish signing up
          </h2>
          <div id="check-email-text" className="text-[15px] text-td-sage dark:text-gray-300 space-y-2">
            <p>
              We sent a confirmation link to <span className="font-semibold text-td-ink dark:text-gray-100 break-all">{email}</span>.
            </p>
            <p>Open it to activate your account, then sign in. You can't sign in until you do.</p>
            <p className="text-sm">No email after a few minutes? Check your spam or junk folder.</p>
          </div>

          {resendState === 'sent' && (
            <p className="mt-3 text-sm font-semibold text-td-forest dark:text-green-300" role="status">
              A new link is on its way.
            </p>
          )}
          {resendState === 'failed' && (
            <p className="mt-3 text-sm text-red-700 dark:text-red-300" role="alert">{resendError}</p>
          )}

          <div className="grid grid-cols-1 gap-2.5 mt-5">
            <button type="button" autoFocus onClick={onContinue} className={primaryButton}>
              Go to Sign In
            </button>
            <button
              type="button"
              onClick={handleResend}
              disabled={resendState === 'sending' || resendState === 'sent'}
              className={secondaryButton}
            >
              {resendState === 'sending' ? 'Sending...' : 'Resend email'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CheckEmailModal;
