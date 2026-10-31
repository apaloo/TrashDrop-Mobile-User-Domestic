import React from 'react';

/**
 * Custom modal for sign out confirmation
 * Replaces browser's native confirm() dialog
 */
const SignOutModal = ({ isOpen, onClose, onConfirm, isSigningOut }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[99999] overflow-y-auto" style={{ zIndex: 99999 }}>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 transition-opacity"
        onClick={onClose}
      ></div>

      {/* Modal Container */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="sign-out-title"
          aria-describedby="sign-out-text"
          className="relative bg-white dark:bg-gray-800 rounded-3xl shadow-2xl max-w-sm w-full px-6 pt-7 pb-6"
        >
          {/* Close button */}
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute top-3 right-3 w-9 h-9 rounded-full flex items-center justify-center text-td-sage dark:text-gray-300 hover:bg-td-cream dark:hover:bg-gray-700"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Modal Content */}
          <div className="text-center">
            <div className="mx-auto flex items-center justify-center h-14 w-14 rounded-2xl bg-red-50 text-red-700 dark:bg-red-900/40 dark:text-red-300 mb-4" aria-hidden="true">
              <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </div>

            <h3 id="sign-out-title" className="text-[20px] font-bold text-td-ink dark:text-gray-100 mb-2">
              Sign Out Confirmation
            </h3>

            <p id="sign-out-text" className="text-[15px] text-td-sage dark:text-gray-300 mb-6">
              Are you sure you want to sign out? You'll need to sign in again to access your account.
            </p>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                onClick={onClose}
                disabled={isSigningOut}
                className="h-12 rounded-full border-[1.5px] border-td-border-strong dark:border-gray-500 text-[15px] font-semibold text-td-ink dark:text-gray-100 hover:bg-td-cream dark:hover:bg-gray-700 disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                onClick={onConfirm}
                disabled={isSigningOut}
                className="h-12 rounded-full bg-red-700 hover:bg-red-800 text-[15px] font-bold text-white inline-flex items-center justify-center disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isSigningOut ? (
                  <>
                    <svg className="animate-spin h-4 w-4 mr-1.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Signing out...
                  </>
                ) : (
                  'Sign Out'
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SignOutModal;
