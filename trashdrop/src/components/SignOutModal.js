import React from 'react';

/**
 * Custom modal for sign out confirmation
 * Replaces browser's native confirm() dialog
 */
const SignOutModal = ({ isOpen, onClose, onConfirm, isSigningOut }) => {
  if (!isOpen) return null;

  console.log('[SignOutModal] Rendering modal, isOpen:', isOpen);

  return (
    <div className="fixed inset-0 z-[99999] overflow-y-auto" style={{zIndex: 99999, backgroundColor: 'rgba(0,0,0,0.5)'}}>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={onClose}
      ></div>
      
      {/* Modal Container */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6 transform transition-all border-4 border-red-500" style={{border: '4px solid red'}}>
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          
          {/* Modal Content */}
          <div className="text-center">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 dark:bg-red-900 mb-4">
              <svg className="h-6 w-6 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </div>
            
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              Sign Out Confirmation
            </h3>
            
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              Are you sure you want to sign out? You'll need to sign in again to access your account.
            </p>
            
            <div className="flex space-x-3">
              <button
                onClick={onClose}
                disabled={isSigningOut}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-600 disabled:opacity-50"
              >
                Cancel
              </button>
              
              <button
                onClick={onConfirm}
                disabled={isSigningOut}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSigningOut ? (
                  <>
                    <svg className="animate-spin h-4 w-4 mr-1 inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
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
